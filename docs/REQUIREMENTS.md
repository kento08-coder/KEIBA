# 競馬購入サポート・分析Webアプリ 開発仕様書

- 文書版: 1.0 / 作成日: 2026-11-04
- 想定読者: 開発者・Codex
- ステータス: 要件定義／段階開発計画（未実装）

## 0. 目的と非目的

**目的**: ChatGPT/Codexとユーザーが作成したレース予想をJSONで取り込み、展開シナリオ・各馬の評価・馬券ごとの推定的中確率・オッズ・判断根拠を保存する。予算内で複数の購入プランを比較し、編集した実購入・確定結果・予想精度まで一貫して追跡し、長期的な予想改善に役立てる。

**非目的（初期）**: 馬券の自動注文、JRA等のログイン操作、無許可スクレイピング、リアルタイムオッズAPI連携、生成AIのアプリ内実行、AI確率の正確性保証、必勝や利益保証、独自確率モデルの初期実装。

外部で取得したオッズと確率は観測・推定日時を保存する。締切時にオッズが異なる可能性がある。購入操作は対象の正規販売サービスでユーザー自身が行う。本アプリの「購入確定」は**記録操作**である。

## 1. 確定要件

1. PCとスマホに対応したレスポンシブWebアプリ。ホームは成績と登録レースをバランスよく表示。
2. 個人サーバーなしで公開。GitHub Pages上の静的Reactアプリと、Firebase Authentication/Cloud Firestoreでログイン・クラウド同期。初期は単一利用者向けだがデータはユーザーIDで隔離。
3. ChatGPT/Codexによる**詳細分析型予想JSON**をファイルアップロード／テキスト貼り付けで取り込み、スキーマ検証とプレビュー後に保存。
4. レースごとに前日・当日・最終など任意数の予想バージョンを保持。確定版は不変、編集はクラウド自動保存の下書きに対して行い、ユーザーの明示操作で新バージョンを発行する。
5. 展開シナリオ（確率・隊列・根拠）、馬番・枠順・脚質・過去実績・状態・馬場/距離適性・展開別評価、勝率/連対率/複勝率、根拠、出典、確実性を保存する。
6. 馬券候補はAI推奨が初期値。アプリで追加/編集/削除可能。券種・馬番組・オッズ・推定的中確率・根拠・情報源を管理。確率がない候補は期待値未算出とし自動補完しない。
7. 券種は自動選択モードと指定モードを切替。初期対応: 単勝・複勝・枠連・馬連・ワイド・馬単・三連複・三連単。券種によって組合せ順序・同一馬重複・必要頭数を検証。
8. レース軍資金・総資金の両モード。期待値重視・ケリー参考・損失抑制の3プランを比較。購入なし（見送り）を許容。金額は原則100円単位、上限厳守。
9. 提案プランをユーザーが編集して**実購入記録**を確定。提案と実購入は別オブジェクトで不変保存。購入後の訂正は訂正履歴で追跡。
10. 結果JSONもファイル/貼付けで取り込み、アプリ内編集。着順・同着・除外/取消・失格・払戻単位・実際のペース・通過順・展開の解釈・出典を記録。観測事実と解釈は区別。
11. 分析: 通算収支、回収率、的中率、資金推移、期待回収率帯別実績、券種・競馬場・距離・馬場別、展開的中、予想バージョン差分、確率校正・Brier等（適切な対象を限定）。期間/条件フィルターとサンプルサイズ表示。
12. UI: ダークネイビー `#101827`、カード `#1E293B`、ティール `#2DD4BF`、スマホ下部ナビ、PCサイドバー。アクセシビリティ、明確な空状態・エラーを重視。

## 2. 推奨技術構成

