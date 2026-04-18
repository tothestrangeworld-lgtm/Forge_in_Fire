# GitHubへの手動アップロード手順
## 百錬自得（Forge_in_Fire）更新ガイド

---

## 前提
- リポジトリ: `tothestrangeworld-lgtm/Forge_in_Fire`
- GitHubとCloudflare Pagesが連携済み
- `main` ブランチへのpushで自動デプロイされる

---

## STEP 1｜Claudeからファイルをダウンロード

Claudeが出力したファイルを、それぞれローカルPCに保存する。

> **ポイント:** ファイル名が `page.tsx` のように同名でも、
> 保存先フォルダを正しく合わせれば問題ない。

---

## STEP 2｜ローカルのプロジェクトフォルダに上書きコピー

ダウンロードしたファイルを、ローカルのプロジェクトフォルダ内の
**正しいパス**に上書きコピーする。

### フォルダ構成の早見表

| Claudeが出力するファイル名 | コピー先（プロジェクトルートから） |
|---|---|
| `Code.gs` | `gas/Code.gs` |
| `page.tsx`（ホーム） | `src/app/page.tsx` |
| `page.tsx`（記録） | `src/app/record/page.tsx` |
| `page.tsx`（グラフ） | `src/app/history/page.tsx` |
| `page.tsx`（デバッグ） | `src/app/debug/page.tsx` |
| `route.ts`（GASプロキシ） | `src/app/api/gas/route.ts` |
| `layout.tsx` | `src/app/layout.tsx` |
| `globals.css` | `src/app/globals.css` |
| `Navigation.tsx` | `src/components/Navigation.tsx` |
| `RadarChart.tsx` | `src/components/charts/RadarChart.tsx` |
| `TrendLineChart.tsx` | `src/components/charts/TrendLineChart.tsx` |
| `ActivityHeatmap.tsx` | `src/components/charts/ActivityHeatmap.tsx` |
| `XPTimelineChart.tsx` | `src/components/charts/XPTimelineChart.tsx` |
| `api.ts` | `src/lib/api.ts` |
| `logger.ts` | `src/lib/logger.ts` |
| `index.ts`（型定義） | `src/types/index.ts` |
| `package.json` | `package.json` |

> **GASのCode.gsはGitHubとは別に手動でデプロイが必要（→ STEP 6）**

---

## STEP 3｜package.jsonが変わった場合のみ：依存パッケージを更新

`package.json` が変更された場合は以下を実行する。
変更がなければスキップ。

```bash
npm install
```

---

## STEP 4｜ビルド確認

```bash
npm run build
```

エラーが出なければ次へ進む。
エラーが出た場合はClaudeにエラーメッセージを貼って相談する。

---

## STEP 5｜GitHubにコミット・プッシュ

```bash
# 変更ファイルをすべてステージング
git add .

# コミット（メッセージは内容に合わせて変更してOK）
git commit -m "変更内容のメモ"

# プッシュ（自動デプロイが走る）
git push origin main
```

### コミットメッセージの例
```
git commit -m "feat: XP減衰ロジック修正"
git commit -m "fix: ヒートマップ表示バグ修正"
git commit -m "feat: XP推移グラフ追加"
```

---

## STEP 6｜Cloudflareのデプロイ完了を確認

1. [https://dash.cloudflare.com](https://dash.cloudflare.com) を開く
2. **Workers & Pages** → `Forge_in_Fire` をクリック
3. **Deployments** タブを開く
4. 最新のデプロイが ✅ **Success** になるまで待つ（1〜3分）

---

## STEP 7｜GASの更新（Code.gsが変わった場合のみ）

フロントエンドとは独立して、GASは手動でデプロイが必要。

1. スプレッドシートを開く
2. **拡張機能 → Apps Script**
3. `Code.gs` の内容を全選択して最新版に貼り替え → 保存（Ctrl+S）
4. **デプロイ → デプロイを管理**
5. 鉛筆アイコン（編集）をクリック
6. バージョンを **「新しいバージョン」** に変更
7. **デプロイ** をクリック

> ⚠️ 「新しいバージョン」にしないと変更が反映されないので注意

---

## STEP 8｜動作確認

本番URLを開いて動作を確認する。

- [ ] ホーム画面が正常に表示される
- [ ] 変更した機能が意図通りに動く
- [ ] エラーが出る場合は `/debug` でログを確認

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| pushしてもデプロイが走らない | Cloudflareのダッシュボードで手動Retry |
| ビルドエラーが出る | エラーメッセージをClaudeに貼って相談 |
| アプリは動くがデータが取れない | GASのデプロイを確認（新しいバージョンか？） |
| `Failed to fetch` エラー | GAS_URL環境変数を確認 |
| デプロイはSuccessだが画面が古い | ブラウザのキャッシュをクリア（Ctrl+Shift+R） |
