# 提出チェックリスト — Reachr

対象：**DevOps × AI Agent Hackathon**（Findy / Google Cloud）。最終ピッチ **8/19（水）** @ Google 渋谷。

> ⚠️ 正式な「応募方法」ページ（提出フォーム・締切・動画尺）は Notion の該当セクションが要確認。
> このリストは、ハッカソンの必須技術（Gemini／Cloud Run／GitHub・CI-CD）と一般的な提出物から用意したもの。

## ✅ 完了済み（コード・資材）

- [x] **つくる**：Gemini（Vertex AI）＝経路の説明・Terraform 修正生成・NL クエリ・自律修復エージェント（`reachr agent`）
- [x] **まわす**：GitHub Actions `reachr ci`（PR でアタックパス回帰テスト → コメント／ジョブサマリ／FAIL）
- [x] **とどける**：Cloud Run 用 `Dockerfile` + `deploy.sh`（**ローカルで docker build & 起動確認済み**）
- [x] Web ビジュアライザ（マップ／declared⇄actual トグル／ドリフト赤／Gemini モーダル）
- [x] `README.md`（使い方・アーキ）／`SUBMISSION.md`（提出用の概要・技術マッピング）
- [x] 決定論フォールバック（認証なしでもデモが成立＝審査中に落ちない）

## ⬜ あなたが最後にやること（アカウント・録画が必要）

1. **GitHub に公開リポジトリを作成して push**
   ```bash
   cd ~/Desktop/reachr
   gh repo create reachr --public --source=. --remote=origin --push
   # or: git remote add origin <URL> && git push -u origin main
   ```
2. **Cloud Run にデプロイ**（要 `gcloud auth login` ＋課金有効なプロジェクト）
   ```bash
   ./deploy.sh <PROJECT_ID>
   ```
   → 出力された Service URL を控える。Explain が "fallback" 表示なら、スクリプト末尾が出す
   `roles/aiplatform.user` 付与コマンドを実行。
3. **デモ動画を録画**（下の絵コンテ）。公開 URL とリポジトリを説明欄に。
4. **提出フォーム／ProtoPedia に登録** — 文面は `SUBMISSION.md` をそのまま流用可。
5. **Notion「応募方法」で提出物・締切・動画尺を最終確認**（フォームや尺の指定があればそれに合わせる）。

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
