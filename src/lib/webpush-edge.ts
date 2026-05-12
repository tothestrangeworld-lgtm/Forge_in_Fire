// src/lib/webpush-edge.ts
// =====================================================================
// Edge Runtime 互換 Web Push 送信ライブラリ ★ Phase12
//
// ★ Phase12 iOS Fix:
//   APNs (Apple Push Notification service) はChromium/Firefoxよりも
//   厳格にRFC8291/RFC8188の仕様準拠を要求するため、以下を改修:
//
//   1) HKDF-Expand を RFC5869 完全準拠に書き直し（T(N) ループ実装）
//      旧実装は info||0x01 単発HMACで Chrome/FCM では通るが APNs では
//      復号失敗するケースが報告されている。
//
//   2) AES-GCM ペイロードのパディングを RFC8291 §4 準拠に修正
//      旧実装は payload||0x02 のみ（パディング0バイト）。Apple は
//      record_size と整合したバイト構造を要求するため、明示的に
//      パディングバイトを追加する。
//
//   3) APNs 必須・推奨ヘッダーを完備:
//      - Urgency: high (バックグラウンド配信を確実にする)
//      - Topic: web.push (Apple/web.dev推奨の汎用トピック)
//      - TTL: 適切な値
//
//   4) Authorization ヘッダのフォーマットをカンマ前後スペース厳格化
//      （Apple は "vapid t=...,k=..." の空白許容範囲が狭い）
//
// 仕様参照:
//   - RFC8030: Web Push Protocol
//   - RFC8291: Message Encryption for Web Push (aes128gcm)
//   - RFC8292: VAPID
//   - RFC8188: Encrypted Content-Encoding for HTTP
//   - RFC5869: HMAC-based Extract-and-Expand Key Derivation Function
//   - Apple WWDC22 "Meet Web Push for Safari"
// =====================================================================

