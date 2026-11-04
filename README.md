# KEIBA

競馬の予想・購入記録・結果分析を一貫して管理するための、個人向けWebアプリです。

現在は **Phase 0（開発基盤）** までを実装しています。画面上の成績・レース情報はUI確認用のサンプルであり、実在するレースや購入記録ではありません。予想JSONの取り込み、購入プラン生成、実購入記録、結果分析はPhase 1以降で実装します。

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

Firestore RulesのテストはEmulatorを自動起動して実行します。

```bash
npm run test:rules
```

## Firestoreのアクセス制御

`firestore.rules` は、認証済みユーザーが自分自身の `/users/{uid}/**` のみ読み書きできる構成です。

- 未認証アクセス: 拒否
- 別UIDのデータ: 拒否
- `/users/{uid}` 以外: 拒否

Firebase ConsoleでFirestoreを本番運用する前にRulesをデプロイしてください。フロントエンド上の表示制御はセキュリティ境界ではなく、Rulesが最終的な防御です。

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
  features/auth/             # 認証コンテキストとUI
  infrastructure/firebase/  # Firebase初期化
  pages/                     # Phase 0の画面骨格
tests/rules/                 # Firestore Security Rulesテスト
```

詳細な確定要件と段階計画は [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) を参照してください。
