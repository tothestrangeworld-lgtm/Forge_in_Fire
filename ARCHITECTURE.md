# 百錬自得（Forge in Fire）アーキテクチャ設計書

> 剣道稽古記録アプリ - PWA + Next.js + Google Apps Script
> Last Updated: 2026-05-12 (Phase12 完了)

---

## 📚 目次

1. [プロジェクト概要](#プロジェクト概要)
2. [全体アーキテクチャ](#全体アーキテクチャ)
3. [技術スタック](#技術スタック)
4. [ディレクトリ構成](#ディレクトリ構成)
5. [データフロー](#データフロー)
6. [スプレッドシート（DB）スキーマ](#スプレッドシートdbスキーマ)
7. [認証システム](#認証システム)
8. [XP・レベル・段位システム](#xpレベル段位システム)
9. [PWA Push通知システム（Phase12）](#pwa-push通知システムphase12)
10. [Phase履歴](#phase履歴)
11. [運用・デプロイ](#運用デプロイ)
12. [既知の罠とトラブルシューティング](#既知の罠とトラブルシューティング)

---

## プロジェクト概要

**百錬自得（Forge in Fire）** は、剣道の稽古を記録し、成長をゲーミフィケーションで可視化するPWAアプリです。

### 主要機能

- 📝 **稽古記録**：日々の稽古内容と自己評価（5段階）
- ⚡ **XP・レベルシステム**：稽古でXPを獲得、レベルアップ
- 🏆 **アチーブメント**：実績バッジによるモチベーション維持
- ⚔️ **技の修練**：量×質マトリックスによる技別習熟度管理
- 👥 **剣友システム**：他者評価機能（1日1課題1回）
- 🌟 **称号・二つ名**：レベルとスタイル組み合わせによる称号付与
- 🎭 **剣風相性**：技スタイルから他の剣友との相性を可視化
- 🔔 **プッシュ通知（Phase12）**：21時に減衰警告／実績リーチ／他者評価の通知
- 🛡️ **被打分析（Phase13）**：地稽古で打たれた技と原因を記録し、弱点を可視化（与打/被打の二重チャート + 原因別ランキング + RGBブレンド SkillGrid）

---

## 全体アーキテクチャ

┌──────────────────────┐
│ iPhone PWA / PC │
│ Next.js (React) │
└──────────┬───────────┘
│ HTTPS
▼
┌──────────────────────────────────────────────┐
│ Cloudflare Pages │
│ ┌────────────────────────────────────────┐ │
│ │ Static (Next.js Static Export) │ │
│ │ - app/ pages │ │
│ │ - public/ (icons, sw.js, manifest) │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ Edge Functions (Pages Functions) │ │
│ │ - /api/gas (GAS proxy) │ │
│ │ - /api/push/subscribe │ │
│ │ - /api/push/send (★ 自前webpush) │ │
│ └────────────────────────────────────────┘ │
└──────────────┬───────────────────────────────┘
│ HTTPS
▼
┌────────────────────────────────────────────┐
│ Google Apps Script (Web App) │
│ - doGet/doPost エントリーポイント │
│ - スプレッドシート操作 │
│ - dailyPushJob (21時バッチ) │
└──────────────┬─────────────────────────────┘
│ Spreadsheet API
▼
┌────────────────────────────────────────────┐
│ Google Spreadsheet（DB） │
│ - 16シート（マスタ + ユーザーデータ） │
└────────────────────────────────────────────┘
▲
│ (push送信時のみ)
│
┌──────────────┴─────────────────────────────┐
│ Web Push Service │
│ - APNs (Apple) / FCM (Google) / 他 │
└────────────────────────────────────────────┘


### 設計判断の背景

| 選択 | 理由 |
|---|---|
| **Cloudflare Pages + Edge Runtime** | 無料枠が広い・グローバル配信・低レイテンシ |
| **GAS + Spreadsheet をDBに** | 個人開発でゼロ運用コスト・データ可視性が高い |
| **自前 `webpush-edge.ts`** | Edge Runtime に Node.js の `web-push` パッケージは載らない |
| **GAS の dailyPushJob で判定** | フロント側で判定するとバッテリー消費・実装複雑化 |
| **被打分析の集計をフロント側で実施** | GASは生ログを返却しフロントで Recharts に最適化されたデータ構造に変換。深刻度係数の変更時もデプロイ不要で再計算可能 |

---

## 技術スタック

### フロントエンド

- **Next.js** 15.x (App Router, Static Export)
- **TypeScript** 5.7+
- **React** 19.x
- **Tailwind CSS** 4.x
- **@ducanh2912/next-pwa** (Service Worker 自動生成 + customWorkerSrc)

### バックエンド（API Edge）

- **Cloudflare Pages Functions** (Edge Runtime)
- **Web Crypto API** (VAPID JWT署名 + AES-128-GCM暗号化)
- **自前実装 `webpush-edge.ts`** (RFC8030/8291/8292 準拠)

### バックエンド（DB操作）

- **Google Apps Script** (V8 Runtime)
- **Google Spreadsheet API**
- **Time-driven Trigger** (毎日21時に dailyPushJob を起動)

### PWA関連

- **Web Push API** (Push Subscription / Push Manager)
- **Service Worker** (`worker/index.ts` → `forge-pwa-worker-*.js` として配信)
- **VAPID 認証** (RFC8292)

---

## ディレクトリ構成

百錬自得/
├── public/
│ ├── icons/
│ │ ├── icon-192x192.png # PWA アイコン (any/maskable)
│ │ └── icon-512x512.png
│ ├── sw.js # next-pwa が自動生成
│ ├── workbox-.js # workbox ランタイム
│ └── forge-pwa-worker-.js # worker/index.ts のビルド成果物
│
├── worker/
│ └── index.ts # ★ Service Worker カスタムロジック
│ push / notificationclick イベント
│
├── src/
│ ├── app/
│ │ ├── layout.tsx # ルートレイアウト（manifest, icons）
│ │ ├── manifest.ts # PWA manifest（/manifest.webmanifest）
│ │ ├── page.tsx # ホーム画面
│ │ ├── record/ # 稽古記録画面
│ │ ├── techniques/ # 技の修練画面
│ │ ├── peers/ # 剣友画面
│ │ ├── achievements/ # 実績バッジ画面
│ │ ├── settings/profile/ # プロフィール / 通知トグル
│ │ └── api/
│ │ ├── gas/ # GAS プロキシ（CORS回避）
│ │ └── push/
│ │ ├── subscribe/ # 購読登録API（→ GAS savePushSubscription）
│ │ └── send/ # ★ Edge Push送信API
│ │
│ ├── components/ # 共通コンポーネント
│ ├── lib/
│ │ ├── gas-proxy.ts # GAS呼び出しラッパー
│ │ ├── webpush-edge.ts # ★ 自前 Web Push 実装（Edge Runtime）
│ │ └── utils.ts
│ └── styles/
│ └── globals.css
│
├── gas/
│ └── Code.gs # Google Apps Script バックエンド
│
├── next.config.ts # ★ next-pwa 設定（export default 必須）
├── package.json
└── ARCHITECTURE.md # ← このファイル


---

## データフロー

### 通常のCRUD操作（getDashboard, saveLog 等）


### Push通知の購読登録フロー

[Browser: profile/page.tsx]
│
│ 1) Notification.requestPermission() → 'granted'
│ 2) navigator.serviceWorker.ready
│ 3) reg.pushManager.subscribe({applicationServerKey: VAPID_PUB})
│ → subscription = {endpoint, keys: {p256dh, auth}}
│ 4) fetch('/api/push/subscribe', {body: {userId, subscription}})
▼
[Cloudflare /api/push/subscribe]
│
│ token = env.PUSH_INTERNAL_TOKEN
│ fetch(GAS_WEB_APP_URL, {action: 'savePushSubscription', token, userId, subscription})
▼
[GAS savePushSubscription]
│
│ Verify token === ScriptProperties.PUSH_INTERNAL_TOKEN
│ push_subscriptions シートに upsert（user_id をキー）
▼
[Spreadsheet: push_subscriptions]
user_id | subscription_json | updated_at
--------+-------------------+----------------
U0001 | {"endpoint":...} | 2026-05-12 21:00

### Push通知の配信フロー（Phase12）

[GAS Time Trigger 21:00 JST]
│
▼
[GAS dailyPushJob()]
│
│ 1) push_subscriptions を全ロード
│ 2) 各ユーザーで優先度1〜3を判定
│ - 優先度1: XP減衰警告（last_practice_date がちょうど2日前）
│ - 優先度2: 実績リーチ（streak === conditionValue - 1）
│ - 優先度3: 他者評価サマリー（今日 peer_eval を受けた）
│ 3) targets[] に { userId, subscription, title, body, url } を集約
│ 4) UrlFetchApp.fetch(NEXT_API_BASE + '/api/push/send', {targets, token})
▼
[Cloudflare /api/push/send]
│
│ Verify x-push-token === env.PUSH_INTERNAL_TOKEN
│ targets.forEach: sendWebPushEdge(subscription, vapid, {payload})
▼
[webpush-edge.ts: sendWebPushEdge]
│
│ 1) VAPID JWT を ECDSA P-256 で署名生成
│ 2) ECDH で共有秘密 → HKDF で CEK/Nonce 導出
│ 3) AES-128-GCM で payload 暗号化
│ 4) RFC8188 ヘッダ (salt+rs+idlen+keyid) を付与
│ 5) POST to subscription.endpoint
▼
[Push Service: APNs / FCM / etc]
│
▼
[iPhone Service Worker: worker/index.ts]
│
│ self.addEventListener('push', e => {
│ showNotification(title, {body, icon, badge, tag, data})
│ })
▼
[ロック画面に通知表示]


