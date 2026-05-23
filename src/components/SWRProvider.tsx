// src/components/SWRProvider.tsx
// =====================================================================
// SWR グローバル設定プロバイダ ★ Phase 17.1
// =====================================================================
//
// 目的:
//   Phase 17.1 で導入した localStorage 永続化キャッシュ（swrCache.ts）を
//   SWRConfig 経由でアプリ全体に適用する。
//
// 設計:
//   - Server Component (layout.tsx) は localStorage にアクセスできないため、
//     Client Component として独立させる
//   - createPersistedCache はファクトリ関数として渡す（SWRが1度だけ呼ぶ）
//
// ★ 型注記:
//   SWRのprovider型は (cache: Cache) => Cache だが、内部実装はMapと完全互換。
//   Mapを返すのはSWR公式ドキュメントの推奨パターン:
//     https://swr.vercel.app/docs/advanced/cache#localstorage-based-persistent-cache
//   ただしTypeScriptの厳密な型チェックでは Map<string, unknown> と
//   Cache<any> の get() 戻り値型が不整合になるため、SWRConfig の
//   provider プロパティに渡す際に型アサーションでブリッジする。
// =====================================================================

'use client';

import { SWRConfig, type Cache } from 'swr';
import { createPersistedCache } from '@/lib/swrCache';

interface SWRProviderProps {
  children: React.ReactNode;
}

export default function SWRProvider({ children }: SWRProviderProps) {
  return (
    <SWRConfig
      value={{
        // ★ Phase 17.1: localStorage 永続化キャッシュプロバイダ
        // SWRはこのファクトリを1度だけ呼び出して Map を取得し、
        // その Map を全フックの共通キャッシュとして使う。
        //
        // 型アサーションについて:
        //   SWR公式ドキュメントでは Map を返すのが推奨パターンだが、
        //   TypeScriptの型定義では Cache<any> を要求する。
        //   実装上 Map と Cache は同じインターフェース（get/set/delete/keys）
        //   を持つため、ランタイムでは完全に互換である。
        provider: createPersistedCache as unknown as () => Cache,
      }}
    >
      {children}
    </SWRConfig>
  );
}
