# 提出チェックリスト — Reachr

対象：**DevOps × AI Agent Hackathon**（Findy / Google Cloud）。最終ピッチ **8/19（水）** @ Google 渋谷。

> ⏰ **作品提出締切：2026/7/10（金）23:59**（超過は審査対象外・同一作品は1回のみ）。
> デプロイURLは **8/19 まで動作確認できる状態**を維持すること。
> 提出は3STEP：**① Findy 参加申込フォーム → ② ProtoPedia 作品登録 → ③ 作品提出 Google Form**。
> ProtoPedia／フォームの記入内容は **`PROTOPEDIA.md`** に用意済み（コピペ可）。

## ✅ 完了済み（コード・資材）

- [x] **つくる**：Gemini（Vertex AI）＝経路の説明・Terraform 修正生成・NL クエリ・自律修復エージェント（`reachr agent`）
- [x] **まわす**：GitHub Actions `reachr ci`（PR でアタックパス回帰テスト → コメント／ジョブサマリ／FAIL）
- [x] **とどける**：Cloud Run 用 `Dockerfile` + `deploy.sh`（**ローカルで docker build & 起動確認済み**）
- [x] Web ビジュアライザ（マップ／declared⇄actual トグル／ドリフト赤／Gemini モーダル）
- [x] `README.md`（使い方・アーキ）／`SUBMISSION.md`（提出用の概要・技術マッピング）
- [x] 決定論フォールバック（認証なしでもデモが成立＝審査中に落ちない）

## ✅ 済み

- [x] **GitHub 公開リポジトリに push** → https://github.com/nvidia9875/reachr
- [x] **システム構成図**（`docs/architecture.png`）
- [x] **ProtoPedia／提出フォーム 記入内容**（`PROTOPEDIA.md`）

## ⬜ あなたが最後にやること（アカウント・録画が必要）

1. **Cloud Run にデプロイ**（要 `gcloud auth login` ＋課金有効なプロジェクト）
   ```bash
   cd ~/Desktop/reachr
   ./deploy.sh <PROJECT_ID>
   ```
   → 出力された **Service URL** を控える（動画・ProtoPedia・提出フォームで使う）。
   Explain が "fallback" 表示なら、スクリプト末尾が出す `roles/aiplatform.user` 付与コマンドを実行。
2. **デモ動画を録画 → YouTube/Vimeo にアップ**（下の絵コンテ）。URL を控える。
3. **ProtoPedia に作品登録**（`PROTOPEDIA.md` を貼る／`docs/architecture.png` と動画URLを添付／タグに `findy_hackathon`）。作品 URL を控える。
4. **① Findy 参加申込フォーム**（未申込なら）→ **③ 作品提出 Google Form** に 3 URL（GitHub／デプロイ／ProtoPedia）を記入して提出。

## 🎬 デモ動画 絵コンテ（約2分）

1. **課題**（15s）：「運用が続くと、コードの外で DB に穴が空く。KDDI のような漏洩はこう起きる」
2. **マップ**（20s）：ACTUAL。DB が **EXPOSED（赤）**、赤い経路が全チェーンを飛び越えてデータへ直達。
3. **ドリフト対比**（15s）：**DECLARED** に切替 → 赤が消え DB が **PRIVATE（緑）**。「コードはキレイ、現実は違う」。
4. **Gemini**（25s）：明細クリック → 危険性の説明＋**Terraform 修正パッチ生成**。「can anyone reach my DB?」で経路ハイライト。
5. **自律エージェント**（20s）：`reachr agent` を実行 → 3 経路を検出し、Gemini が修正パッチを自動生成。
6. **まわす**（15s）：PR で `reachr ci` が **FAIL**、経路をコメント。
7. **とどける**（10s）：Cloud Run の公開 URL を提示して締め。

## 📋 必須要件チェック

| 要件 | 充足 | 証跡 |
|---|---|---|
| Google Cloud AI（Gemini） | ✅ | `src/gemini.ts`（Vertex AI）・Explain/Fix・`reachr agent` |
| Cloud Run へのデプロイ | ✅ | `Dockerfile` / `deploy.sh`（docker 起動確認済み） |
| DevOps（GitHub・CI/CD） | ✅ | `.github/workflows/reachr.yml`・`reachr ci` |