---

## スプレッドシート（DB）スキーマ

### ユーザー固有データシート（A列 = user_id）

| シート名 | 列構成 | 用途 |
|---|---|---|
| `logs` | user_id, date, task_id, score, xp_earned | 稽古記録（task_id は user_tasks への外部キー） |
| `user_status` | user_id, total_xp, level, last_practice_date, last_decay_date, real_rank, motto, favorite_technique | ユーザーのステータス（Phase9.5でtitle列削除） |
| `xp_history` | user_id, date, type, amount, reason, total_xp_after, level | XP増減履歴（type: gain/decay/peer_eval/reset） |
| `user_tasks` | id(UUID), user_id, task_text, status(active/archived), created_at, updated_at | 稽古課題マスタ |
| `user_techniques` | user_id, technique_id, Points, LastRating, last_quantity, last_quality, last_feedback | 技別習熟度（Phase8で7列拡張） |
| `technique_logs` | user_id, date, technique_id, quantity, quality, xp_earned, feedback | 技の稽古履歴 |
| `peer_evaluations` | evaluator_id, target_id, task_id, date, score, xp_granted | 他者評価記録（Phase7でtask_id追加） |
| `user_achievements` | user_id, achievement_id, unlocked_at | 実績バッジ解除記録 |
| `push_subscriptions` ★Phase12 | user_id, subscription_json, updated_at | Push購読情報 |
| `received_technique_logs` ★Phase13 | id(UUID), user_id, date, technique_id, quantity, reason, xp_earned | 地稽古で打たれた技と原因の記録（A列がidの特例シート） |

