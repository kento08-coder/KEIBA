# KEIBA

競馬の予想・購入記録・結果分析を一貫して管理するための、個人向けWebアプリです。

**Phase 0（開発基盤）** と **Phase 1 Milestone 1〜4（データモデル・レース／予想管理・期待値計算・購入プラン）** までを実装しています。画面上の成績と`examples/`のJSONは検証用の架空サンプルであり、実在するレースや購入記録ではありません。実購入記録と結果分析は後続マイルストーンで実装します。

Milestone 2では、レース登録、予想JSONのファイル／貼り付け取込、Zod検証プレビュー、詳細分析編集、下書き自動保存、競合検知、確定予想バージョン、差分表示を追加しています。既存下書きの置換前には差分と確認操作を表示し、最新確定版から予想内容が変わっていない再確定は拒否します。クラウド機能はGoogleログイン後に有効になります。

Milestone 3では、全8券種の期待回収率・期待払戻金・期待純利益・損益分岐確率・推定確率優位幅を純粋関数で計算し、確定予想画面で比較できます。未確認値は補完せず、AI推定に基づく参考値であって購入推奨や利益保証ではないことを明示します。

Milestone 4では、期待値重視・保守的ケリー参考・損失抑制の3方式を予算内で比較し、100円単位、点数上限、1点上限を守って提案します。手動調整後のプランは確率・観測時点オッズ・計算結果を含むcreate-onlyスナップショットとしてFirestoreへ保存します。実際の馬券購入は行いません。

## 技術構成

- React + TypeScript + Vite
- Tailwind CSS
- React Router（GitHub Pages対応のHashRouter）
- Firebase Authentication（Googleログイン）
- Cloud Firestore
- Vitest + React Testing Library
- Firebase Emulator + Rules Unit Testing
- GitHub Actions + GitHub Pages

## 必要環境

- Node.js 24.12以上
- npm 10以上
- Firestore Security Rulesテストを実行する場合はJava 21以上
- Firebase CLIは開発依存関係としてインストールされます

## ローカル開発

```bash
npm install
copy .env.example .env.local
npm run dev
```

Windows PowerShell以外では、`copy` の代わりに `cp .env.example .env.local` を使用してください。

Firebaseをまだ設定していない状態でも、画面・通常のユニットテスト・ビルドを確認できます。その場合、アプリには「Firebase未設定」と表示され、ログインとクラウド接続は無効になります。

## Firebaseの初期設定

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクトを作成します。
2. プロジェクトにWebアプリを追加し、表示されたWeb設定値を `.env.local` に入力します。
3. Authenticationの「Sign-in method」でGoogleプロバイダを有効にします。
4. Authenticationの「Settings > Authorized domains」に以下を登録します。
   - ローカル開発用: `localhost`
   - GitHub Pages用: `kento08-coder.github.io`
5. Cloud Firestoreデータベースを作成します。リージョンは利用地域・料金・既存リソースを確認して選択してください（このリポジトリでは推測値を固定していません）。
6. Firebase CLIで対象プロジェクトへログインし、プロジェクトIDを明示してRulesとIndexをデプロイします。

```bash
npx firebase login
npx firebase use --add
npx firebase deploy --only firestore:rules,firestore:indexes
```

ブラウザで使う `VITE_FIREBASE_*` はFirebase Web SDKの公開設定値です。サービスアカウント鍵、秘密APIトークン、管理者秘密鍵は `.env`、フロントエンド、GitHub Secretsのいずれにも追加しないでください。

### 環境変数

`.env.example` を `.env.local` にコピーして設定します。

| 変数 | 必須 | 内容 |
|---|---:|---|
| `VITE_FIREBASE_API_KEY` | はい | Firebase Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | はい | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | はい | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | はい | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | はい | Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | はい | Firebase app ID |
| `VITE_USE_FIREBASE_EMULATORS` | いいえ | ローカルでAuth/Firestore Emulatorを使う場合のみ `true` |

## 品質チェック

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Zodスキーマから外部ツール向けJSON Schemaを再生成する場合は、次を実行します。

```bash
npm run generate:schemas
```

Firestore RulesのテストはEmulatorを自動起動して実行します。

```bash
npm run test:rules
```

