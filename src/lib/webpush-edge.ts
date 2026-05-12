// src/lib/webpush-edge.ts
// =====================================================================
// Edge Runtime 互換 Web Push 送信ライブラリ ★ Phase12
//
// ★ Phase12 iOS Fix v2:
//   APNs から BadWebPushTopic エラー（status 400）が返る問題を修正。
//   Apple の Web Push 実装は Topic ヘッダを RFC8030 ではなく
//   APNs プロトコルとして解釈するため、任意の文字列 Topic は拒否される。
//   → Apple endpoint では Topic ヘッダを付与しない実装に修正。
//
//   その他の修正:
//   1) HKDF-Expand を RFC5869 完全準拠に書き直し
//   2) AES-GCM パディングを RFC8291 厳密準拠
//   3) Urgency: high を Apple endpoint に自動設定
//   4) TTL 最低60秒保証
//
// 仕様参照:
//   - RFC8030: Web Push Protocol
//   - RFC8291: Message Encryption for Web Push (aes128gcm)
//   - RFC8292: VAPID
//   - RFC8188: Encrypted Content-Encoding for HTTP
//   - RFC5869: HMAC-based Extract-and-Expand Key Derivation Function
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
  // HKDF（RFC5869）— 完全準拠版
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
    const HASH_LEN = 32;
    const N = Math.ceil(length / HASH_LEN);
    if (N > 255) throw new Error('HKDF: requested length too large.');
  
    const key = await crypto.subtle.importKey(
      'raw',
      prk,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  
    let T = newU8(0);
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
  // aes128gcm Content Encoding
  // ---------------------------------------------------------------------
  
  interface EncryptedPayload {
    body: Uint8Array<ArrayBuffer>;
  }
  
  async function encryptPayload(
    payload: Uint8Array<ArrayBuffer>,
    userPublicKeyB64Url: string,
    userAuthB64Url: string,
  ): Promise<EncryptedPayload> {
    const localKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    );
  
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
  
    const sharedSecretBuf = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: userPubKey },
      localKeyPair.privateKey,
      256,
    );
    const sharedSecret = toU8(sharedSecretBuf);
  
    const localPubRawBuf = await crypto.subtle.exportKey('raw', localKeyPair.publicKey);
    const localPubRaw = toU8(localPubRawBuf);
    if (localPubRaw.length !== 65) {
      throw new Error('Local public key export size is not 65 bytes.');
    }
  
    const salt = newU8(16);
    crypto.getRandomValues(salt);
  
    const auth = base64UrlToUint8Array(userAuthB64Url);
    const prkKey = await hkdfExtract(auth, sharedSecret);
  
    const keyInfo = concatUint8Arrays(
      encodeText('WebPush: info\0'),
      userPubRaw,
      localPubRaw,
    );
    const ikm = await hkdfExpand(prkKey, keyInfo, 32);
  
    const prk = await hkdfExtract(salt, ikm);
  
    const cekInfo = encodeText('Content-Encoding: aes128gcm\0');
    const cek = await hkdfExpand(prk, cekInfo, 16);
  
    const nonceInfo = encodeText('Content-Encoding: nonce\0');
    const nonce = await hkdfExpand(prk, nonceInfo, 12);
  
    const padded = concatUint8Arrays(payload, new Uint8Array([0x02]));
  
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
    const cipher = toU8(cipherBuf);
  
    const rs = 4096;
    if (cipher.length > rs) {
      throw new Error(`Cipher length ${cipher.length} exceeds record_size ${rs}.`);
    }
    const rsBytes = newU8(4);
    new DataView(rsBytes.buffer).setUint32(0, rs, false);
  
    const idLen = new Uint8Array([localPubRaw.length]);
  
    const body = concatUint8Arrays(salt, rsBytes, idLen, localPubRaw, cipher);
  
    return { body };
  }
  
  // ---------------------------------------------------------------------
  // メイン送信関数 ★ Phase12 iOS Fix v2
  // ---------------------------------------------------------------------
  
  export async function sendWebPushEdge(
    subscription: PushSubscriptionForSend,
    vapid: VapidKeys,
    options: SendWebPushOptions = {},
  ): Promise<SendWebPushResult> {
    await importVapidPublicKey(vapid.publicKey).catch(() => {
      throw new Error('VAPID public key is invalid.');
    });
  
    const { endpoint } = subscription;
    const url = new URL(endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const isAppleEndpoint = url.host.includes('push.apple.com') || url.host.includes('icloud.com');
  
    // 1) VAPID JWT
    const jwt = await createVapidJwt(audience, vapid);
  
    // 2) ヘッダ準備
    const authHeader = `vapid t=${jwt}, k=${vapid.publicKey}`;
  
    const headers: Record<string, string> = {
      Authorization:        authHeader,
      'TTL':                String(Math.max(60, options.ttl ?? 60 * 60 * 12)),
      // Apple endpoint には Urgency: high を自動設定
      'Urgency':            options.urgency ?? (isAppleEndpoint ? 'high' : 'normal'),
    };
  
    // ★ iOS Fix v2: Apple endpoint には Topic ヘッダを付けない
    //   Apple は Topic を RFC8030 ではなく APNs プロトコルとして解釈するため、
    //   任意文字列だと BadWebPushTopic エラー（400）で拒否される。
    //   明示的にユーザーが指定した場合のみ、Apple以外の endpoint で付与する。
    if (options.topic && !isAppleEndpoint) {
      headers['Topic'] = options.topic;
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
  