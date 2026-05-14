# shuppi

クレジットカードの利用明細CSVを読み込み、支出を可視化するローカル向けWebアプリです。

## 機能

- **支払先別グラフ**: 期間・カードを絞り込んで横棒グラフで支出を確認
- **全履歴統計表**: 支払先ごとの合計・件数・平均・最大をテーブルで確認。インクリメンタル検索対応
- **店舗名正規化**: 全角→半角変換・末尾トランザクションID除去・Fuse.jsによるファジーマッチングで類似店舗名を自動クラスタリング
- **重複排除**: 同日・同店舗・同金額の重複明細を自動除去

## 対応フォーマット

| ディレクトリ | カード | エンコード |
|---|---|---|
| `data/platinum-preffered/` | 三井住友カードプラチナプリファード | Shift_JIS |
| `data/paypay-private/` | PayPayカード（プライベート） | UTF-8 |
| `data/paypay-work/` | PayPayカード（仕事用） | UTF-8 |
| `data/jcb-w/` | JCBカードW | Shift_JIS |

各ディレクトリにカード会社のマイページからエクスポートしたCSVを配置してください。

## セットアップ

```bash
pnpm install
pnpm dev
```

## コマンド

| コマンド | 説明 |
|---|---|
| `pnpm dev` | 開発サーバー起動 |
| `pnpm build` | プロダクションビルド |
| `pnpm preview` | ビルド結果のプレビュー |
| `pnpm test` | テスト実行 |
| `pnpm test:watch` | テストをウォッチモードで実行 |
| `pnpm test:coverage` | カバレッジ付きテスト実行 |
| `pnpm lint` | Lintチェック |

## 技術スタック

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/)
- [Recharts](https://recharts.org/) — グラフ描画
- [Fuse.js](https://www.fusejs.io/) — 店舗名ファジーマッチング
- [Vitest](https://vitest.dev/) — テスト