- Frontend: React + TypeScript + Vite
- UI: Tailwind CSS（または一貫したCSS変数）+ アクセシブルなコンポーネント; React Router（GitHub Pagesのパス/リロード対策としてHashRouterを初期選択）
- Validation: Zod（ランタイムJSON検証、型推論、スキーマバージョン管理）
- State/data: TanStack Queryまたは薄いリポジトリ層 + Firebase SDK
- Charts: Recharts等（当面チャートは基本指標のみ）
- Hosting: GitHub Pages、GitHub Actionsでbuild/test/deploy。Vite `base` は `/<repo>/` に対応し、カスタムドメイン時は調整。
- Auth: Firebase Authentication Googleログイン。GitHub Pagesのドメインを認証の許可ドメインに登録。スマホ側の認証方式は実機検証。
- Cloud DB: Cloud Firestore。Firestore Security Rulesで `request.auth.uid` によるユーザー分離、デフォルト拒否、Rulesユニットテスト。
- Offline: MVPはオンライン前提。下書き自動保存にdebounceと書込状態（保存中/保存済/エラー）を実装。オフライン編集・競合マージは後期。Firebaseの永続キャッシュを有効化する際は共有端末リスクを考慮。
- Tests: Vitest + React Testing Library、Playwright、Firebase Emulatorによる認証/Rules/CRUDテスト。
- Backend: 初期はカスタムサーバー不要。秘密APIキーを要求する連携は追加しない。FirebaseのWeb設定値を秘密鍵と混同せず、Security Rulesで保護する。サービスアカウント鍵はブラウザやリポジトリに置かない。

**費用**: Firestore Standardの無料枠（参照時点: ストレージ1GiB、読み取り5万/日、書き込み2万/日、削除2万/日等）を想定。無料枠/認証制限/課金は導入時に公式サイトで再確認。Firestoreマネージドバックアップ等の一部機能は無料枠対象外なので、アプリからのJSONエクスポートを提供する。

## 3. 段階的な実装ロードマップ

### Phase 0 — 土台・開発環境
- React/TypeScript/Vite、テーマ、共通ルーティング、レスポンシブナビ
- Firebase接続設定、Googleログイン、所有者ごとのRules、Emulator
- GitHub Actions（lint/typecheck/test/build/deploy）、設定手順README、環境変数 `.env.example`
- **完了条件**: スマホ/PCからアクセスでき、許可されたアカウントのみデータ参照。別ユーザーの参照/書込はRulesで拒否。

### Phase 1 — MVP（実際の1レースで一連の流れ）
- レース一覧/詳細の作成・編集
- 予想JSONファイル/貼付けインポート、Zod検証、プレビュー、エラーメッセージ
- 詳細分析表示（展開・各馬・馬券候補）、下書き自動保存、予想バージョン確定/比較の基本差分
- 候補の編集、確率/オッズから期待回収率・期待利益計算
- レース軍資金設定、券種自動/指定、初期3プラン（**後述の保守的・決定論的なロジック**）
- 提案を編集して実購入記録を確定、結果JSON登録/編集、的中・払戻・収支反映
- ホーム：レース一覧、累計購入額・払戻・損益・回収率
- **完了条件**: 予想作成→JSON取込→編集→v1確定→プラン生成→実購入記録→結果取込→収支反映が一貫して動作。リロード/別端末で同期。購入記録・確定版が意図せず上書きされない。

### Phase 2 — 資金管理と分析
- 総資金財布と入金/出金/購入/払戻の台帳、残高とレース別軍資金の整合
- 購入プランの詳細比較、見送りルール、予算制限、金額変更履歴
- 収支/回収率推移、券種別/競馬場別/距離別/馬場別成績
- 展開予想の検証（ペース分類、隊列評価、発生確率別）、予想版ごとの差分
- JSONエクスポート/インポート、重複取り込み防止、バックアップ復元
- **完了条件**: 台帳合計と画面残高の一致、範囲フィルタ、サンプル数表示、複数端末での整合、重複登録防止。

### Phase 3 — 高度分析・堅牢化
- 期待回収率帯別実績、予測確率の校正曲線、Brierスコア（単勝等の定義明確な二値イベント）、バージョン評価
- 同一レース内の相関を考慮したポートフォリオシミュレーション、最大損失/損益分布表示
- データ品質フラグ、信頼区間/標本数、予想の過大評価・苦手条件の洞察
- 競合編集検知・復元、PWA/オフライン閲覧等（必要な場合）
- **完了条件**: 分析指標の正確性を固定データセットで検証、確率未設定の扱いと不足データが明確。

