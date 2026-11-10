# fuzzy-octo-doodle

Next.js(React)のフロントエンドと、コンテナで動く TypeScript バックエンドの pnpm workspace モノレポ。

```text
frontend/         Next.js + React（SSR対応。Next.jsサーバーで実行）
backend/          TypeScript HTTP サーバー + Dockerfile
docs/             実行契約、ツールの使い方
mise.toml         ツールチェーン固定とタスク定義
```

## セットアップ

[mise](https://mise.jdx.dev/) をインストールし、リポジトリのルートで実行する。Node.js と pnpm は `mise.toml` で固定されている。

```bash
mise install
mise run dev      # DB・backend・frontend・nginx を起動（Docker が必要）。http://localhost:3000 を開く
mise run ci       # CI と同じ検証（Docker が必要）
```

タスク一覧は `mise tasks` で確認できる。

## ドキュメント

- [docs/tooling.md](docs/tooling.md) — mise でツールを追加する手順と、pnpm の基本的な使い方
- [docs/backend-dev-environment.md](docs/backend-dev-environment.md) — backend のローカル開発環境（Docker Engine が必要。DB と API を起動し、変更を自動で反映する）
- [docs/object-storage.md](docs/object-storage.md) — S3互換ストレージの設定、SealedSecret、権限、CORS
- [docs/onboarding-usecase.md](docs/onboarding-usecase.md) — ユースケースを実装する人が最初に読む資料(用語、道筋、進め方、よくある型エラー)
- [docs/contributing-workflow.md](docs/contributing-workflow.md) — Issue をもらってから PR がマージされるまでの手順(ブランチ、コミット、Draft の PR、レビューへの対応)
- [docs/backend-architecture.md](docs/backend-architecture.md) — バックエンドの層構成、タスクの状態遷移、実装時の規約
- [docs/contracts.md](docs/contracts.md) — アプリケーションとインフラ・CI/CD の契約
