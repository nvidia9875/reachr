# ProtoPedia 登録内容 & 提出フォーム（そのまま貼れる版）

> 締切: **2026/7/10（金）23:59**（超過は審査対象外）。デプロイURLは **8/19 まで動作確認できる状態**を維持。
> タグに **`findy_hackathon`** を必ず設定。

---

## 🟦 ProtoPedia 登録フィールド

### 作品ステータス（必須）
公開

### 作品タイトル（必須）
Reachr

### 概要（必須）
GCP プロジェクトの中で「データストア（Cloud SQL・GCS など）に到達できる経路」を、ネットワークと IAM の両面からマッピングする自律 AI エージェントです。Terraform（あるべき姿）と実際のデプロイ状態を突き合わせ、**コードには無いのに本番でデータに届いてしまう経路**を検出。Gemini（Vertex AI）が危険性を説明し、それを塞ぐ Terraform パッチを生成、修正後に再スキャンして経路が閉じたかを自己検証します。CI では新しい到達経路が生えた PR を落とします。

### 画像（任意・最大5枚）
1. `docs/architecture.png` … システム構成図
2. 攻撃サーフェスマップ（ACTUAL：DB が EXPOSED、赤い経路）※録画/スクショから
3. DECLARED 切替（DB が PRIVATE）※前後比較
4. Gemini の Explain & Fix モーダル（Terraform パッチ生成）
5. `reachr agent` の SENSE→DECIDE→REASON→ACT→VERIFY ログ

### 動画（必須・YouTube/Vimeo の URL）
`＜録画してアップロード後の URL＞`（絵コンテは `SUBMISSION_CHECKLIST.md`）

### システム構成（必須・アーキ図＋技術補足）
アーキ図: `docs/architecture.png`

技術補足:
- **Cloud Run**：Reachr の Web/API を配信（実行プロダクト）。`Dockerfile` + `deploy.sh` で一括デプロイ。
- **Vertex AI / Gemini**：経路の危険性説明・Terraform 修正パッチ生成・自然言語クエリ・エージェントの推論。
- **入力**：`terraform show -json`（declared）と Cloud Asset Inventory（actual）を同一スキーマに正規化。
- **決定論コア**：parse → graph（network+IAM）→ reach（internet→data）→ drift。**到達の真実は LLM に作らせない**。
- **DevOps**：GitHub Actions `reachr ci` が PR ごとにアタックパスを回帰テスト。

### 開発素材（必須・使用した開発ツール）
TypeScript / Node.js / tsx・Google Cloud（**Cloud Run**・**Vertex AI Gemini**・Cloud Asset Inventory）・Terraform（terraform show -json）・GitHub Actions・Docker・Playwright（検証）

### タグ（必須・複数可、1つは findy_hackathon）
`findy_hackathon`, `AIエージェント`, `Gemini`, `VertexAI`, `CloudRun`, `GoogleCloud`, `Terraform`, `セキュリティ`, `DevOps`, `IaC`

### ストーリー（必須）

**① 本作品で解決したい課題とその背景**
インフラはリリース時はキレイでも、運用が続くと現実がコードから乖離します。障害対応で DB を `0.0.0.0/0` に開けたまま戻し忘れ、分析ツールの SA に DB 権限が後付けされ、バケットが一時的に公開される——こうした **コードの外で起きるドリフト**は既存の IaC スキャンでは原理的に見えず、届く先が個人情報だとそのまま漏洩事故（近年の大手通信キャリアの事案など）になります。「今、誰がデータに届くのか」を事故の前に地図にすることが課題です。

**② 想定する利用ユーザー**
GCP を運用するプラットフォーム／SRE／セキュリティエンジニア。特に、複数チームが Terraform とコンソールを併用し、データストアへのアクセス経路が時間とともに増えていく組織。

**③ プロダクトの特徴**
- 宣言（Terraform）vs 実際（Cloud Asset Inventory）の**データ到達ドリフト**という新規の切り口。
- **自律エージェント**が SENSE→DECIDE→REASON→ACT→**VERIFY（再スキャンで自己検証）** を実行。決定論エンジンをセンサー兼検証器、Gemini を推論として使い分ける。
- 攻撃サーフェスを**直感的なマップ**で可視化（declared⇄actual トグルで DB が PRIVATE⇄EXPOSED）。
- **CI ゲート**で「事故る前に」新しい到達経路を止める。

### メンバー登録（任意）
`＜チーム参加なら追加＞`

### 関連URL（任意）
- GitHub: https://github.com/nvidia9875/reachr
- デプロイ: `＜Cloud Run の Service URL＞`

---

## 🟩 作品提出フォーム（Google Form）回答

| 項目 | 回答 |
|---|---|
| チーム名または個人名 | `＜記入＞` |
| 代表者の氏名（フルネーム） | `＜記入＞` |
| チームメンバー全員の氏名 | `＜個人なら「なし」／複数はカンマ区切り＞` |
| 代表者の連絡先メールアドレス | `＜エントリー時に登録したアドレス＞` |
| 作品タイトル | Reachr |
| GitHub リポジトリの URL | https://github.com/nvidia9875/reachr |
| デプロイした作品の URL | `＜./deploy.sh 実行後の Cloud Run URL＞` |
| Proto Pedia の作品 URL | `＜ProtoPedia 登録後の URL＞` |

> 残タスク：①動画を録画して URL 取得 ②`./deploy.sh <PROJECT>` で Cloud Run URL 取得 ③ProtoPedia 登録して URL 取得 → 上の `＜＞` を埋めて 3 ステップ（参加申込／ProtoPedia／提出フォーム）を提出。