### Phase 4 — 完成版の拡張
- AI予測と**独自確率モデル**の並列保存・比較（データ量が十分になってから開発）
- モデル識別子、学習/評価期間、アウトオブサンプル検証、予測の校正
- 任意の結果/オッズ連携は利用規約とAPI提供条件を確認後に検討
- 分析レポート・予想改善レコメンド
- **完了条件**: モデルの過学習防止、検証データ分離、予測出所/更新履歴を監査可能。

※ Phase 1での「3プラン」は初期版の比較提案。厳密な相関対応型ケリー最適化はPhase 3以降。後方互換性を維持する。

## 4. 画面と遷移

| Route（HashRouter） | 内容 | Phase |
|---|---|---|
| `/#/` | ホーム：KPI、収支推移、登録レース、結果未登録、取込導線 | 1（グラフ深化2） |
| `/#/races` | 開催日・競馬場・状態で検索/ソート | 1 |
| `/#/races/:id` | レース概要、展開シナリオ、馬別評価、予想版、購入・結果タブ | 1 |
| `/#/races/:id/import` | JSONファイルまたはペースト、バリデーション、プレビュー、登録 | 1 |
| `/#/races/:id/predictions/:versionId` | バージョン閲覧、差分、下書きへのコピー | 1 |
| `/#/races/:id/editor` | 下書き編集、自動保存、確定操作 | 1 |
| `/#/races/:id/plans` | 軍資金・券種選択、3プラン比較、候補編集 | 1 |
| `/#/races/:id/purchases` | 推奨と実購入の差分、記録・訂正履歴 | 1 |
| `/#/races/:id/results` | 結果JSON取込/手動編集、確定、払い戻し | 1 |
| `/#/analytics` | 条件別分析・確率精度・バージョン検証 | 2–3 |
| `/#/bankroll` | 資金台帳、入出金、制限設定 | 2 |
| `/#/settings` | 認証、バックアップ、設定 | 1–2 |

## 5. Firestore データモデル（ユーザーごとに隔離）