### 全ユーザー共通マスタシート

| シート名 | 列構成 | 用途 |
|---|---|---|
| `UserMaster` | user_id, name, password, role | ユーザー認証情報 |
| `technique_master` | ID, BodyPart, ActionType, SubCategory, Name | 技マスタ |
| `title_master` | level, title | レベル別称号マスタ |
| `EpithetMaster` | ID, Category, TriggerValue, Name, Rarity, Description | 二つ名マスタ（Phase9で6列拡張） |
| `achievement_master` | achievement_id, name, condition_type, condition_value, description, hint, icon_type | 実績マスタ（Phase6） |
| `MatchupMaster` | BaseStyle, MatchType, Degree, TargetStyle, Reason, Advice | 剣風相性マスタ（Phase10） |

### システム用

| シート名 | 用途 |
|---|---|
| `error_logs` | INFO/WARN/ERROR ログ（GAS側） |

---

## 認証システム

### ログイン

- **方式**: ユーザーID（または名前）+ パスワード
- **保存場所**: `UserMaster` シート（平文。個人/同好会向け簡易実装）
- **セッション**: localStorage に user_id を保持
- **AuthGuard**: 未ログイン時はログイン画面へリダイレクト

### Push通知関連の認証

Cloudflare ↔ GAS 間の通信は `PUSH_INTERNAL_TOKEN` で保護：

Cloudflare env.PUSH_INTERNAL_TOKEN === GAS ScriptProperties.PUSH_INTERNAL_TOKEN


両者で**完全一致が必須**。

---

## XP・レベル・段位システム

### XPアルゴリズム

