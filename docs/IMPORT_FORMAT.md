# JSONインポート形式 v1

- スキーマ版: `1.0.0`
- 対象: prediction / result
- 文字コード: UTF-8
- 最大サイズ: 1 MiB
- Zod実装: `src/domain/validation/`
- JSON Schema: `schemas/`
- サンプル: `examples/`

Zodスキーマをランタイム検証の正とする。生成JSON Schemaは外部エディタ向けであり、確率合計や他配列との参照整合など一部の相互検証はZodでのみ実施する。

## 1. 共通フィールド

| フィールド | 必須 | 内容 |
|---|---:|---|
| `schema_version` | はい | `1.0.0` |
| `document_type` | はい | `prediction` または `result` |
| `race_id` | はい | `YYYY-MM-DD-VENUE-00-ORGANIZER` |
| `generated_at` | はい | タイムゾーン付きISO 8601 |
| `source_agent` | はい | 生成元識別子。AI名・ツール名など |
| `sources` | はい | 確認元の配列。空配列は予想では警告、確定結果ではエラー |
| `notes` | いいえ | 文書全体の注記 |

`sources[].checked_at`は情報を確認した日時であり、レース発走時刻や生成時刻とは区別する。URL、タイトル、確認日時を保存する。

## 2. prediction

### 2.1 レース

`race`には開催日、主催者コード、競馬場コード、レース番号、名称、馬場、距離、馬場状態、天候を記録する。`race_id`はこれらの識別項目と一致しなければならない。

### 2.2 展開シナリオ

`scenarios[]`は次を持つ。

- `id`: 文書内で一意の小文字ID
- `label`: 表示名
- `pace`: `slow` / `middle` / `high` / `unknown` / `other`
- `probability`: 0〜1
- `projected_order`: 馬番と想定位置
- `favored_styles`: 有利とみる脚質
- `reason`: 根拠
- `confidence`: `high` / `medium` / `low` / `unknown`

全シナリオの`probability`合計は、許容誤差`1e-6`以内で1でなければならない。隊列の馬番は`horses[]`に存在し、同一シナリオ内で重複できない。

### 2.3 馬評価

`horses[]`は馬番・枠番・馬名・脚質・過去実績・状態・馬場適性・距離適性・展開別評価・確率・根拠・確信度を保持する。

`probabilities.win <= probabilities.top2 <= probabilities.top3`を満たす必要がある。未設定は`null`とし、自動補完しない。`0`と`null`は異なる。

### 2.4 馬券候補

| `bet_type` | 日本語 | 番号数 | 順序 |
|---|---|---:|---|
| `win` | 単勝 | 1 | なし |
| `place` | 複勝 | 1 | なし |
| `bracket_quinella` | 枠連 | 2 | 昇順（値は1〜8の枠番。同一枠のゾロ目可） |
| `quinella` | 馬連 | 2 | 昇順 |
| `wide` | ワイド | 2 | 昇順 |
| `exacta` | 馬単 | 2 | 入力順を保持 |
| `trio` | 三連複 | 3 | 昇順 |
| `trifecta` | 三連単 | 3 | 入力順を保持 |

- 枠連を除き、同じ番号の重複は禁止。
- 枠連以外の番号は`horses[].horse_number`に存在する必要がある。
- 枠連の番号は出走馬の`frame_number`に存在する必要がある。
- 枠連のゾロ目（例: `1-1`）は、該当枠に出走馬が2頭以上登録されている場合だけ有効。
- `odds`と`odds_observed_at`は両方設定または両方`null`。
- `odds`は元本込み十進オッズの`1.0`以上。JRAで100円元返しが`1.0倍`表示となるため、境界値`1.0`を許容する。
- `hit_probability`が`null`なら`probability_source`は`unset`。
- 確率またはオッズが`null`の候補は正常に取り込むが、期待値未算出の警告を返す。

#### 枠連の対応範囲

- JRA: 1〜8枠の枠番号二連勝複式を`bracket_quinella`として扱う。通常は発売開始時の出走馬が9頭以上の場合に発売され、8頭以下でも同じ枠に2頭以上出走する場合は発売対象となる。海外競馬のJRA発売は対象外。
- NAR: 1〜8枠の枠番号二連勝複式（枠連複）を`bracket_quinella`として扱う。出走馬9頭以上で発売され、発売開始後の取消等で8頭以下になっても2頭以上いる枠がある場合は発売が継続される。枠連単は今回の8券種に含めない。
- 本スキーマは買い目の枠番とゾロ目成立条件を検証する。発売開始時刻、取消発生時刻、発売事業者を保持していないため、個別レースで枠連が実際に発売されたかはインポート元の公式情報で確認する。