```
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

- `raceId`: `YYYY-MM-DD-{venueCode}-{raceNumber}-{organizer}` の正規化形式（同じ組織/開催の競合を防ぐため主催者・開催識別子を含める）。地域・レース情報が一意に特定できない場合は明示的IDを設定。
- `predictionVersions`: `versionNumber`、`parentVersionId`、`status=final`、`createdAt`、`confirmedAt`、`author`、`changeReason`、`schemaVersion`、予想データsnapshot、contentHash。確定後update/delete禁止をRulesでも検討（修正は新規バージョン）。
- `drafts/current`: `baseVersionId`、`revision`、`lastEditedAt`、`lastEditedByClient`、`payload`。保存時に更新条件で競合検知。debounce約1秒〜2秒、失敗時は再試行可能な明示状態。
- `plans`: `sourcePredictionVersionId`、`strategy`、`budget`、`candidateSnapshot`、`allocations`、`algorithmVersion`、`assumptions`、`createdAt`、`isSimulation`。提案記録は確定後不変。
- `purchases`: `sourcePlanId?`、`sourcePredictionVersionId`、`placedAt`（実際の日時）/`recordedAt`、`status`（draft/confirmed/corrected）、買い目・購入額・購入時オッズsnapshot、`correctionOf?`。実購入の金銭移動は冪等化。
- `results`: 確定着順・失格/取消・同着・確定払戻・ペースの観測データと解釈・情報源・確定日時、改訂履歴。
- `bankrollTransactions`: `kind`（deposit/withdrawal/stake/payout/adjustment）、`amountYen`（符号または方向を統一）、`referenceId`、`idempotencyKey`、`at`。残高は台帳の集計結果を正とし、集約キャッシュは検算可能にする。
- Firestoreのドキュメントサイズ上限に注意。大きな出走馬分析・ソースデータは適宜子コレクションに分割。大量配列は将来分割しやすい構造を採用。
- 不変性が重要な確定操作にはFirestore transaction/batchと前提バージョンの検証を用いる。ルールをクライアントのみのUI判定に委ねない。

## 6. JSON交換フォーマット（草案 v1）

共通: `schema_version`, `document_type`, `race_id`, `generated_at`, `source_agent`, `sources[]`（URL, タイトル, 確認時刻）, `notes`。UTF-8。日時はISO 8601（タイムゾーン指定、原則 `+09:00`）。確率は**0〜1の小数**で統一し、画面にのみ%表示。金額は非負整数JPY。oddsは小数（倍率）。勝率/連対率/複勝率は開催条件で整合し、`win <= top2 <= top3` を検証。ただし出走頭数・取消等で複勝の入着範囲は条件に従って扱う。

### prediction（最小サンプル、実用時は全フィールドを埋める）

```json
{
  "schema_version": "1.0.0",
  "document_type": "prediction",
  "race_id": "2026-11-04-SONODA-06-NAR",
  "generated_at": "2026-11-04T12:00:00+09:00",
  "source_agent": "chatgpt",
  "race": {
    "date": "2026-11-04", "organizer": "NAR", "venue_code": "SONODA", "race_number": 6,
    "name": "サンプル", "surface": "dirt", "distance_m": 1400,
    "track_condition": "good", "weather": "cloudy"
  },
  "sources": [],
  "scenarios": [
    {"id": "slow", "label": "スロー", "probability": 0.25, "favored_styles": ["front"], "reason": "例示"},
    {"id": "middle", "label": "ミドル", "probability": 0.50, "favored_styles": ["stalker"], "reason": "例示"},
    {"id": "high", "label": "ハイ", "probability": 0.25, "favored_styles": ["closer"], "reason": "例示"}
  ],
  "horses": [
    {"horse_number": 2, "frame_number": 2, "name": "仮想馬A", "running_style": "front", "past_performance": "記入例", "form": "unknown", "track_suitability": "unknown", "distance_suitability": "unknown", "scenario_assessments": {"slow": "advantage", "middle": "neutral", "high": "disadvantage"}, "probabilities": {"win": 0.18, "top2": 0.35, "top3": 0.48}, "rationale": "例示", "confidence": "low"}
  ],
  "bet_candidates": [
    {"id": "b1", "bet_type": "quinella", "horse_numbers": [2, 7], "odds": 8.5, "odds_observed_at": "2026-11-04T12:00:00+09:00", "hit_probability": 0.16, "probability_source": "ai_estimate", "rationale": "展開に合うと推定", "confidence": "low"},
    {"id": "b2", "bet_type": "trio", "horse_numbers": [2, 7, 10], "odds": 22, "odds_observed_at": "2026-11-04T12:00:00+09:00", "hit_probability": null, "probability_source": "unset", "rationale": "確率未設定", "confidence": "unknown"}
  ],
  "change_reason": "初期予想"
}
```

このサンプルは実在レースの予測ではない。JSONには`expected_return`を入力しても**計算結果として再算出して検証**し、AIによる誤算に依存しない。馬券候補の確率には必ず推定の出所、条件、可能なら根拠を残す。候補がなければ追加できるが未設定確率をゼロ扱いしない。

### result（最小サンプル）

```json
{
  "schema_version": "1.0.0",
  "document_type": "result",
  "race_id": "2026-11-04-SONODA-06-NAR",
  "generated_at": "2026-11-04T17:00:00+09:00",
  "source_agent": "codex",
  "result_status": "confirmed",
  "finishers": [{"horse_number": 2, "rank": 1, "status": "finished"}, {"horse_number": 7, "rank": 2, "status": "finished"}, {"horse_number": 10, "rank": 3, "status": "finished"}],
  "payouts": [{"bet_type": "quinella", "horse_numbers": [2, 7], "payout_per_100_yen": 850}, {"bet_type": "trio", "horse_numbers": [2, 7, 10], "payout_per_100_yen": 2200}],
  "observed_pace": {"label": "middle", "basis": "通過順・ラップの確認が必要", "verified": false},
  "interpretation": {"race_shape": "例示", "confidence": "low"},
  "sources": []
}
```

結果のサンプルは架空・不完全データ。実装時は出走全頭・同着・払戻該当券種の網羅、取消等をZodで検証する。公式払戻に基づかないレース結果からの推定払戻は行わない。

### スキーマ検証
- `document_type` がprediction/resultの既知値か、`schema_version`対応か、必須項目・enum・日付を検査。
- シナリオ確率総和 = 1（許容誤差1e-6）; 各確率0〜1; 馬番/組合せ重複、券種別順序制約、全候補の馬番が出走馬に存在するかを検査。
- 出走馬のレコードが不足する場合は「不完全な予想」として警告し、未収集情報を補完したふりをしない。任意項目と推定値/確認済値を区別。
- 結果JSONのrace_idと既存レースの一致を要求。同一結果の二重取込、確定済み結果への矛盾を検知。
- インポート時にプレビューし、既存データへの処理（新規予想/新規結果/下書きへ反映）を選ばせる。既存確定版は上書き不可。
- 全データに出典や調査日時を可能な限り付け、AIの確率推定は`estimated`として表示。

## 7. 期待値・資金配分ロジック

### 7.1 計算基準

- `p` = 馬券の**同一の買い目・券種**の推定的中確率 (0..1)。`o` = 購入対象の十進オッズ（元本込み払戻倍率）。
- 1円あたりの期待払戻 = `p * o`。期待回収率 (%) = `100 * p * o`。1円あたり期待純利益 = `p * o - 1`。購入額 `s` 円の期待純利益 = `s * (p * o - 1)`。
- `p == null` またはオッズ不明/異常の候補は**期待値未算出**、自動配分対象外。`p=0` は予測ゼロであって未設定ではない。
- オッズ観測時刻が古い場合は警告し、再確認を促す。購入時オッズと払戻時の確定倍率を分離保存。
- 予想馬券全体の期待利益合計は線形に足せるが、複数馬券の同時的中・損益分布・ケリー型の最適化は**相関を無視できない**。

### 7.2 共通制約

- `budgetYen >= 0`。上限額/券種指定/最小購入単位100円/1点上限/総購入上限を遵守。未使用予算を許容。未設定確率候補の自動購入を禁止。
- 期待利益がプラスの根拠十分な候補がない場合は見送り。確率の不確かさが大きい場合は明確な注意喚起。
- 同額・同スコア時の並び順などを決定論的に定義し、同入力→同提案を保証。アルゴリズム版を保存。

### 7.3 3つのプラン（初期実装の定義）

1. **期待値重視**: `p*o-1` が正の候補を降順で並べ、ユーザーが定めた単一候補上限・購入点数上限・予算上限まで100円単位で配分。損失偏重に注意し、プラン名に「推定期待利益重視」と表示。
2. **ケリー参考**: 単一の独立二値馬券の理論式 `f = max(0, (p*o-1)/(o-1))`（`o>1`）から、**1/4ケリー等の縮小係数**を適用。総資金モードでは総資金、レース別のみではユーザーが入力した基準運用資金に掛け、100円未満切り捨て。複数候補では単純加算が相関を扱わないため、合計上限・1点上限をかけ、**厳密なポートフォリオ最適化ではない**旨を表示。精密な相関調整はPhase 3へ。
3. **損失抑制**: 設定した投資上限（例: レース予算の30%まで）と単一馬券上限を適用し、分散/高確率候補を優先。ただし低倍率だから安全とはみなさない。明確な期待値・信頼性要件を満たさないなら見送り。

UIには各プランの実際の提案買い目・合計金額・未使用額・期待純利益・推定期待回収率・最大損失（全不的中の場合は購入総額）・計算の前提を表示。損失確率を出すには適切な共同結果モデルが必要。**Phase 1では信頼できる確率分布がない限り「損失確率」を出さない**。

### 7.4 的中判定・払戻

- 順序がある券種（馬単・三連単）と順不同券種（馬連・ワイド・三連複等）を正しく区別。枠連は枠を使う。
- 同着・取消・返還・発売不成立・失格などは公式確定結果に準拠し、汎用的な着順だけの単純的中計算では処理できない場合は「払戻未確定」として明示。
- 払戻は原則`payout_per_100_yen * stakeYen / 100`。取消・返還は別種別の入金として記録。
- 純損益 = 払戻合計 + 返還合計 - 購入合計。回収率 = (払戻合計 + 返還合計)/購入合計 ×100（購入0なら「—」）。購入レース数、的中レース率、的中馬券率を区別。

## 8. 分析の定義

- 集計軸: 日付、開催/競馬場、距離帯、芝ダート、馬場、券種、予想版、期待回収率帯、展開予測クラス。フィルターに対象件数Nを表示。
- 期待回収率帯別実績: 推定値のバケットごとの実購入ROI、的中件数、N、総賭金。推定の良否はサンプル不足・買い目の相関に注意。
- 予想展開精度: 事前登録した `scenario.probability` と実際のペースラベルを比較。実際のペースが未検証の場合は集計から除外。
- Brierスコア: イベント`win`なら馬ごとに `mean((p_win - y_win)^2)`、馬券なら候補ごとに的中/不的中の二値と対応確率を使う。母集団と予想版/時点を固定し、未購入馬券を含む場合の選択バイアスに注記。
- 予想版比較: 対象馬券/予測時点の比較可能性とオッズ差を表示。新情報を使った最終予想を前日予想と同条件として評価しない。
- モデルの過大評価/弱点発見は統計的確度に応じて「傾向候補」と表示。収益保証や確実な優位性と誤認させない。

## 9. UX詳細

- モバイル下部ナビ: ホーム／レース／購入／分析。PCサイドバー。結果/設定はレース詳細または補助メニュー。
- ダークテーマのコントラストと色覚多様性に配慮。利益/損失は色だけでなく符号・文字で表示。
- 入力→バリデーション→インポートプレビュー→下書き反映→自動保存状態→バージョン確定。
- 予想版差分：変更フィールド・旧値・新値・変更理由。確定予想と提案、実購入の間を辿れる。
- 確認ダイアログ: 実購入確定、結果の確定/訂正、総資金の調整、データ削除。
- 進捗・エラー: 認証失敗、同期エラー、同時編集、JSON不正、オッズ欠落、結果矛盾、無料枠超過。

## 10. セキュリティ・運用

- Firestore Security Rules: `/users/{uid}` にアクセス可能なのは認証UID一致者のみ。匿名の書込なし。ルールの肯定/否定テスト必須。
- Googleログインの許可ドメイン設定。ログアウト時の個人データ表示消去。
- GitHub Pagesは公開静的配信。秘密のAI/APIトークンやサービスアカウント秘密鍵をfrontend/Actionsログに露出しない。Viteの`VITE_*`は公開情報として扱う。
- JSONインポート値をHTMLとして危険に描画しない。テキストはReactによるエスケープ。サイズ上限を設定。
- 書込・決済記録に冪等性キーを使用。二重クリック/ネットワーク再試行で購入・払戻を二重計上しない。
- 外部結果取得を始める場合はサイトの利用規約・ライセンス・robots等を別途確認。
- 定期的なJSONエクスポート、復元検証、エラーログ。保管データは競馬予想・成績が中心であり個人用データとして扱う。

## 11. 受け入れテスト例

1. 予想JSONアップロードと貼付けが同じ内容で取り込まれ、バリデーションプレビューが一致。
2. シナリオ確率合計0.9、未知券種、馬番重複、`hit_probability=1.2`を拒否。未設定確率nullは正常に取り込むが期待値未算出。
3. オッズ8.5、的中確率0.16の馬連の期待回収率が136%、100円賭金の期待純利益が+36円。
4. 下書き編集がクラウド同期され、確定版v1不変でv2が作られる。v1に紐づく購入はv2発行後もv1参照。
5. 500円上限で合計600円を購入確定不可、100円単位以外も不可。見送りは許容。
6. 提案案A（500円）をユーザーが300円に変更して確定したら、提案500円・実購入300円を別保存。
7. 予想→購入→結果JSON取り込みで払戻を算出し、収支/回収率/総資金が台帳と一致。再取込で二重計上しない。
8. 別UIDでFirestoreの予想・台帳を読み書きできない。
9. 同じレースを複数端末から編集した場合、競合を検出して黙って上書きしない。
10. 単勝/馬連/三連複/三連単の順序・組合せ判定、同着/取消/返還の例外テスト。
11. Firestoreなしのユニットテストで計算関数は同一入力→同一出力。
12. GitHub Pagesでルートリロード後も正常表示、モバイル幅320pxでも主要操作が利用可能。

## 12. 推奨リポジトリ構造

```text
race-analytics/
  README.md
  docs/
    REQUIREMENTS.md
    DATA_MODEL.md
    IMPORT_FORMAT.md
    ALGORITHMS.md
    ROADMAP.md
  schemas/
    prediction.schema.json
    result.schema.json
  examples/
    prediction.sample.json
    result.sample.json
  src/
    app/
    components/
    features/
      auth/
      races/
      predictions/
      bets/
      results/
      bankroll/
      analytics/
    domain/
      types/
      validation/
      calculations/
    infrastructure/firebase/
  tests/
  firestore.rules
  firestore.indexes.json
  .github/workflows/
    ci.yml
    deploy.yml
  .env.example
  package.json
  vite.config.ts
