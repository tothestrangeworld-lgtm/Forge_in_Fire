# 百錬自得（Forge_in_Fire） - ARCHITECTURE.md

> 剣道の稽古・技の習熟度を記録し、成長をゲーミフィケーションで可視化するWebアプリ。

---

## 1. アプリ概要と技術スタック

### フロントエンド

| 項目 | 内容 |
|---|---|
| フレームワーク | Next.js 15.5.15（App Router / TypeScript） |
| ホスティング | Cloudflare Pages（`@cloudflare/next-on-pages` ビルド） |
| スタイリング | Tailwind CSS + インラインスタイル（動的クラスのパージ対策） |
| フォント | M PLUS Rounded 1c（丸ゴシック系、柔らかい印象） |
| グラフ | Recharts（AreaChart・RadarChart・PieChart） |
| スキルグリッド | @xyflow/react v12（react-flow、ノード・エッジの動的描画） |
| アイコン | lucide-react |
| 認証状態 | `localStorage` によるセッション保持（サーバーサイド認証なし） |

### バックエンド・データベース

| 項目 | 内容 |
|---|---|
| バックエンド | Google Apps Script（GAS）Web App（doGet / doPost） |
| データベース | Google Sheets（スプレッドシート ID: `1jmXq7bdvSG_HVjTe0ArEAi8xStmVfh_FpIb90TxYS5I`） |
| CORS回避 | Next.jsの `/api/gas` プロキシルート経由（ブラウザはGASを直接叩かない） |

### API通信フロー

```
ブラウザ
  └─ fetch('/api/gas?action=...')
       └─ src/app/api/gas/route.ts（Edge Runtime プロキシ）
            └─ GAS Web App（doGet / doPost）
                 └─ Google Sheets
```

---

## 2. ディレクトリ構成と各ファイルの役割

```
Forge_in_Fire/
├── gas/
│   └── Code.gs                             # GASバックエンド全処理（認証・CRUD・XP計算・減衰）
│
├── src/
│   ├── app/
│   │   ├── layout.tsx                      # ルートレイアウト（AuthGuard・ナビゲーション組み込み）
│   │   ├── globals.css                     # デザイントークン・共通CSS（wa-card、btn-ai等）
│   │   ├── page.tsx                        # ホーム画面（ステータス・スキルグリッド・分析を統合表示）
│   │   ├── record/
│   │   │   └── page.tsx                    # 記録画面（稽古記録タブ・技の評価タブの統合ページ）
│   │   ├── login/
│   │   │   └── page.tsx                    # ログイン画面（ユーザー選択・パスコード認証）
│   │   ├── rivals/
│   │   │   ├── page.tsx                    # 門下生一覧（自分以外のユーザーをリスト表示）
│   │   │   └── [id]/
│   │   │       └── page.tsx                # 他ユーザーのダッシュボード閲覧（リードオンリー）
│   │   ├── debug/
│   │   │   └── page.tsx                    # ログビューア（localStorageのクライアントログ確認）
│   │   └── api/
│   │       └── gas/
│   │           └── route.ts                # GASプロキシ（GET/POST をGASに中継、CORS回避）
│   │
│   ├── components/
│   │   ├── Navigation.tsx                  # ボトムナビ（ホーム・稽古記録・門下生・ログアウト の4項目）
│   │   ├── AuthGuard.tsx                   # 未ログイン時に /login へリダイレクトするガード
│   │   └── charts/
│   │       ├── RadarChart.tsx              # 稽古スコアバランス（recharts RadarChart）
│   │       ├── TrendLineChart.tsx          # スコア推移折れ線（累積モード対応）
│   │       ├── XPTimelineChart.tsx         # XP累積推移エリアチャート（xp_historyを正データソースとして使用）
│   │       ├── ActivityHeatmap.tsx         # 稽古カレンダー（月×週グリッド、4月年度始まり）
│   │       ├── SkillGrid.tsx               # スフィア盤（react-flow、CORE→BodyPart→技の3層）
│   │       ├── PlaystyleCharts.tsx         # プレイスタイル分析（ドーナツ+レーダー）
│   │       └── TechniqueRadarChart.tsx     # ※SkillGridに統合済み。参照なし
│   │
│   ├── lib/
│   │   ├── api.ts                          # GAS APIクライアント（user_id自動付与・targetUserId上書き対応）
│   │   ├── auth.ts                         # 認証ユーティリティ（localStorage の読み書き・ログアウト）
│   │   ├── epithet.ts                      # 二つ名（Epithet）判定ロジック（Technique[]から称号を算出）
│   │   └── logger.ts                       # クライアントロガー（localStorage に最大200件、/debug で確認）
│   │
│   └── types/
│       └── index.ts                        # 全型定義・XP/レベル計算関数・称号テーブル（フォールバック）
│
├── .env.example                            # 環境変数テンプレート
├── open-next.config.ts                     # OpenNext設定ファイル（Cloudflare Pages用）
├── next.config.ts                          # Next.js設定
├── tailwind.config.ts                      # Tailwind設定（カスタムカラー・アニメーション）
├── wrangler.toml                           # Cloudflare Pages設定（ビルド出力先等）
├── package.json                            # 依存パッケージ管理
├── DEPLOY_GUIDE.md                         # デプロイ手順書
└── HANDOFF.md                              # 開発引き継ぎ文書
```

