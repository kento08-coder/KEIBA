# Firestoreデータモデル

- 対象: Phase 1 MVP
- スキーマ版: `1.0.0`
- 更新日: 2026-11-05
- 要件ソース: [`REQUIREMENTS.md`](REQUIREMENTS.md)

## 1. 設計原則

1. すべての利用者データを `/users/{uid}` 配下に置き、Security Rulesで認証UID一致を必須にする。
2. 確定予想、確定購入、確定結果は上書きせず、訂正時は新しいドキュメントを追加して参照関係を残す。
3. JSONインポート値は外部入力として扱い、Zod検証を通過したスナップショットだけを保存する。
4. 確率・オッズ・観測事実・解釈を分離し、不明値を推測で補完しない。
5. 二重取込と二重計上を `contentHash`、`idempotencyKey`、Firestore transactionで防止する。
6. Firestoreの1ドキュメント上限を考慮し、将来、馬別評価や出典を子コレクションへ分割できる構造にする。

## 2. コレクション構造

```text
/users/{uid}/profile/main
/users/{uid}/races/{raceId}
/users/{uid}/races/{raceId}/predictionVersions/{versionId}
/users/{uid}/races/{raceId}/drafts/current
/users/{uid}/races/{raceId}/plans/{planId}
/users/{uid}/races/{raceId}/purchases/{purchaseId}
/users/{uid}/races/{raceId}/results/{resultId}
/users/{uid}/bankrollTransactions/{transactionId}
/users/{uid}/settings/main
/users/{uid}/importLog/{importId}
```

`raceId` は原則 `YYYY-MM-DD-{venueCode}-{raceNumber2桁}-{organizer}` とする。例: `2026-11-08-TOKYO-11-JRA`。開催を一意に表せない場合は、スキーマ版を更新して識別子の追加方法を決定する。推測したコードは使用しない。

## 3. ドキュメント定義

### 3.1 `/races/{raceId}`

レース一覧とホーム画面で使用する小さな集約ドキュメント。

| フィールド | 型 | 内容 |
|---|---|---|
| `raceId` | string | ドキュメントIDと同値 |
| `date` | string | `YYYY-MM-DD` |
| `organizer` | string | 主催者コード |
| `venueCode` | string | 競馬場コード |
| `raceNumber` | integer | レース番号 |
| `name` | string | レース名 |
| `surface` | string | 芝・ダート等 |
| `distanceM` | integer | 距離（m） |
| `status` | enum | `registered` / `predicting` / `prediction_confirmed` / `purchased` / `result_recorded` |
| `latestPredictionVersionId` | string \| null | 最新確定予想への参照 |
| `resultStatus` | enum | `none` / `draft` / `confirmed` |
| `createdAt` | Timestamp | 作成日時 |
| `updatedAt` | Timestamp | 更新日時 |

### 3.2 `/predictionVersions/{versionId}`

確定予想の不変スナップショット。作成後のupdate/deleteはSecurity Rulesでも拒否する。

確定transactionでは最新確定版と下書きの実質的な予想内容を比較する。`generated_at`と`change_reason`だけの変更は新しい予想内容とは扱わず、重複バージョンの作成を拒否する。展開、馬評価、馬券候補などが変更された場合だけ次のversionを作成する。

| フィールド | 型 | 内容 |
|---|---|---|
| `versionNumber` | positive integer | レース内の連番 |
| `parentVersionId` | string \| null | 派生元バージョン |
| `status` | literal `final` | 確定状態 |
| `schemaVersion` | literal `1.0.0` | インポートスキーマ版 |
| `snapshot` | PredictionDocument | 確定時の全予想 |
| `contentHash` | string | 正規化JSONのSHA-256 |
| `authorUid` | string | 確定したユーザーUID |
| `changeReason` | string | 変更理由 |
| `createdAt` | Timestamp | 作成日時 |
| `confirmedAt` | Timestamp | 明示確定日時 |

### 3.3 `/drafts/current`

編集可能な予想下書き。Milestone 2で1〜2秒のdebounce保存を実装する。

| フィールド | 型 | 内容 |
|---|---|---|
| `baseVersionId` | string \| null | 編集元の確定版 |
| `revision` | positive integer | 楽観ロック用リビジョン。初回保存は1、以後1ずつ加算 |
| `lastEditedAt` | Timestamp | 最終編集日時 |
| `lastEditedByClient` | string | 端末・タブ識別子 |
| `schemaVersion` | literal `1.0.0` | スキーマ版 |
| `payload` | PredictionDocument | 編集中スナップショット |

保存時はtransaction内で現在の`revision`を確認し、競合時に黙って上書きしない。JSON取込時はプレビュー時点の`revision`を固定し、既存下書きとの差分と置換確認を表示する。確認中に別端末が更新した場合も古い`revision`として拒否する。Security Rulesでも初回`revision=1`と更新ごとの`+1`を要求し、下書きの削除を拒否する。

### 3.4 `/plans/{planId}`

購入提案の不変スナップショット。Milestone 4で実装する。