```

## 13. Codexへの最初の実装依頼（コピーペースト可）

> あなたはシニアReact/TypeScriptエンジニアです。リポジトリ内 `docs/REQUIREMENTS.md`（本書）を唯一の要件ソースとして、Phase 0とPhase 1を段階的に実装してください。まず既存ファイルを確認し、必要な作業一覧・設計上の懸念・テスト方針を短く提示してから変更を加えてください。React + Vite + TypeScript、Firebase Authentication + Cloud Firestore、GitHub Pages、Zod、Vitestを使用。個人用でもユーザーUIDによるセキュリティルールを必須とし、Emulatorで権限テストを用意。計算ロジックはUI・Firebaseから独立した純粋関数にしてください。JSONの予想/結果取り込みはファイル・貼り付け両方に対応。予想は下書き自動保存＋明示確定版の不変管理を行う。AIの推定確率は外部入力として扱い、欠損時に捏造せず、期待値は計算で再算出する。最初に `docs/DATA_MODEL.md`、`docs/IMPORT_FORMAT.md`、Zodスキーマ、サンプルJSON、計算ユニットテストを実装し、その後に画面を実装。レース別予算・3種類の購入案・提案と実購入の分離・結果の払戻集計をMVPに含める。API秘密鍵の公開、確定版の上書き、二重計上を禁止。各マイルストーンの最後にlint/typecheck/test/buildを実行し、残課題と確認事項を報告する。馬券の外部購入処理は作成しない。

## 14. 未確定・実装時の設計判断

- 具体的なリポジトリ名・Firebaseプロジェクト・アクセス許可するGoogleアカウント
- 単一利用者のみ許可するか、アカウントごとに複数利用者を許可するか（初期は所有者1名が安全）
- 競馬場/主催者コード、レースIDの完全な一意性、地方・中央の全券種の対応範囲
- 独立二値のケリー参考配分に対する縮小係数、1点上限、見送り閾値（設定値として管理）
- 予想の確信度・出典品質をどう表示/スコア化するか（初期は未定量）
- 結果の同着/返還等の完全対応、外部データのライセンス
- 詳細なPWA要件やオフライン同時編集

**注**: 上記未確定項目は適当な事実を捏造せず、妥当な初期値と変更可能な設定として実装する。既存要件に反する新機能を独断で追加しない。

## 15. 公式参照先（確認日 2026-11-04）

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- Firestore料金/無料枠: https://firebase.google.com/docs/firestore/pricing
- Firestore Security Rules: https://firebase.google.com/docs/firestore/security/rules-conditions
- Firebase Googleログイン: https://firebase.google.com/docs/auth/web/google-signin
- JRA発売単位の参考: https://www.jra.go.jp/dento/comparison.html