---

## 3. データベース設計（スプレッドシート構成）

### ユーザー固有シート（A列は必ず `user_id`）

#### `user_status`
| 列 | カラム名 | 内容 |
|---|---|---|
| A | user_id | ユーザーID（例: U0001） |
| B | total_xp | 現在の累積XP |
| C | level | 現在のレベル（1〜99） |
| D | title | 現在の称号（称号マスタから取得） |
| E | last_practice_date | 最終稽古日（YYYY-MM-DD） |
| F | last_decay_date | 最終減衰適用日（YYYY-MM-DD） |

#### `logs`（稽古評価ログ）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | user_id | ユーザーID |
| B | date | 稽古日（YYYY-MM-DD） |
| C | item_name | 意識項目名 |
| D | score | 評価（1〜5） |
| E | xp_earned | 獲得XP（評価ボーナス分のみ） |

#### `settings`（稽古の意識項目）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | user_id | ユーザーID |
| B | item_name | 項目名（例: 右手の力） |
| C | is_active | 有効/無効（TRUE/FALSE） |

#### `TechniqueMastery`（技の習熟度）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | user_id | ユーザーID |
| B | ID | 技の識別ID |
| C | BodyPart | 部位（例: 面、小手） |
| D | ActionType | 種別（例: 仕掛け技、応じ技） |
| E | SubCategory | サブカテゴリ（例: 基本、出端技） |
| F | Name | 技の名前 |
| G | Points | 累積ポイント（評価を加算） |
| H | LastRating | 直近の星評価（1〜5） |

#### `xp_history`（XP増減履歴）★ XPTimelineChart の正データソース
| 列 | カラム名 | 内容 |
|---|---|---|
| A | user_id | ユーザーID |
| B | date | タイムスタンプ（YYYY-MM-DD HH:mm:ss） |
| C | type | 種別（gain / decay / reset） |
| D | amount | 増減量（減衰・リセットはマイナス値） |
| E | reason | 理由（例: 稽古記録（4/13・9項目）） |
| F | total_xp_after | 適用後のXP ★ グラフのY軸に直接使用 |
| G | level | 適用後のレベル |
| H | title | 適用後の称号 |

> `getDashboard` がこのシートから直近90件を取得してフロントへ返す。
> フロントエンドでのXP再計算・減衰シミュレーションはすべて廃止済み。

---

### 全ユーザー共通マスタ（user_id 列なし）

#### `UserMaster`（ユーザー管理）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | user_id | ユーザーID（例: U0001） |
| B | name | 表示名（例: 師範） |
| C | password | パスコード（平文4〜8文字） |
| D | role | 権限（admin / member） |

> 初期データ: `U0001 / 師範 / 1234 / admin`（シート未存在時に自動作成）

#### `title_master`（称号テーブル）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | level | 称号を獲得するレベル |
| B | title | 称号名（例: 初段、錬士） |

> スプレッドシートで管理することでコード修正なしに称号を変更可能。未存在時に自動作成。

#### `EpithetMaster`（二つ名マスタ）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | ID | 識別ID |
| B | Category | 判定カテゴリ（status / actionType / subCategory / balance） |
| C | TriggerValue | 照合キー（例: 仕掛け技、出端技、初期、バランス） |
| D | Name | 修飾語（例: 怒涛の、後の先を極めし） |
| E | Description | 説明文 |

#### `error_logs`（システムログ）
timestamp / level / action / message / detail の5列。1000行超で古い行を自動削除。

---

## 4. APIエンドポイント（GASのAction一覧）

### doGet（データ取得）

| action | 主要パラメータ | 内容 |
|---|---|---|
| `getDashboard` | `user_id` | ステータス・設定・ログ・マスタ・xpHistoryをまとめて返す（XP減衰も自動適用） |
| `getSettings` | `user_id` | 意識項目一覧を返す |
| `getLogs` | `user_id`, `limit` | 稽古ログを返す（デフォルト最新500件） |
| `getUserStatus` | `user_id` | XP・レベル・称号を返す |
| `getTechniques` | `user_id` | 技の習熟度一覧を返す |
| `getEpithetMaster` | なし | 二つ名マスタを返す（全ユーザー共通） |
| `getUsers` | なし | ユーザー一覧を返す（パスワード除く） |

