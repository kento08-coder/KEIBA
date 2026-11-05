# 依存関係・GitHub Actions確認

- 確認日: 2026-11-05
- コマンド: `npm audit --json`、`npm ls firebase @firebase/firestore @grpc/grpc-js @firebase/rules-unit-testing --all`

## 1. npm audit

監査結果は合計29件（moderate 24、high 5、critical 0）。`npm audit fix --force`は実行していない。

high 5件は、次の1つの脆弱性が依存経路上の複数パッケージへ伝播して数えられている。

| 対象 | 現在 | 内容・影響 | 修正版 |
|---|---|---|---|
| `@grpc/grpc-js` | `1.9.16`（`firebase@13.2.0` → `@firebase/firestore@4.19.1`） | [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j)。特定のgRPCサーバー設定で、未承認のクライアント証明書を`getAuthContext()`が承認済みのように返す可能性 | `1.13.6`または`1.14.5`以上の修正版系列 |
| `@firebase/firestore` / `@firebase/firestore-compat` | `4.19.1` / `0.4.17` | 上記`@grpc/grpc-js`を含むためhighとして集計 | Firebase側の依存更新待ち |
| `firebase` | `13.2.0` | 上記Firestore依存の集約 | `npm audit`は`9.14.0`へのmajor downgradeを提示するため採用しない |
| `@firebase/rules-unit-testing` | `6.0.0` | `firebase`依存を通じた集約。開発・Emulatorテスト用途 | Firebase側の依存更新待ち |

KEIBAの公開アプリはGitHub Pages上の静的ブラウザクライアントであり、gRPCサーバーや`getAuthContext()`を実行しない。RulesテストもgRPCクライアントとしてEmulatorへ接続するため、今回の脆弱なサーバー構成には該当しないと判断する。ただし依存ツリー上のhighであるため、Firebaseが修正版`@grpc/grpc-js`をサポート範囲へ取り込んだ時点で更新する。

`@firebase/firestore`は`@grpc/grpc-js`を`~1.9.0`に固定している。手動overrideで1.14系へ上げるとFirebaseが宣言した互換範囲を越えるため、今回のPRでは行わない。

## 2. GitHub Actions

Node 20ランタイムの将来廃止警告に対応するため、次を更新する。

| 既存 | 更新 | 対象workflow |
|---|---|---|
| `actions/checkout@v4` | `actions/checkout@v7` | CI / Pages |
| `actions/setup-node@v4` | `actions/setup-node@v7` | CI / Pages |
| `actions/setup-java@v4` | `actions/setup-java@v6` | CI |

`configure-pages@v5`、`upload-pages-artifact@v3`、`deploy-pages@v4`は今回の警告対象ではないため変更しない。更新後はPRのGitHub-hosted runnerでCIを確認する。