公式確認資料:

- [JRA「馬券の種類」](https://www.jra.go.jp/kouza/beginner/baken/)
- [JRA「馬券のルール」](https://www.jra.go.jp/kouza/baken/index.html)
- [JRA「JRAプラス10」](https://www.jra.go.jp/kouza/plus10/)
- [地方競馬情報サイト「FAQ」](https://www.keiba.go.jp/qa.html)
- [地方競馬情報サイト「買い方を決める」](https://www.keiba.go.jp/beginner/step3.html)

## 3. result

### 3.1 着順

`finishers[]`は全出走馬を対象とし、`horse_number`と1〜8の`frame_number`を保持する。`status=finished`には`rank`が必須。取消・除外・失格・競走中止は`rank=null`とする。同着は複数馬に同じ`rank`を設定する。

### 3.2 払戻・返還

`payouts[]`には券種、番号組、`payout_type`、100円当たりの金額、公式確認状態、出典参照を保存する。

- `payout_type=payout`: 的中払戻
- `payout_type=refund`: 取消等の返還
- `result_status=confirmed`では全払戻の`official_confirmed=true`を必須とする。
- 枠連の番号は実際に出走した馬の枠番に存在し、ゾロ目は取消・除外を除いて同じ枠に2頭以上いる場合だけ有効。
- `source_refs`は券種にかかわらず`sources[]`に存在するIDまたはURLを指定する。
- 公式情報に基づかない推定払戻は登録しない。

### 3.3 観測事実と解釈

- `observed_pace`: 実際のペース、根拠、検証状態、通過順
- `interpretation`: レース展開の解釈と確信度

`observed_pace.verified=false`は有効だが、分析集計から除外する警告を返す。

## 4. エラーと警告

### エラー（保存不可）

- JSON構文不正、1 MiB超過
- 未知の`schema_version`または`document_type`
- 未知券種、必要番号数の不一致、枠連以外の番号重複、成立しない枠連ゾロ目
- 1〜8外の枠番、1.0未満のオッズ
- 0〜1外の確率、シナリオ確率合計不一致
- 馬番重複、存在しない馬番参照
- `win > top2`または`top2 > top3`
- 確定結果に出典がない、公式未確認の払戻がある
- 同じ払戻レコードの重複

### 警告（保存可能）

- 予想の出典なし
- 馬の確率に`null`がある
- 展開別評価が不足している
- 馬券候補が空（見送り）
- 馬券候補の確率またはオッズが未設定
- 実際の展開が未検証

警告値をゼロや既定値に置き換えない。

## 5. サンプル

- `examples/prediction.template.json`: 入力用の詳細テンプレート。すべて架空。
- `examples/prediction.sample.json`: 全8券種を含む検証用サンプル。すべて架空。
- `examples/result.sample.json`: 着順・公式払戻・通過順を含む検証用サンプル。すべて架空。

テンプレート内の`unknown`と`null`は、確認できた値だけに置き換える。実在情報としてそのまま保存しない。

## 6. Milestone 2での取込フロー

Milestone 2で、ファイルとテキスト貼付けの両方を同じ`parseAndValidateImportJson`へ渡す。検証結果をプレビューし、エラー0件の場合だけ下書きへ反映する。確定版は上書きしない。

## 7. Milestone 3での期待値計算

`bet_candidates[]`の`hit_probability`、`odds`、`odds_observed_at`を使い、確定予想の表示時に期待値を再計算する。`odds_observed_at`はオッズの観測日時であり、最終オッズの確定状態を表さない。`odds`と観測日時が両方記録済みの場合に「観測時点のオッズ」として計算する。計算結果をインポートJSONの正とはせず、未設定・不正・観測日時のない値は未算出とする。詳細は[`EXPECTED_VALUE.md`](EXPECTED_VALUE.md)を参照する。

現行v1スキーマはオッズ範囲と展開別の馬券条件付き的中確率を持たない。単一値や各馬評価から補完せず、将来のスキーマ版更新まで未算出として扱う。
