# Phase 1 実装計画

要件ソースは[`REQUIREMENTS.md`](REQUIREMENTS.md)。各マイルストーンは個別PRで完了し、確認後に次へ進む。

## Milestone 1 — データモデル・JSONスキーマ（完了）

- Firestoreコレクションと不変性の設計
- prediction/resultのTypeScript型・Zodスキーマ
- JSON Schema生成
- 詳細テンプレートと架空サンプル
- 正常系・異常系・警告のユニットテスト
- 既知コレクション限定のSecurity Rulesと確定予想の不変化

## Milestone 2 — レース・予想管理（完了）

- `features/races`、`features/predictions`、薄いFirestore repository層
- レース一覧・詳細・登録
- ファイル／テキスト取込、共通プレビュー
- 詳細分析編集、1〜2秒debounce自動保存
- revisionによる競合検知
- transactionによる確定版発行、バージョン比較

## Milestone 3 — 期待値計算エンジン（完了）

- `domain/calculations`にFirebase非依存の純粋関数
- 全8券種の組合せ正規化
- 期待回収率・期待純利益
- 未設定値の明示と候補CRUD
- 固定入力による決定論的ユニットテスト

## Milestone 4 — 購入プラン生成（完了）

- 期待値重視・1/4ケリー参考・損失抑制
- 100円単位・点数上限・1点上限・総予算上限
- 自動／手動券種選択
- 見送り、未使用額、最大損失、前提表示
- 相関を扱わない参考配分である旨の警告

## Milestone 5 — 購入記録・結果登録（今回）

- 提案と実購入の分離スナップショット
- 確定購入・訂正履歴・冪等性キー
- 結果JSON取込と手動編集
- 的中・払戻・返還・損益・回収率
- transactionによる二重計上防止

## Milestone 6 — ホーム・クラウド同期

- 通算KPI、レース一覧、状態表示
- Firestoreリアルタイム同期
- 読込中・保存中・保存済み・同期失敗表示
- ログアウト時の個人データ消去
- 320px・PC・複数端末の受入テスト

## 想定ファイル構成

```text
src/
  domain/
    types/
    validation/
    calculations/        # Milestone 3
  features/
    races/               # Milestone 2
    predictions/         # Milestone 2
    bets/                # Milestone 3–4
    purchases/           # Milestone 5
    results/             # Milestone 5
  infrastructure/
    firebase/
    repositories/        # Milestone 2以降
schemas/
examples/
tests/
  domain/
  rules/
```

UIからZod・計算関数を直接Firestore形式へ結合せず、feature serviceとrepositoryを境界にする。