```typescript
// 稽古記録（saveLog）
baseXp = 50 + sum(SCORE_BONUS[score])  // SCORE_BONUS = {5:30, 4:20, 3:10, 2:5, 1:2}
totalXp = ceil(baseXp * REAL_RANK_MULT)  // 段位倍率（初段:1.2 〜 八段:5.0）

// 技の稽古（updateTechniqueRating）
earnedPoints = ceil(QUANTITY_BASE[qty] * QUALITY_MULT[qlt])
// QUANTITY_BASE = {1:10, 2:20, 3:30, 4:40, 5:50}
// QUALITY_MULT  = {1:0.1, 2:0.5, 3:1.0, 4:2.0, 5:5.0}

// レベル計算
level = max(n where xp >= 100 * (n-1)^1.8)  // 上限99

XP減衰（applyDecay）
最終稽古から 3日経過後から1日ごとに減衰
減衰量: floor(20 * (daysAbsent - 3)^1.3)
減衰は getDashboard 呼び出し時に自動適用（1日1回まで）
他者評価のXP

xpGranted = ceil(totalScoreSum * 2 * EVALUATOR_LEVEL_MULT)
// EVALUATOR_LEVEL_MULT = {Lv80+:5.0, Lv60+:3.0, Lv40+:2.0, Lv30+:1.5, Lv20+:1.2, ELSE:1.0}

称号システム（2層構造）
種類	データソース	役割
称号（Title）	title_master (level → title)	レベルに応じた基本称号
二つ名（Epithet）	EpithetMaster (Category=styleCombo)	技スタイル組み合わせで付与
Phase9.5でDB正規化済み（user_status から title 列を物理削除し、フロント側でレベルから動的計算）。

PWA Push通知システム（Phase12）
配信タイミング
毎日 21:00 JST に GAS の dailyPushJob() が発火し、優先度判定の上で1ユーザー1通のみ送信。

優先度判定ロジック

優先度1: XP減衰警告
  条件: last_practice_date がちょうど2日前
  通知: 'XP減衰警告' / '【警告】最終稽古記録から48時間経過。明日からXPが減衰します。'

優先度2: 実績リーチ
  条件: 現在の連続稽古日数（今日除く）が、
        いずれかの streak_days 系実績の condition_value - 1 と一致
  通知: '実績リーチ' / '実績解除の予兆あり。'

優先度3: 他者評価サマリー
  条件: 今日の peer_evaluations に target_id === userId のレコードあり
  通知: '他者評価サマリー' / 'あなたの稽古が評価されました。'

優先度1〜3のうち、最初に該当した1つだけを送信。

Web Push 暗号化（webpush-edge.ts）
Edge Runtime には Node.js の web-push パッケージが載らないため、Web Crypto API で自前実装。

暗号化フロー（RFC8291準拠）

1) サーバーエフェメラル鍵ペア生成（ECDH P-256）
2) ECDH で共有秘密を導出（受信者の p256dh と組み合わせ）
3) HKDF-Extract(auth_secret, sharedSecret) → PRK_key
4) HKDF-Expand(PRK_key, "WebPush: info\0" || ua_pub || as_pub, 32) → IKM
5) HKDF-Extract(salt, IKM) → PRK
6) HKDF-Expand(PRK, "Content-Encoding: aes128gcm\0", 16) → CEK
7) HKDF-Expand(PRK, "Content-Encoding: nonce\0", 12) → Nonce
8) AES-128-GCM(CEK, Nonce, payload || 0x02) → cipher
9) header = salt(16) || rs(4) || idlen(1) || keyid(65)
10) body = header || cipher
11) POST to endpoint with VAPID JWT (ES256)

{
  "header":  { "typ": "JWT", "alg": "ES256" },
  "payload": {
    "aud": "https://web.push.apple.com",
    "exp": 12時間後,
    "sub": "mailto:..."
  },
  "signature": "ES256でWebCrypto.sign"
}

Authorization: vapid t=<jwt>, k=<public_key_b64url>

Service Worker（worker/index.ts）
@ducanh2912/next-pwa の customWorkerSrc: 'worker' 設定により、worker/index.ts がビルド時に自動生成 SW に結合される。

self.addEventListener('push', (event) => {
  const payload = JSON.parse(event.data?.text() ?? '{}');
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body:  payload.body,
      icon:  payload.icon,
      badge: payload.badge,
      tag:   payload.tag,
      data:  { url: payload.url, ts: Date.now() },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(focusOrOpenWindow(url));
});

iOS Safari 対応の重要ポイント
title を空文字にしない（iOSは空タイトルで通知破棄）
vibrate / requireInteraction / renotify を付けない（iOS非対応で破棄リスク）
try-catch + fallback 通知（push ハンドラ失敗時も最低限の通知発火）

## 被打分析システム（Phase13）

### 機能概要

地稽古で「打たれた技」と「原因」を記録し、与打（攻めて磨く技）と並行して可視化することで、剣士の弱点を客観化する。

### 入力UX（`/record` のシンメトリー化）

- 「与打セクション」（青テーマ）と「被打セクション」（赤テーマ）を**シンメトリーレイアウト**で配置
- 被打1件あたり「技 × 量(1〜5) × 原因(1〜5)」の3要素を入力
- saveLog のペイロードに `receivedTechs[]` として同梱送信

### 原因（Reason）= 悪癖の深刻度カテゴリ

| code | 名称 | 深刻度係数 |
|---|---|---|
| 1 | 攻め負け（隙あり） | 1.0 |
| 2 | 単調（読まれた） | 1.2 |
| 3 | 居着き（反応遅れ） | 1.5 |
| 4 | 体勢崩れ（姿勢の乱れ） | 2.0 |
| 5 | ⚠️ 手元上がり（致命的） | 3.0 |

### 正直記録ボーナス

被打1件あたり `5 XP × quantity` を付与。「打たれた事実を正直に記録する」ことを行動経済学的にインセンティブ化。
- `xp_history` には `type='gain'`, `reason='正直記録ボーナス（被打 N件）'` で記録
- 与打XPと加算して `user_status.total_xp` に反映

### 集計ロジック（GAS `getReceivedStatsData`）

receivedPoints = Σ(quantity × SEVERITY_MULT[reason])
深刻度係数: { 1:1.0, 2:1.2, 3:1.5, 4:2.0, 5:3.0 }


- `byTechnique[]`: 技別集計（receivedPoints 降順、`technique_master`とJOINして`bodyPart/subCategory`付与）
- `byReason`: 原因別の被打回数内訳

### 可視化UI（3層構造）

| レイヤー | 場所 | 表現 |
|---|---|---|
| **SkillGrid（八卦陣）** | ダッシュボード | viewModeトグル（与打/被打/攻防）+ RGBブレンド発光（青=与打 / 赤=被打 / **紫=激戦区**） |
| **二重ドーナツ** | プレイスタイル分析 | 内側=与打 / 外側=被打 の仕掛け／応じ比較 |
| **二重レーダー** | プレイスタイル分析 | 「面・小手・胴・突き」軸での与打/被打 重畳描画 |
| **Weakness Analysis** | プレイスタイル分析下部 | 原因別ランキング水平棒グラフ。1位は紫グラデの「⚠️最優先課題」バッジ＋パルスアニメ |

### RGBブレンド（SkillGrid）

各技ノードの色を以下で算出：

B (Blue) = normalizeIntensity(givenPoints, 1000) // 与打
R (Red) = normalizeIntensity(receivedPoints, 200) // 被打
G_BASE = 50 (固定)
color = rgb(R, 50, B)


`normalizeIntensity` は γ=0.7 補正で微小値も視認可能に。
`R≥160 && B≥160` のときは **「Hot Zone（激戦区）」**として紫リング+`⚠`バッジ+パルスアニメで強調する。

### 深刻度係数の同期ルール

`SEVERITY_MULT` は以下2か所で**完全一致**を保つこと：

| 場所 | 識別子 |
|---|---|
| `src/types/index.ts` | `export const SEVERITY_MULT` |
| `gas/Code.gs` | `var SEVERITY_MULT_GAS` |



Phase履歴
Phase	完了	主な変更
Phase1	✅	基本MVP（稽古記録・XP）
Phase2	✅	レベル・称号システム
Phase3	✅	稽古課題（user_tasks）導入
Phase4	✅	logs.C列を task_id に正規化
Phase5	✅	settings シート廃止、updateTasks スマート差分
Phase6	✅	アチーブメントシステム
Phase7	✅	他者評価を課題単位の配列評価に拡張、task_id 追加
Phase8	✅	技の修練：量×質マトリックス + 四字熟語フィードバック
Phase9	✅	二つ名（Epithet）の6列マスタ拡張
Phase9.5	✅	DB正規化：user_status / xp_history から title 列削除
Phase10	✅	剣風相性マッチング（MatchupMaster）
Phase-ex1	✅	他者評価ログの匿名化
Phase-ex4	✅	上位4スタイルによるマッチング精度向上
Phase12	✅	PWA Push通知システム（自前webpush-edge + dailyPushJob）
 Phase13  ✅  被打分析機能（被打記録・弱点可視化）：`received_technique_logs` 新設、SkillGrid RGBブレンド、二重チャート、原因別ランキング、正直記録ボーナス +5XP×qty |

### 今後の拡張

* **Phase14: 試合記録機能**
  * **概要**: 普段の「稽古記録」とは別に、大会や練習試合の戦績（勝敗、取得本数、決まり手）を記録・分析する機能。
  * **実装**: `match_logs` シートを新設。相手のスタイルや決まり手を記録し、グラフ（Recharts等）で勝率や得意な決まり手を可視化する。

* **Phase15: 反射神経養成ミニゲーム**
  * **概要**: 剣道に必要な反射神経や動体視力を養うための、アプリ内で手軽に遊べるミニゲーム機能。
  * **実装**: ランダムなタイミングで表示される「面・小手・胴」のターゲットを素早くタップする等、ブラウザ上で完結する軽量なReactコンポーネントとして実装。スコアに応じた少量のXP付与や、日々の継続ログインボーナスとしての活用も検討。

* **Phase16: 道場機能（複数ユーザーをグループ化）【保留中】**
  * **概要**: 実際の道場や部活単位でユーザーをグループ化し、道場内でのランキングやリーダーボード、全体のお知らせ機能を提供する。
  * **実装**: `dojo_master` および `dojo_members` シートを作成。データの取得クエリ（GAS）をグループIDでフィルタリングできるように改修。（※システムの複雑化を避けるため、現在は実装保留中）


運用・デプロイ
デプロイ先
フロント: Cloudflare Pages（GitHub push で自動デプロイ）
Edge API: 同上（Pages Functions として自動デプロイ）
GAS: 手動デプロイ（コード変更時は新バージョンとして再デプロイ必須）
必須の環境変数
Cloudflare Pages
変数名	用途
NEXT_PUBLIC_GAS_URL	GAS Web App の URL
NEXT_PUBLIC_VAPID_PUBLIC_KEY	VAPID 公開鍵（フロント購読用）
VAPID_PRIVATE_KEY	VAPID 秘密鍵（Edge側で署名用）
VAPID_SUBJECT	VAPID subject（mailto:...）
PUSH_INTERNAL_TOKEN	GAS↔Edge の共有シークレット
GAS スクリプトプロパティ
プロパティ名	用途
PUSH_INTERNAL_TOKEN	Cloudflare と完全一致
NEXT_API_BASE	Cloudflare Pages のベースURL（例: https://forge-in-fire.pages.dev）
GAS トリガー
setupDailyPushTrigger() を1回だけ実行し、毎日21時の time-driven trigger を登録。

// GAS エディタで実行
function setupDailyPushTrigger() {
  // 既存トリガー削除 + 新規21時日次トリガー作成（冪等）
}

既知の罠とトラブルシューティング
🚨 Phase12 で経験した5つの致命的な罠
罠1: next.config.ts の export default 欠落
症状: /sw.js が 404、トグル ON が永遠にクルクル
原因: withPWA(nextConfig) を export していないと、next-pwa が一切動作せず Service Worker が生成されない
対策: ファイル末尾に export default withPWA(nextConfig); が必ずあること

罠2: PWA アイコンパスの不整合
症状: ホーム画面追加してもデフォルトのスクショアイコン、Web Push が届かない
原因: iOS は manifest と layout のアイコンパスが完全一致していないと PWA を「Webクリップ」として登録し、Push を受信できない
対策:

manifest.ts と layout.tsx の icons パスを完全一致させる
ファイルが実際に public/ 直下に存在するか確認（/icons/icon-192x192.png 等）
ブラウザで直接アイコンURLを叩いて200を確認
purpose: 'any' を icons 配列の 先頭に配置（maskable 単独は iOS で無視される）
罠3: Apple の BadWebPushTopic エラー
症状: APNs から HTTP 400 {"reason":"BadWebPushTopic"} が返る
原因: Apple Web Push は Topic ヘッダを RFC8030 ではなく APNs プロトコルとして解釈するため、任意文字列を拒否
対策: webpush-edge.ts で Apple endpoint (web.push.apple.com) を判定し、Topic ヘッダを付けない

const isAppleEndpoint = url.host.includes('push.apple.com');
if (options.topic && !isAppleEndpoint) {
  headers['Topic'] = options.topic;
}

罠4: Edge Runtime での web-push パッケージ非対応
症状: ビルドエラー、Cloudflare Pages で動作しない
原因: web-push は Node.js 専用 API（crypto, stream）に依存
対策: Web Crypto API で自前実装（webpush-edge.ts）。RFC8030/8291/8292 を仕様書通りに実装。

罠5: HKDF-Expand の簡易実装による APNs 拒否
症状: Chrome では届くが iPhone では届かない
原因: HKDF-Expand を1ブロック簡易実装で済ませると、Apple 実装の厳格チェックでわずかな差分により暗号文が破棄される
対策: RFC5869 完全準拠の T(N) ループ実装に統一

async function hkdfExpand(prk, info, length) {
  const N = Math.ceil(length / 32);
  let T = new Uint8Array(0);
  const okm = new Uint8Array(N * 32);
  for (let i = 1; i <= N; i++) {
    const input = concat(T, info, new Uint8Array([i]));
    T = await hmacSha256(prk, input);
    okm.set(T, (i - 1) * 32);
  }
  return okm.slice(0, length);
}

その他の運用上の注意
GAS のコールドスタート
Cloudflare → GAS のリクエストは初回 5〜10秒かかることがある。getDashboard が 8000ms 程度なら正常範囲。

iOS PWA の購読幽霊化
OS更新や繰り返し購読試行で、iOS 内部の Push 状態が壊れることがある。
対処: PWA削除 → Safari全データ消去 → iPhone再起動 → 再インストール

Service Worker のスコープ問題
scope: '/' を manifest に明示すること。サブパス配信時に SW スコープが PWA 起動URL と合わないと、subscribe が失敗する。

iOS PWA の通知許可ダイアログ
Notification.requestPermission() は ユーザー操作（クリック等）からの直接呼び出しでのみ動作。useEffect 内で自動呼び出しすると黙って失敗する。

### Phase13 received_technique_logs シートの特例

`received_technique_logs` は他のユーザー固有シートと異なり **A列が `id`（UUID）、B列が `user_id`** である。
- `filterRowsByUserId` ヘルパは A列前提のため**使用不可**
- 集計時は `getReceivedStatsData` 内で `String(r[1]) === String(userId)` で直接判定する
- 削除系ヘルパを追加する際も列インデックスに注意


開発時のチェックリスト
Phase12（PWA Push）動作確認
[ ] https://<domain>/sw.js が JavaScript を返す（404 でない）
[ ] https://<domain>/manifest.webmanifest が JSON を返し、icons が /icons/ パス
[ ] https://<domain>/icons/icon-192x192.png が 200 で画像を返す
[ ] https://<domain>/icons/icon-512x512.png が 200 で画像を返す
[ ] iPhone「ホーム画面に追加」でプレビューに正しい剣道アイコンが表示
[ ] PWA 起動 → プロフィール → 通知トグル ON が応答
[ ] Cloudflare ログに POST /api/push/subscribe が記録される
[ ] GAS error_logs に savePushSubscription INSERT が記録される
[ ] push_subscriptions シートに該当行が追加される
[ ] GAS testPushJobNow() 実行で status: 201
[ ] iPhone ロック画面に通知が表示される
[ ] 通知タップで PWA が起動し正しいページへ遷移

クレジット
開発: 個人プロジェクト
技術指導: Claude (Anthropic) / Gemini (Google)
命名由来: 「百錬自得」= 百回鍛えて初めて自得する、の剣道訓
英名 "Forge in Fire": 火で打ち鍛えるイメージ
「百錬自得（Forge in Fire）」
─ 百回の試行錯誤で自得した完成版アプリ ─


---

## 📝 補足：このドキュメントの活用方法

### 1. 新規メンバーへの共有

このドキュメントを読めば、システム全体像が30分で把握できるよう設計しています。

### 2. 将来の保守時のリファレンス

特に **「既知の罠とトラブルシューティング」** セクションは、今回の Phase12 で我々が **8時間以上かけて解決した知見**が凝縮されています。同じ罠で誰かが時間を浪費しないように記録を残しました。

### 3. Phase 拡張時のテンプレート

新しい Phase を追加する際は、`Phase履歴` テーブルに行を追加し、影響を受けるシートスキーマを更新してください。

---