### doPost（データ書き込み）

| action | 主要パラメータ | 内容 |
|---|---|---|
| `login` | `user_id` or `name`, `password` | 認証してユーザー情報を返す |
| `saveLog` | `user_id`, `date`, `items[]` | 稽古ログ保存・XP更新・xp_history記録 |
| `updateSettings` | `user_id`, `items[]` | 意識項目を安全に更新（ユーザー行のみ削除して追記） |
| `resetStatus` | `user_id` | XP・レベルを初期化（ログは残す） |
| `updateTechniqueRating` | `user_id`, `id`, `rating` | 技ポイントをrating分加算、LastRatingを上書き |

> **安全な更新の原則：** `updateSettings` 等は `clearContents()` を使わず、`deleteRowsByUserId()` でユーザー行のみを下から削除してから追記する。他ユーザーのデータを破壊しない。

---

## 5. 主要なデータモデル（TypeScript型定義）

### 認証

```
AuthUser: { user_id, name, role }
```

### ダッシュボード

```
DashboardData: {
  status:         UserStatus
  settings:       Setting[]
  logs:           LogEntry[]
  nextLevelXp:    NextLevelInfo
  decay?:         DecayInfo
  titleMaster?:   TitleMasterEntry[]
  epithetMaster?: EpithetMasterEntry[]
  xpHistory?:     XpHistoryEntry[]
}

UserStatus:    { total_xp, level, title, last_practice_date? }
DecayInfo:     { applied, days_absent, today_penalty }
NextLevelInfo: { required, title }
```

### XPイベント履歴

```
XpHistoryEntry: {
  date:           string   // "YYYY-MM-DD"
  type:           'gain' | 'decay' | 'reset' | string
  amount:         number   // 獲得は正値、減衰はマイナス
  reason:         string
  total_xp_after: number   // ★ グラフのY軸に直接使用
  level:          number
  title:          string
}
```

### 稽古記録

```
Setting:  { item_name, is_active }
LogEntry: { date, item_name, score, xp_earned }
```

### 技の習熟度

```
Technique: {
  id, bodyPart, actionType, subCategory,
  name, points, lastRating
}
TechniqueUpdateResponse: { id, points, lastRating }
```

### マスタ

```
TitleMasterEntry:   { level, title }
EpithetMasterEntry: { id, category, triggerValue, name, description }
```

### 二つ名判定結果

```
EpithetResult: { name, description, suffix, fullTitle }
```

---

## 6. 実装済みの主要機能と現在のステータス

### ✅ 稽古XP記録システム
- 意識項目（settings）ごとに1〜5評価を入力して稽古を記録
- 基本XP 50 + 評価ボーナス（5→30, 4→20, 3→10, 2→5, 1→2）
- 稽古ログは `logs` シートに蓄積

### ✅ XP・レベルシステム（Lv1〜99）
- 指数カーブ: `xpForLevel(n) = floor(100 × (n-1)^1.8)`
- 低レベルはサクサク、高レベルほど重くなる設計
- 称号は `title_master` シートで管理（スプレッドシートで変更可能）

### ✅ XP減衰システム
- 最終稽古から3日間は猶予
- 4日目以降: `daily_penalty(d) = floor(20 × (d-3)^1.3)`
- ホーム画面を開くたびに自動計算・適用（1日1回）
- `xp_history` シートに全増減を記録

### ✅ XP推移グラフ（イベントソーシング方式）
- GAS の `xp_history` シートを正のデータソースとし、`getDashboard` が直近90件を `xpHistory` として返す
- `XPTimelineChart` は `xpHistory[n].total_xp_after` をそのままY軸にマッピングするだけ
- 計算ロジックを持たないため、リセット・減衰が常に正確に描画される

### ✅ 技の習熟度記録（スキルグリッド）
- `TechniqueMastery` シートから技データを取得
- 星評価（1〜5）をクリックして「＋記録」でポイントを累積加算
- `@xyflow/react` による3層スフィア盤（CORE → BodyPart → 技名）
- ポイント量に応じてノードのサイズ・色・グローが変化
- ActionTypeによるフィルター機能（仕掛け技 / 応じ技 / すべて）

### ✅ プレイスタイル分析
- `PlaystyleCharts`：ActionType別ドーナツチャート + SubCategory別レーダーチャート
- `EpithetMaster` シートと `Technique[]` から二つ名を自動算出（`src/lib/epithet.ts`）
- 判定優先順位: 初期 → ActionType偏り(70%以上) → SubCategory最高 → バランス

