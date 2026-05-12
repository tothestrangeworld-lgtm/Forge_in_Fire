// src/lib/webpush-edge.ts
// =====================================================================
// Edge Runtime 互換 Web Push 送信ライブラリ ★ Phase12
//
// Cloudflare Pages / Vercel Edge Runtime で動作させるため、Node.js 依存の
// web-push パッケージを使わず、標準 Web Crypto API で VAPID JWT 認証 +
// Aes128Gcm Content-Encoding を自前実装する。
//
// 仕様:
//   - RFC8030: Web Push Protocol
//   - RFC8291: Message Encryption for Web Push (aes128gcm)
//   - RFC8292: VAPID (Voluntary Application Server Identification)
//
// ★ TypeScript 5.7+ 対応:
//   Uint8Array がジェネリック化されたため、すべての Uint8Array 生成を
//   new ArrayBuffer(len) → new Uint8Array(buffer) パターンで統一し、
//   Uint8Array<ArrayBuffer> を保証することで Web Crypto API の
//   BufferSource パラメータへ型安全に渡せるようにしている。
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
    /** 通知ペイロード（任意の文字列。通常は JSON.stringify したもの） */
    payload?: string;
    /** TTL（秒）。Push サービス側で保持される最大時間 */
    ttl?: number;
    /** 通知の緊急度 */
    urgency?: 'very-low' | 'low' | 'normal' | 'high';
    /** トピック。同じトピックの後続通知で上書きされる */
    topic?: string;
  }
  
  export interface VapidKeys {
    publicKey:  string; // Base64URL（uncompressed P-256, 65 bytes）
    privateKey: string; // Base64URL（D値、32 bytes）
    subject:    string; // mailto:... または https://...
  }
  
  export interface SendWebPushResult {
    status:   number;
    ok:       boolean;
    body?:    string;
    /** 410/404: 購読が失効している */
    expired:  boolean;
  }
  
  // ---------------------------------------------------------------------
  // 内部ユーティリティ: ArrayBuffer 裏の Uint8Array を生成
  // ---------------------------------------------------------------------
  
  /**
   * 指定長の Uint8Array<ArrayBuffer> を生成。
   * Web Crypto の BufferSource に直接渡せる型として確定させるためのヘルパ。
   */
  function newU8(length: number): Uint8Array<ArrayBuffer> {
    return new Uint8Array(new ArrayBuffer(length));
  }
  
  /**
   * 既存の ArrayBufferLike を ArrayBuffer 裏の Uint8Array<ArrayBuffer> へコピー。
   */
  function toU8(source: Uint8Array | ArrayBuffer | ArrayBufferLike): Uint8Array<ArrayBuffer> {
    const view = source instanceof Uint8Array
      ? source
      : new Uint8Array(source as ArrayBufferLike);
    const out = newU8(view.length);
    out.set(view);
    return out;
  }
  
  // ---------------------------------------------------------------------
  // Base64URL ユーティリティ
  // ---------------------------------------------------------------------
  
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
  
  /**
   * TextEncoder().encode() の結果を Uint8Array<ArrayBuffer> として返す
   * （TextEncoder の戻り値は環境により Uint8Array<ArrayBufferLike> 型と推論される）
   */
  function encodeText(text: string): Uint8Array<ArrayBuffer> {
    return toU8(new TextEncoder().encode(text));
  }
  
  // ---------------------------------------------------------------------
  // VAPID 鍵を CryptoKey へ取り込む
  // ---------------------------------------------------------------------
  
  /**
   * 公開鍵 (Base64URL, 65 bytes uncompressed P-256) を CryptoKey に変換
   */
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
  
  /**
   * 秘密鍵 (Base64URL D値) + 公開鍵から JWK を構成して CryptoKey に変換
   */
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
    const exp     = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12時間
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
  
    // Web Crypto は IEEE P1363（r||s, 各32byte = 64byte）形式を返す
    // VAPID は IEEE P1363 をそのまま Base64URL するのが仕様（DER ではない）
    const sigB64 = uint8ArrayToBase64Url(toU8(signatureBuf));
  
    return `${signingInput}.${sigB64}`;
  }
  
  // ---------------------------------------------------------------------
  // HKDF（RFC5869）— Web Crypto API で実装
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
    const key = await crypto.subtle.importKey(
      'raw',
      prk,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    // 単一ブロックで 32byte 以下を取る用途のみ（aes128gcm 仕様で十分）
    const input = concatUint8Arrays(info, new Uint8Array([0x01]));
    const sig = await crypto.subtle.sign('HMAC', key, input);
    return toU8(sig).slice(0, length) as Uint8Array<ArrayBuffer>;
  }
  
  // ---------------------------------------------------------------------
  // aes128gcm Content Encoding（RFC8188 + RFC8291）
  // ---------------------------------------------------------------------
  
  interface EncryptedPayload {
    body: Uint8Array<ArrayBuffer>;
  }
  
  async function encryptPayload(
    payload: Uint8Array<ArrayBuffer>,
    userPublicKeyB64Url: string,  // 受信側 p256dh
    userAuthB64Url: string,        // 受信側 auth
  ): Promise<EncryptedPayload> {
    // 1) サーバー側エフェメラル鍵ペアを生成
    const localKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    );
  
    // 2) 受信者の公開鍵をインポート
    const userPubRaw = base64UrlToUint8Array(userPublicKeyB64Url);
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
  
    // 5) salt（16byte ランダム）
    const salt = newU8(16);
    crypto.getRandomValues(salt);
  
    // 6) PRK_key = HKDF-Extract(auth, sharedSecret)
    const auth = base64UrlToUint8Array(userAuthB64Url);
    const prkKey = await hkdfExtract(auth, sharedSecret);
  
    // 7) key_info = "WebPush: info\0" || ua_public || as_public
    const keyInfo = concatUint8Arrays(
      encodeText('WebPush: info\0'),
      userPubRaw,
      localPubRaw,
    );
    const ikm = await hkdfExpand(prkKey, keyInfo, 32);
  
    // 8) PRK = HKDF-Extract(salt, IKM)
    const prk = await hkdfExtract(salt, ikm);
  
    // 9) Content-Encryption Key (CEK)
    const cekInfo = encodeText('Content-Encoding: aes128gcm\0');
    const cek = await hkdfExpand(prk, cekInfo, 16);
  
    // 10) Nonce (IV)
    const nonceInfo = encodeText('Content-Encoding: nonce\0');
    const nonce = await hkdfExpand(prk, nonceInfo, 12);
  
    // 11) パディング: payload || 0x02 (delimiter, single record)
    const padded = concatUint8Arrays(payload, new Uint8Array([0x02]));
  
    // 12) AES-GCM 暗号化
    const cekKey = await crypto.subtle.importKey(
      'raw',
      cek,
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );
    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      cekKey,
      padded,
    );
    const cipher = toU8(cipherBuf);
  
    // 13) Header: salt(16) || rs(4 BE) || idlen(1) || keyid(idlen)
    //     keyid には as_public（65 bytes）を入れる
    const rs = 4096;
    const rsBytes = newU8(4);
    new DataView(rsBytes.buffer).setUint32(0, rs, false);
    const idLen = new Uint8Array([localPubRaw.length]);
  
    const body = concatUint8Arrays(salt, rsBytes, idLen, localPubRaw, cipher);
  
    return { body };
  }
  
  // ---------------------------------------------------------------------
  // メイン送信関数
  // ---------------------------------------------------------------------
  
  export async function sendWebPushEdge(
    subscription: PushSubscriptionForSend,
    vapid: VapidKeys,
    options: SendWebPushOptions = {},
  ): Promise<SendWebPushResult> {
    // importVapidPublicKey は鍵フォーマット検証に使用（戻り値は未使用）
    await importVapidPublicKey(vapid.publicKey).catch(() => {
      throw new Error('VAPID public key is invalid.');
    });
  
    const { endpoint } = subscription;
    const url = new URL(endpoint);
    const audience = `${url.protocol}//${url.host}`;
  
    // 1) VAPID JWT
    const jwt = await createVapidJwt(audience, vapid);
  
    // 2) ヘッダ準備
    const headers: Record<string, string> = {
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      'TTL':         String(options.ttl ?? 60 * 60 * 12),
      'Urgency':     options.urgency ?? 'normal',
    };
    if (options.topic) headers['Topic'] = options.topic;
  
    // 3) ペイロード暗号化
    let bodyToSend: BodyInit | undefined = undefined;
    if (options.payload && options.payload.length > 0) {
      const enc = await encryptPayload(
        encodeText(options.payload),
        subscription.keys.p256dh,
        subscription.keys.auth,
      );
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
    };
  }
  