| フィールド | 型 | 内容 |
|---|---|---|
| `planId` | string | ドキュメントIDと同値。再試行時の重複保存防止キー |
| `sourcePredictionVersionId` | string | 元の確定予想バージョンID |
| `name` / `memo` | string | ユーザーが編集した名称とメモ |
| `strategy` | enum | `expected_value` / `fractional_kelly` / `loss_control` |
| `budgetYen` | non-negative integer | 設定予算 |
| `settings` | map | 点数上限、1点上限、券種指定、ケリー係数、損失抑制使用率 |
| `candidateSnapshot` | array | 使用候補の確率・オッズ・観測日時・確信度・根拠 |
| `allocations` | array | 候補ID、100円単位の購入額、期待値計算結果 |
| `summary` | map | 使用額、未使用額、期待利益線形和、全不的中時損失額 |
| `algorithmVersion` | string | 初期版は`phase1-m4-v1` |
| `assumptions` / `warnings` | string[] | 相関・推定値・計算前提 |
| `authorUid` | string | 保存したユーザーUID |
| `createdAt` | Timestamp | サーバー保存日時 |
| `isSimulation` | literal `true` | 実購入ではない提案であることを明示 |

保存transactionで元の確定予想の存在と同一`planId`の未保存を確認し、候補ID、券種、番号組、確率、オッズ、観測日時、確信度、確率出所を元の確定予想と突合する。Security Rulesでも所有UID、許可フィールド、主要型、配列件数、ドキュメントIDと`planId`の一致、元の確定予想の存在、提案フラグ、戦略、予算、集計額の基本関係、サーバー保存日時を検証する。提案確定後は編集せず、再計算・手動調整後の再保存は別IDで作成する。元予想やオッズが後で変更されても`candidateSnapshot`と計算結果は書き換えない。

### 3.5 `/purchases/{purchaseId}`

実購入の記録。外部馬券購入処理ではない。Milestone 5で実装する。

- `sourcePlanId?`
- `sourcePredictionVersionId`
- `placedAt`
- `recordedAt`
- `status`: `draft` / `confirmed` / `corrected`
- `items`
- `totalStakeYen`
- `idempotencyKey`
- `correctionOf?`

提案内容を直接変更せず、実購入は独立スナップショットとして保存する。確定後の訂正は`correctionOf`を持つ新規レコードにする。

### 3.6 `/results/{resultId}`

結果JSONとアプリ内編集結果を保存する。Milestone 5で実装する。

- `status`: `draft` / `confirmed` / `corrected`
- `payload`: ResultDocument
- `contentHash`
- `importId`
- `createdAt`
- `updatedAt`

観測事実（着順・公式払戻・通過順）と解釈（展開評価）を`payload`内で分離する。

### 3.7 `/bankrollTransactions/{transactionId}`

Phase 2で本格実装する台帳。Phase 1では購入・払戻の一貫性を保つための参照設計だけを維持する。

- `kind`: `deposit` / `withdrawal` / `stake` / `payout` / `adjustment`
- `amountYen`
- `referenceId`
- `idempotencyKey`
- `at`

残高は台帳合計を正とし、集約値は再計算可能なキャッシュとして扱う。

### 3.8 `/importLog/{importId}`

二重取込防止と監査のための記録。

- `documentType`: `prediction` / `result`
- `raceId`
- `schemaVersion`
- `contentHash`
- `targetId`
- `sourceFileName`
- `importedAt`

`contentHash`は、キー順序を正規化した検証済みJSONから計算する。同一ユーザー内で同じ`documentType + raceId + contentHash`を再登録しない。

## 4. 日時と数値

- JSON交換: タイムゾーン付きISO 8601文字列。原則`+09:00`。
- Firestore保存: 監査用日時はFirestore `Timestamp`へ変換する。
- 金額: 非負整数JPY。購入額は100円単位。
- 確率: 0〜1の小数。`null`は未設定、`0`は推定0として区別する。
- オッズ: 元本込み十進オッズ。未確認は`null`。
- 結果の`finishers[]`は馬番に加えて1〜8の`frame_number`を保持し、枠連の払戻組合せを検証できるようにする。

## 5. 不変性とトランザクション

- `predictionVersions`: create/readのみ。update/delete禁止。
- `drafts/current`: `revision`比較を伴うtransactionで更新。
- `plans`: 確定提案は不変。再生成は新規作成。
- `purchases`: 確定記録の訂正は新規作成。
- `results`: 確定結果の訂正は新規作成。
- 購入・払戻・台帳更新は同一transaction/batchで処理し、`idempotencyKey`を検査する。

## 6. Security Rules

Milestone 1では既知のコレクションだけを許可し、その他をデフォルト拒否する。認証済みでも別UIDにはアクセスできない。`predictionVersions`、`plans`、`importLog`、台帳は所有者でもupdate/deleteできない。購入と結果はdraftのみ更新・削除でき、confirmed/correctedは不変とする。

Rulesはデータ内容すべての妥当性を保証するものではない。特に任意長配列の全要素集計、期待値の完全再計算、確定予想内の候補配列との完全な突合は行わない。Zod検証、repository層、transaction、Rulesを重ねるが、クライアント検証とクライアント上のtransaction比較は直接書き込みに対する完全な改ざん防止ではない。完全なサーバー側検証が必要な場合は、Cloud Functionsなどの信頼できるバックエンド経由だけで作成する。

## 7. インデックス方針

Milestone 2以降、実際のクエリを追加した時点で`firestore.indexes.json`へ必要最小限の複合インデックスを追加する。現時点で推測によるインデックスは作成しない。