### ✅ 二つ名（Epithet）+ 称号バナー
- ホーム画面・技の記録画面・門下生ダッシュボード閲覧画面に表示
- 二つ名（修飾語）+ 称号（レベル由来）を組み合わせて「怒涛の 初段」のように表示

### ✅ 各種グラフ可視化
- 稽古カレンダー（月×週グリッド、4月年度始まり、週単位の稽古日数）
- XP累積推移エリアチャート（xp_history イベントソーシング方式、減衰・リセットも正確に反映）
- 稽古スコアバランス レーダーチャート（直近50回の平均・スマホ見切れ対応済み）

### ✅ マルチユーザー化
- `UserMaster` シートによるユーザー管理
- GASの全データ取得・書き込み関数が `user_id` でフィルタリング
- `deleteRowsByUserId()` による安全な更新（他ユーザーデータを絶対に消さない設計）

### ✅ ログイン機能
- ユーザー一覧から選択 + パスコード入力によるログイン
- 認証成功後は `localStorage` に `hyakuren_user` を保存（ブラウザ再起動後も維持）
- `AuthGuard` コンポーネントが未ログインユーザーを `/login` へリダイレクト
- `api.ts` が全リクエストに `user_id` を自動付与

### ✅ 切磋琢磨機能（門下生ダッシュボード閲覧）
- ボトムナビ「門下生」タブ（`/rivals`）から他ユーザーの稽古進捗を閲覧できる
- 自分自身はリストから除外して表示
- `/rivals/[id]` でユーザーごとのダッシュボードをリードオンリーで表示
  - XP推移・稽古カレンダー・スコアレーダー・スキルグリッド・プレイスタイル分析を表示
  - リセットボタン・XP減衰警告は除外（他人のステータス変更不可）
  - スキルグリッドは `pointerEvents: none` ラッパーで操作を封じる
- `api.ts` の `gasGet` が `params.user_id` を優先解決するよう拡張（後述）
- GAS側の改修は不要（既存の `getDashboard`, `getTechniques`, `getUsers` をそのまま活用）

### ✅ デバッグ・ログ機能
- クライアントログを `localStorage` に最大200件保存（`/debug` で閲覧・エクスポート）
- GASの `error_logs` シートにサーバーサイドエラーを記録
- `xp_history` シートにXPの全増減履歴を記録

---

## 7. api.ts の設計原則

### user_id の解決ルール

`gasGet` 関数は以下の優先順位で `user_id` を解決する。

```
1. params に user_id が明示されていればそれを使用（他ユーザー閲覧用）
2. 省略されている場合は getCurrentUserId() で自分のIDを自動付与
3. user_id が必要なのに未ログイン → 'AUTH_REQUIRED' エラーをスローしてフェッチをブロック
```

```typescript
// 実装イメージ
const merged = needsUserId
  ? { ...params, user_id: params.user_id ?? userId }
  : params;
```

### targetUserId を受け取る関数

| 関数 | 引数 | 挙動 |
|---|---|---|
| `fetchDashboard(targetUserId?)` | 省略 → 自分、指定 → 対象ユーザー | 門下生閲覧で使用 |
| `fetchTechniques(targetUserId?)` | 省略 → 自分、指定 → 対象ユーザー | 門下生閲覧で使用 |

### AUTH_REQUIRED エラーの扱い

認証ガードがスローする `Error('AUTH_REQUIRED')` は、各 `useEffect` の catch ブロックで検出し、無視する（AuthGuard によるリダイレクトに任せる）。

```typescript
.catch(err => {
  if (err.message === 'AUTH_REQUIRED') return;  // AuthGuardに委譲
  setError('読み込みに失敗しました');
});
```

---

## 8. 環境変数

| 変数名 | 必須 | 内容 |
|---|---|---|
| `GAS_URL` | ✅ | GAS Web App の公開URL（サーバーサイドのみ・NEXT_PUBLIC_不要） |

Cloudflare Pages Dashboard → Settings → Environment variables で設定。

---

## 9. 今後の拡張ポイント（備忘録）

- [ ] ユーザー登録・パスワード変更画面（現在はスプレッドシート直接編集）
- [ ] ランキング画面（全ユーザーの総XP比較・リアルタイム順位表）
- [ ] 稽古の意識項目をUI上で追加・編集する管理画面
- [ ] PWA対応（オフライン記録 → オンライン時に同期）
- [ ] パスワードのハッシュ化（現在は平文保存）
- [ ] xp_history の全期間表示オプション（現在は直近90件に絞っている）
- [ ] 門下生ダッシュボード閲覧時の「挑戦状を送る」コメント機能
