# Better Authによる認証

## 配置とID

NestJSの`/api/auth/*`へBetter Authの公式`toNodeHandler`を、JSON body parserより先にマウントする。Next.jsは公式クライアントから同一オリジンへアクセスする。既存nginx/Ingressの`/api`振り分けを利用する。

`0003_better_auth.sql`は`auth_users`・`auth_sessions`・`auth_accounts`・`auth_verifications`を追加する。既存Migration・`users.id`・業務テーブルの外部キーは変更しない。新規認証ユーザーのUUIDをそのままアプリユーザーのUUIDとし、`auth_users.id → users.id`の外部キーで1対1に対応させる。BEFORE INSERTトリガーでプロフィールを作るため、Better Authのアカウント作成トランザクションと一緒に成功・失敗する。既存ユーザーにはパスワードを付与せず、自動的な紐付けも行わない。

パスワードのハッシュ化、Cookie署名、セッション発行・検証・失効はBetter Authに任せる。業務APIは`SessionAuthGuard → auth.api.getSession`で確認して既存の`@CurrentUser()`へ渡す。業務側のタスク・証拠アクセス権は従来のユースケースで検証する（フレンドへの正当な共有は維持）。

## 設定

- `BETTER_AUTH_URL`: ブラウザから見える公開オリジン。本番はHTTPS必須。ローカルは`http://localhost:3000`。
- `BETTER_AUTH_SECRET`または`BETTER_AUTH_SECRET_FILE`: 32文字以上の高エントロピーな秘密値。実値はGitに保存しない。例: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`で生成して、Git対象外の`.env`等に保存する。
- 本番は秘密値未指定で起動しない。開発で未指定の場合のみ、プロセス内の乱数を使うため再起動で既存Cookieが無効になる。Composeでは永続的な秘密値を必須とする。
- 本番Kubernetesは事前に`fuzzy-octo-doodle-auth` Secretの`BETTER_AUTH_SECRET`を用意する。マニフェストには参照名のみを記載。

CookieはHttpOnly・SameSite=Lax・Path=/api、HTTPS環境ではSecure。セッションの有効期限は7日。「ログインしたままにする」がOFFならブラウザセッションCookieになる。Cookieキャッシュは無効で、業務APIは毎回DBの失効・期限を確認する。業務APIの参照では期限を延長しない。必要ならBetter Authのget-sessionで更新する。

Compose・Kubernetesの固定ユーザー設定は削除。本番の`DEV_AUTH_USER_ID`は引き続き起動エラーにする。開発用ガードは既存テスト・明示的な開発用途にのみ残す。

## 登録と同意

`sign-up/email`は同意がbooleanの`true`であることと表示名をサーバーで検証する。同意日時・利用規約版・プライバシーポリシー版はサーバーで決定し`auth_users`へ保存する。クライアントによる日時・版の指定は拒否する。現在の版は`2026-11-10`。規約改定時は定数と再同意の運用を検討する。

登録後は自動ログインせず`/login?registered=1`に遷移して完了メッセージを表示。ログイン後は`/mypage`、ログアウト後は`/login`へ遷移する。送信中・ログアウト中は重複操作を抑止する。

プロフィールの編集は既存の`/api/me`を使う。認証側の表示名変更・メール変更・アカウント削除のエンドポイントは、業務データとの整合性を設計するまで無効にする。メール確認・パスワード再設定用のメール送信は今回未実装。

## Migration

SQLをレビューしてから実行する。本番DBへの自動適用は実装作業では行わない。

1. `mise run db:hash`でAtlasチェックサムを更新する。
2. `docker compose run --rm migrate`でローカルDBに適用する。`mise run dev:migrate`はseedも上書きするので注意。
3. Kyselyの`schema.ts`は手動でSQLと対応させる。Better Auth CLIの直接migrateは使用しない。

`.gitattributes`でMigrationをLF固定し、WindowsとLinuxでチェックサムを一致させる。

## 検証

専用の使い捨てPostgreSQLを起動してAtlasを適用する。認証HTTPテストは`DONEE_AUTH_TEST_PORT`を明示したときだけ、`127.0.0.1:<port>/donee_auth_test`へ接続する。通常の`DATABASE_*`は接続先として使用しない。実行例（backend内）:

```bash
DONEE_AUTH_TEST_PORT=55437 pnpm exec tsx --test src/better-auth.test.ts
```

ブラウザテストはfrontendを`localhost:3000`、上記使い捨てDBへ接続するbackendを`127.0.0.1:55438`（`BETTER_AUTH_URL=http://localhost:3000`、固定ユーザー未設定）で起動して、frontend内で実行する。

```bash
pnpm exec playwright install chromium
pnpm test:auth-ui
```

Playwrightは`/api/*`を実際のbackendへ転送する。認証APIの応答はモックしない。PC・スマートフォン幅で登録、同意、ログイン、リロード、確認モーダル、ログアウトを検証する。デプロイ済み環境には実行しない。

## 公開前

Secretを設定し、Migrationを適用してからAPIを切り替える。既存seedアカウントはログインできないため、新規登録または別途安全な移行手順が必要。既存の規約ページには草案の記述があるため、公開前に内容と運営情報を確認する。メール確認・再設定を提供する場合はメール送信設定を別途追加する。

公式資料: [Node/Express連携](https://better-auth.com/docs/integrations/express)、[DB](https://better-auth.com/docs/concepts/database)、[Hooks](https://better-auth.com/docs/concepts/hooks)、[メール・パスワード](https://better-auth.com/docs/authentication/email-password)。
