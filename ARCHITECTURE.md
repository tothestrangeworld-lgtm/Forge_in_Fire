# 百錬自得 (Forged in Fire) - System Architecture

## 1. システム概要
『百錬自得』は、剣道における日々の稽古（与打・被打・課題進捗）を記録し、プレイスタイルや弱点を可視化するPWA対応のデータ分析アプリケーションである。
仲間との見取り稽古（相互評価）機能や、データに応じた称号（Epithet）付与など、ゲーミフィケーションを通じたモチベーション向上を目的とする。

## 2. 技術スタック
- **Frontend**: Next.js 15 (App Router), React, TypeScript
- **Styling**: Tailwind CSS
- **Charts / UI**: Recharts (Playstyle/Radar), React Flow (SkillGrid), Lucide React (Icons)
- **Backend / Database**: Google Apps Script (GAS) + Google Sheets
- **Hosting**: Cloudflare Pages
- **Web Push**: Cloudflare Workers + VAPID

## 3. ディレクトリ構成
```text
C:\Forge_in_Fire
├── ARCHITECTURE.md       # システムアーキテクチャ設計書（本番構成）
├── DB_SCHEMA.md          # データベース（Google Sheets）スキーマ定義
├── DEPLOY_GUIDE.md       # デプロイ手順書（Cloudflare, GAS）
├── ROADMAP.md            # 開発ロードマップ・Phase管理
├── gas/
│   └── Code.gs           # バックエンド（API, データベース操作, Push通知バッチ）
├── src/
│   ├── app/              # Next.js App Router (ページ群)
│   │   ├── achievements/ # 実績・バッジ一覧画面
│   │   ├── api/          # Next.js API Routes (GAS中継, Push配信用)
│   │   ├── debug/        # 開発・デバッグ用画面
│   │   ├── login/        # ログイン・新規登録画面
│   │   ├── record/       # 稽古記録画面（与打・被打・課題一括登録）
│   │   ├── rivals/       # 門下生一覧（プルダウンソート対応）＆詳細画面
│   │   ├── settings/     # プロフィール・課題設定画面
│   │   ├── globals.css   # グローバルスタイル（サイバーネオン定義）
│   │   ├── layout.tsx    # 全体レイアウト（PWA対応, AuthGuard）
│   │   ├── manifest.ts   # PWAマニフェスト生成
│   │   └── page.tsx      # マイページ（ダッシュボード, 各種チャート表示）
│   ├── components/       # UIコンポーネント
│   │   ├── charts/       # グラフ・可視化コンポーネント（SkillGrid, RadarChart等）
│   │   ├── AuthGuard.tsx # 認証ガード・リダイレクト処理
│   │   └── Navigation.tsx# 下部ナビゲーションバー
│   ├── lib/              # 共通ロジック・APIクライアント
│   │   ├── api.ts        # GAS通信クライアント (SWRラッパー)
│   │   ├── auth.ts       # 認証状態管理 (localStorage)
│   │   ├── epithet.ts    # 称号計算ロジック
│   │   ├── mastery.ts    # 部位別修練度計算
│   │   └── webpush-edge.ts # Web Pushクライアント処理
│   └── types/
│       └── index.ts      # TypeScript 型定義 (全アプリ共通)
├── worker/
│   └── index.ts          # Cloudflare Workers エッジ処理（オプション用）
├── open-next.config.ts   # OpenNext 設定
├── tailwind.config.ts    # Tailwind 設定
└── wrangler.toml         # Cloudflare Workers デプロイ設定