## Firestoreのアクセス制御

`firestore.rules` は、認証済みユーザーが自分自身の `/users/{uid}` 配下にある既知のコレクションだけへアクセスできる構成です。

- 未認証アクセス: 拒否
- 別UIDのデータ: 拒否
- 未定義コレクションと `/users/{uid}` 以外: 拒否
- 確定予想、購入プラン、確定購入、確定結果、取込ログ: 更新・削除を拒否
- 購入プラン: 所有UID、許可フィールド、主要型、配列件数、プランID、元の確定予想、提案フラグ、戦略、予算・集計額の基本範囲、サーバー保存日時をcreate時に検証
- 予想下書き: `revision=1`から開始し、更新ごとに`+1`だけ許可。削除を拒否

Firebase ConsoleでFirestoreを本番運用する前にRulesをデプロイしてください。フロントエンド上の表示制御はセキュリティ境界ではなく、Rulesが最終的な防御です。

購入プランの期待値再計算や確定予想候補配列との全件突合はSecurity Rulesでは行いません。クライアント側検証は通常操作の整合性確認であり、直接書き込みへの完全な改ざん防止ではありません。完全なサーバー側検証が必要な運用では、Cloud Functionsなどの信頼できるバックエンド経由に限定してください。

## GitHub Pagesへの公開

`.github/workflows/deploy.yml` は `main` へのpushまたは手動実行で、検査・ビルド・GitHub Pagesデプロイを行います。

GitHubリポジトリで次を設定してください。

1. **Settings > Pages > Build and deployment > Source** を **GitHub Actions** に変更します。
2. **Settings > Secrets and variables > Actions > Variables** に以下を登録します（値はFirebase ConsoleのWebアプリ設定から取得）。
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
3. デプロイ後、`https://kento08-coder.github.io/KEIBA/` を開きます。

Firebase Web設定値はクライアントへ配信される公開設定ですが、Actions Variablesを使うことでリポジトリに環境固有値を固定しません。

## npm scripts

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバーを起動 |
| `npm run lint` | ESLintを実行 |
| `npm run generate:schemas` | ZodからJSON Schemaを生成 |
| `npm run typecheck` | TypeScript型チェック |
| `npm run test` | UIユニットテストを実行 |
| `npm run test:rules` | Firestore RulesテストをEmulatorで実行 |
| `npm run build` | 型チェック後に本番ビルド |
| `npm run preview` | 本番ビルドをローカル確認 |

## ディレクトリ構成

```text
src/
  app/                       # ルーティングとアプリシェル
  components/                # 共通UI
  domain/                    # 型、Zod検証、期待値・差分・ハッシュ用純粋処理
  features/auth/             # 認証コンテキストとUI
  features/races/            # レースモデルとリアルタイム購読
  features/predictions/      # 予想プレビューと編集UI
  features/bets/             # 期待値比較・購入プランUI
  infrastructure/firebase/  # Firebase初期化
  infrastructure/repositories/ # Firestore transaction／購読境界
  pages/                     # 画面とルーティング
tests/domain/                # JSON検証テスト
tests/ui/                    # JSON取込・画面テスト
tests/rules/                 # Firestore Security Rulesテスト
```

## Phase 1設計資料

- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md): Firestoreのコレクション、不変性、重複防止
- [`docs/IMPORT_FORMAT.md`](docs/IMPORT_FORMAT.md): prediction/result JSON v1
- [`docs/ROADMAP.md`](docs/ROADMAP.md): Phase 1の6マイルストーン
- [`docs/EXPECTED_VALUE.md`](docs/EXPECTED_VALUE.md): 期待値・展開加重計算仕様
- [`docs/PURCHASE_PLANS.md`](docs/PURCHASE_PLANS.md): 3方式の資金配分・保存仕様
- [`docs/SETTLEMENTS.md`](docs/SETTLEMENTS.md): 実購入、結果、訂正履歴、払戻・収支計算
- [`docs/SECURITY_AUDIT.md`](docs/SECURITY_AUDIT.md): 依存関係とActionsの確認結果
- [`schemas/`](schemas/): 生成JSON Schema
- [`examples/`](examples/): 架空テンプレートとサンプル

確定要件は [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) を参照してください。