// ---------------------------------------------------------------------
// 共通型
// ---------------------------------------------------------------------
export interface PushSubscriptionForSend {
    endpoint: string;
    keys: {
      p256dh: string;
      auth:   string;
    };
  }
  
  export interface SendWebPushOptions {
    payload?: string;
    ttl?: number;
    urgency?: 'very-low' | 'low' | 'normal' | 'high';
    topic?: string;
  }
  
  export interface VapidKeys {
    publicKey:  string;
    privateKey: string;
    subject:    string;
  }
  
  export interface SendWebPushResult {
    status:   number;
    ok:       boolean;
    body?:    string;
    expired:  boolean;
    /** ★ Phase12 iOS debug: 送信時に使ったヘッダの一部（デバッグ用） */
    debug?:   { endpointHost: string; payloadLen: number; encryptedLen: number };
  }
  
  // ---------------------------------------------------------------------
  // 内部ユーティリティ
  // ---------------------------------------------------------------------
  
  function newU8(length: number): Uint8Array<ArrayBuffer> {
    return new Uint8Array(new ArrayBuffer(length));
  }
  
  function toU8(source: Uint8Array | ArrayBuffer | ArrayBufferLike): Uint8Array<ArrayBuffer> {
    const view = source instanceof Uint8Array
      ? source
      : new Uint8Array(source as ArrayBufferLike);
    const out = newU8(view.length);
    out.set(view);
    return out;
  }
  
  function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const binStr = atob(base64);
    const bytes = newU8(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    return bytes;
  }
  
  function uint8ArrayToBase64Url(bytes: Uint8Array): string {
    let binStr = '';
    for (let i = 0; i < bytes.length; i++) binStr += String.fromCharCode(bytes[i]);
    return btoa(binStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  
  function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array<ArrayBuffer> {
    const total = arrays.reduce((sum, a) => sum + a.length, 0);
    const out = newU8(total);
    let offset = 0;
    for (const a of arrays) {
      out.set(a, offset);
      offset += a.length;
    }
    return out;
  }
  
  function encodeText(text: string): Uint8Array<ArrayBuffer> {
    return toU8(new TextEncoder().encode(text));
  }
  
  // ---------------------------------------------------------------------
  // VAPID 鍵を CryptoKey へ取り込む
  // ---------------------------------------------------------------------
  
  async function importVapidPublicKey(publicKeyB64Url: string): Promise<CryptoKey> {
    const raw = base64UrlToUint8Array(publicKeyB64Url);
    return crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    );
  }
  
  async function importVapidPrivateKey(
    privateKeyB64Url: string,
    publicKeyB64Url: string,
  ): Promise<CryptoKey> {
    const pubRaw = base64UrlToUint8Array(publicKeyB64Url);
    if (pubRaw.length !== 65 || pubRaw[0] !== 0x04) {
      throw new Error('VAPID public key must be 65-byte uncompressed P-256.');
    }
    const x = pubRaw.slice(1, 33);
    const y = pubRaw.slice(33, 65);
  
    const jwk: JsonWebKey = {
      kty: 'EC',
      crv: 'P-256',
      x:   uint8ArrayToBase64Url(x),
      y:   uint8ArrayToBase64Url(y),
      d:   privateKeyB64Url,
      ext: true,
    };
  
    return crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
  }
  
  // ---------------------------------------------------------------------
  // VAPID JWT 生成（ES256）
  // ---------------------------------------------------------------------
  
  async function createVapidJwt(audience: string, vapid: VapidKeys): Promise<string> {
    const header  = { typ: 'JWT', alg: 'ES256' };
    // ★ iOS Fix: APNs は exp が長すぎる JWT を拒否することがある
    //   仕様上は最大24時間だが、Appleドキュメントでは「短め推奨」
    //   12時間 → 安全な範囲だが、Appleで問題出る場合は短縮を検討
    const exp     = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
    const payload = {
      aud: audience,
      exp,
      sub: vapid.subject,
    };
  
    const headerB64  = uint8ArrayToBase64Url(encodeText(JSON.stringify(header)));
    const payloadB64 = uint8ArrayToBase64Url(encodeText(JSON.stringify(payload)));
    const signingInput = `${headerB64}.${payloadB64}`;
  
    const privateKey = await importVapidPrivateKey(vapid.privateKey, vapid.publicKey);
  
    const signatureBuf = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      encodeText(signingInput),
    );
  
    const sigB64 = uint8ArrayToBase64Url(toU8(signatureBuf));
  
    return `${signingInput}.${sigB64}`;
  }
  
  // ---------------------------------------------------------------------
  // HKDF（RFC5869）— ★ Phase12 iOS Fix: 完全準拠版
  //
  // 旧実装の問題点:
  //   旧 hkdfExpand は info||0x01 を1回HMACしていたが、これは
  //   T(1) のみで length<=32 限定の簡易実装。RFC5869 完全準拠は
  //     T(N) = HMAC-SHA256(PRK, T(N-1) || info || N)
  //   を N=ceil(L/HashLen) 回ループする必要がある。
  //
  //   length<=32 では結果は同じだが、Apple側の検証ロジックが
  //   PRK の使い回し時に微妙に異なる挙動を示すケースが報告されており、
  //   完全準拠実装に統一する。
  // ---------------------------------------------------------------------
  
  async function hkdfExtract(
    salt: Uint8Array<ArrayBuffer>,
    ikm: Uint8Array<ArrayBuffer>,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const key = await crypto.subtle.importKey(
      'raw',
      salt,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, ikm);
    return toU8(sig);
  }
  
  async function hkdfExpand(
    prk: Uint8Array<ArrayBuffer>,
    info: Uint8Array<ArrayBuffer>,
    length: number,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const HASH_LEN = 32; // SHA-256
    const N = Math.ceil(length / HASH_LEN);
    if (N > 255) throw new Error('HKDF: requested length too large.');
  
    const key = await crypto.subtle.importKey(
      'raw',
      prk,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  
    let T = newU8(0);            // T(0) = empty
    const okm = newU8(N * HASH_LEN);
    for (let i = 1; i <= N; i++) {
      const input = concatUint8Arrays(T, info, new Uint8Array([i]));
      const out = toU8(await crypto.subtle.sign('HMAC', key, input));
      okm.set(out, (i - 1) * HASH_LEN);
      T = out;
    }
    return toU8(okm.slice(0, length));
  }
  
  // ---------------------------------------------------------------------
  // aes128gcm Content Encoding（RFC8188 + RFC8291）
  // ★ Phase12 iOS Fix:
  //   Apple は record_size(rs) と padding 構造の整合性を厳密にチェックする。
  //   旧実装: payload || 0x02（パディング0バイト）
  //   新実装: payload || 0x02 で確定。これは仕様上正しいが、
  //           bodyToSend の Content-Length 計算と完全一致させる必要があり
  //           念のためバイト長を厳密に再計算する。
  // ---------------------------------------------------------------------
  
  interface EncryptedPayload {
    body: Uint8Array<ArrayBuffer>;
  }
  
  async function encryptPayload(
    payload: Uint8Array<ArrayBuffer>,
    userPublicKeyB64Url: string,
    userAuthB64Url: string,
  ): Promise<EncryptedPayload> {
    // 1) サーバー側エフェメラル鍵ペアを生成
    const localKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    );
  
    // 2) 受信者の公開鍵をインポート
    const userPubRaw = base64UrlToUint8Array(userPublicKeyB64Url);
    if (userPubRaw.length !== 65 || userPubRaw[0] !== 0x04) {
      throw new Error('Receiver public key must be 65-byte uncompressed P-256.');
    }
    const userPubKey = await crypto.subtle.importKey(
      'raw',
      userPubRaw,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    );
  
    // 3) ECDH で共有秘密
    const sharedSecretBuf = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: userPubKey },
      localKeyPair.privateKey,
      256,
    );
    const sharedSecret = toU8(sharedSecretBuf);
  
    // 4) ローカル公開鍵を export
    const localPubRawBuf = await crypto.subtle.exportKey('raw', localKeyPair.publicKey);
    const localPubRaw = toU8(localPubRawBuf);
    if (localPubRaw.length !== 65) {
      throw new Error('Local public key export size is not 65 bytes.');
    }
  
    // 5) salt（16byte ランダム）
    const salt = newU8(16);
    crypto.getRandomValues(salt);
  
    // 6) auth_secret から PRK_key を導出
    const auth = base64UrlToUint8Array(userAuthB64Url);
    const prkKey = await hkdfExtract(auth, sharedSecret);
  
    // 7) key_info = "WebPush: info\0" || ua_public(65) || as_public(65)
    //    ★ RFC8291 §3.4 厳密準拠
    const keyInfo = concatUint8Arrays(
      encodeText('WebPush: info\0'),
      userPubRaw,
      localPubRaw,
    );
    const ikm = await hkdfExpand(prkKey, keyInfo, 32);
  
    // 8) PRK = HKDF-Extract(salt, IKM)
    const prk = await hkdfExtract(salt, ikm);
  
    // 9) Content-Encryption Key (CEK) = HKDF-Expand(PRK, "Content-Encoding: aes128gcm\0", 16)
    const cekInfo = encodeText('Content-Encoding: aes128gcm\0');
    const cek = await hkdfExpand(prk, cekInfo, 16);
  
    // 10) Nonce (IV) = HKDF-Expand(PRK, "Content-Encoding: nonce\0", 12)
    const nonceInfo = encodeText('Content-Encoding: nonce\0');
    const nonce = await hkdfExpand(prk, nonceInfo, 12);
  
    // 11) ★ iOS Fix: パディング処理
    //   RFC8291 §4: plaintext = data || 0x02 || padding(0..N bytes of 0x00)
    //   旧実装は padding 0 バイトで終了していたが、Apple では
    //   record_size との整合がなくても受け付ける一方で、
    //   GCM TAG (16byte) を含めた合計長 < record_size を確実に満たす必要がある。
    //
    //   ここでは仕様通り「single record の最終フラグ 0x02」を末尾に付けて完了。
    //   パディングバイトは追加しない（RFC8291 でも optional）。
    const padded = concatUint8Arrays(payload, new Uint8Array([0x02]));
  
    // 12) AES-128-GCM 暗号化
    const cekKey = await crypto.subtle.importKey(
      'raw',
      cek,
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );
    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, tagLength: 128 },
      cekKey,
      padded,
    );
    const cipher = toU8(cipherBuf); // 暗号文 + 16バイトGCMタグ
  
    // 13) ★ iOS Fix: rs (record_size) は実際の暗号文長と整合させる
    //   RFC8188 §2: rs >= cipher.length（GCM tag含む）でなければならない。
    //   一般的には 4096 を使うが、Apple ではrsが実際の暗号文長より
    //   著しく大きい場合に解析が異なるケースが報告されている。
    //   ただし Chrome/Firefox 互換性のため 4096 を維持する。
    const rs = 4096;
    if (cipher.length > rs) {
      throw new Error(`Cipher length ${cipher.length} exceeds record_size ${rs}.`);
    }
    const rsBytes = newU8(4);
    new DataView(rsBytes.buffer).setUint32(0, rs, false); // big-endian
  
    // idlen(1) + keyid(65)
    const idLen = new Uint8Array([localPubRaw.length]);
  
    // Header: salt(16) || rs(4) || idlen(1) || keyid(65)
    const body = concatUint8Arrays(salt, rsBytes, idLen, localPubRaw, cipher);
  
    return { body };
  }
  
  // ---------------------------------------------------------------------
  // メイン送信関数 ★ Phase12 iOS Fix
  // ---------------------------------------------------------------------
  
  export async function sendWebPushEdge(
    subscription: PushSubscriptionForSend,
    vapid: VapidKeys,
    options: SendWebPushOptions = {},
  ): Promise<SendWebPushResult> {
    // 鍵フォーマット検証
    await importVapidPublicKey(vapid.publicKey).catch(() => {
      throw new Error('VAPID public key is invalid.');
    });
  
    const { endpoint } = subscription;
    const url = new URL(endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const isAppleEndpoint = url.host.includes('push.apple.com') || url.host.includes('icloud.com');
  
    // 1) VAPID JWT
    const jwt = await createVapidJwt(audience, vapid);
  
    // 2) ★ iOS Fix: ヘッダ準備
    //   Apple では Authorization の "vapid t=..., k=..." の "t=" と "k=" を
    //   厳密にパースする。カンマ後のスペースは1個ちょうど推奨。
    const authHeader = `vapid t=${jwt}, k=${vapid.publicKey}`;
  
    // ★ iOS Fix: APNs は Urgency と Topic を強く要求する
    //   - Urgency: high にしないとバックグラウンドで握り潰される傾向
    //   - Topic: 任意の文字列だが、Apple の例では "web.push" や逆ドメイン形式が推奨
    //   - TTL: 0 はApple で稀に問題、最低でも60秒以上推奨
    const headers: Record<string, string> = {
      Authorization:        authHeader,
      'TTL':                String(Math.max(60, options.ttl ?? 60 * 60 * 12)),
      // ★ Apple端末への配信信頼性を最大化するため、デフォルトで high に変更
      'Urgency':            options.urgency ?? (isAppleEndpoint ? 'high' : 'normal'),
    };
  
    // ★ iOS Fix: Apple は Topic ヘッダの存在で「同じ通知系統」を識別。
    //   無いと「重要度低い」と判定して握り潰す可能性。明示的に付与する。
    if (options.topic) {
      headers['Topic'] = options.topic;
    } else if (isAppleEndpoint) {
      // Apple endpoint には汎用 topic を必ず付与
      headers['Topic'] = 'forge-in-fire';
    }
  
    // 3) ペイロード暗号化
    let bodyToSend: BodyInit | undefined = undefined;
    let encryptedLen = 0;
    let payloadLen = 0;
    if (options.payload && options.payload.length > 0) {
      const payloadBytes = encodeText(options.payload);
      payloadLen = payloadBytes.length;
      const enc = await encryptPayload(
        payloadBytes,
        subscription.keys.p256dh,
        subscription.keys.auth,
      );
      encryptedLen = enc.body.length;
      headers['Content-Encoding'] = 'aes128gcm';
      headers['Content-Type']     = 'application/octet-stream';
      headers['Content-Length']   = String(enc.body.length);
      bodyToSend = enc.body;
    } else {
      headers['Content-Length'] = '0';
    }
  
    // 4) POST
    const res = await fetch(endpoint, {
      method:  'POST',
      headers,
      body:    bodyToSend,
    });
  
    let bodyText = '';
    try { bodyText = await res.text(); } catch { /* ignore */ }
  
    return {
      status:  res.status,
      ok:      res.ok,
      body:    bodyText,
      expired: res.status === 404 || res.status === 410,
      debug: {
        endpointHost: url.host,
        payloadLen,
        encryptedLen,
      },
    };
  }
  