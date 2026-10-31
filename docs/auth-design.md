# 認証の設計(Better Auth)

認証を、外部ライブラリの [Better Auth](https://www.better-auth.com/) に任せるときの、フロントエンドとバックエンドの統合方針をまとめる。ログイン方式は、まず email とパスワードだけにする。

## 前提

- バックエンドは NestJS(Express)、DB は PostgreSQL、DB アクセスは Kysely。スキーマは Atlas の SQL マイグレーションで管理する。
- フロントエンドは Next.js で、描画だけを担当する。ブラウザが同一ホストの `/api` でバックエンドを呼ぶ。Next.js のサーバーからバックエンドへは通信しない。
- 閉じたアプリで、利用者は招待された人だけ。
- 既存の骨格: `SessionAuthGuard`、`SessionAuthenticator` port、`DbSessionAuthenticator`(未実装)、`@Public()`、`@CurrentUser()`、`OriginGuard`。

## 決めたこと

| 項目 | 決定 | 理由 |
| --- | --- | --- |
| Better Auth を動かす場所 | バックエンド。`/api/auth/*` で公開する | Ingress の `/api` がすでにバックエンドに向く。DB の持ち主が1つになる |
| フロントエンド | `better-auth/react` のクライアントだけを使う | Next.js のサーバーに認証の処理を置かない |
| DB 接続 | 既存の Kysely を `database` に渡す | 接続を共有する |
| スキーマの管理 | Atlas(`backend/migrations/0002_auth.sql`)。Better Auth の自動マイグレーションは使わない | 変更の経路を Atlas に一本化する |
| 利用者テーブル | Better Auth の `user` を既存の `users` にマッピングする | テーブルが1つで済み、同期の処理がいらない |
| ID | `advanced.database.generateId: "uuid"` | `users.id` は `varchar(36)` の UUID |
| ログイン方式 | email とパスワード。メールの確認とパスワード再設定は使わない | メール送信の基盤がない。忘れたときは管理者が再設定する |
| Cookie | Better Auth の既定(`Path=/`、`HttpOnly`、`Secure`、`SameSite=Lax`) | Next.js の middleware でも、Cookie の有無を見られる |
| 新規登録 | 招待のトークンを持つ人だけ。最初の1人は管理者が手動で作る | 公開ドメインで誰でも登録できる状態を避ける |

## スキーマ

`users` を Better Auth の `user` として使う。

- `name` を `nickname` に対応させる(`user.fields.name = "nickname"`)。
- 次の列を追加する: `email`(一意)、`email_verified`(既定 false)、`image`(null 可)。
- 既存の列は `nickname`、`created_at`、`updated_at`。`id` は `varchar(36)` のまま。
- Better Auth の他のテーブル(`session`、`account`、`verification`)を追加する。外部キーは `users(id)`。
- 実際の SQL は、Better Auth のスキーマ生成機能(`generate`)で出し、`0002_auth.sql` に入れる。そのあと `atlas.sum` を更新する。

既存の行(開発用の利用者)は、`email` が null になる。開発用の認証を外すとき、その行を消すか、email を付ける。

## バックエンドの統合

1. `backend/src/infrastructure/auth/auth.ts` で `betterAuth({...})` を作る。設定は、`database`(Kysely)、`user` のマッピング、`emailAndPassword`、`advanced.database.generateId`、`trustedOrigins`、`secret`、`baseURL`。
2. Express に、`/api/auth/*` のハンドラ(`toNodeHandler(auth)`)を、body parser より前に載せる。Better Auth は、リクエストの body を自分で読むため。
3. `DbSessionAuthenticator` を、`auth.api.getSession({ headers })` を呼ぶ実装にする。`SessionAuthenticator` port の引数は、Cookie の token から、リクエストの headers に変える。返す値は `UserId`(`users.id`)。
4. `/api/auth/*` は、`SessionAuthGuard` の対象から外す(`@Public()` 相当)。`OriginGuard` は残し、Better Auth の `trustedOrigins` と同じ値を使う。
5. `session-cookie.ts` と `cookie-options.ts` の自作の Cookie の属性は、使わなくなるので消す。

## 新規登録の制限

- `emailAndPassword.disableSignUp` は使わない。代わりに、`hooks.before` で `/sign-up/email` を検査し、招待のトークンがない、または無効なら拒否する。
- 招待のトークンは、既存の `friend_invites.token` を再利用する案を第一とする。招待リンクから登録した人が、招待した人の友達になるかは、別途決める(未決定)。
- 最初の1人は、管理者が手動で作る。Better Auth の内部の API(`auth.$context` のパスワードのハッシュと `internalAdapter`)を使う、一度だけ実行するスクリプトを `backend/scripts/` に置く。`users` に行を直接挿入しても、パスワードのハッシュが作れないため。

## フロントエンドの統合

1. `frontend/src/lib/auth-client.ts` で `createAuthClient()` を作る。`baseURL` は同一オリジンなので指定しない(`/api/auth` が既定)。
2. 画面は、`(auth)/login`(サインイン)と `(auth)/profile/setup`(ニックネームの設定。`updateUser`)。`auth/verify` は、メールの確認を使わないので不要。
3. 画面の保護は、`(main)/layout.tsx` で `useSession` を見て、未ログインなら `/login` に送る。Cookie が `Path=/` なので、必要なら middleware でも、Cookie の有無で先に振り分けられる(確認だけで、検証はバックエンドが行う)。
4. バックエンドの API は、これまでどおり Cookie つきの `fetch`(同一オリジンなので、既定のままでよい)。
5. ローカル開発では、Next.js(3000)から `/api` をバックエンド(8080)に転送する `rewrites` が必要。

## インフラ

- `BETTER_AUTH_SECRET`(セッションの署名鍵)と `BETTER_AUTH_URL`(`https://donee.sora-lab.dev`)を、バックエンドに渡す。
- `BETTER_AUTH_SECRET` は、1Password の item から `OnePasswordItem` で Secret にする。`docs/contracts.md` の「長期有効な固定パスワードを使わない」とは性質が違う(署名用で、外部のサービスへ送る資格情報ではない)。例外として扱うか、定期的に入れ替えるかを、決める。
- 認証を入れたあとに、開発用の認証(`DEV_AUTH_USER_ID`、`NODE_ENV=development`、`seed` の Job、`seed` の NetworkPolicy)を消す。
- レート制限は、既定ではメモリに持つ。backend を複数 Pod にするときは、DB に切り替える(`rateLimit.storage: "database"`)。

## 実装の分け方

1. スキーマ: `0002_auth.sql`、`atlas.sum`、`compose.yaml` の確認。
2. バックエンド: Better Auth の設定、ハンドラ、ガードの差し替え、招待の検査、最初の1人のスクリプト、テスト。
3. フロントエンド: クライアント、ログインの画面、プロフィール設定、レイアウトの保護、rewrites。
4. インフラ: Secret、環境変数、開発用の認証の撤去。1〜3 が main に入ってから行う。

## 未決定

- 招待リンクから登録した人を、招待した人の友達にするか。
- `BETTER_AUTH_SECRET` を、例外として扱うか、定期的に入れ替えるか。
- メールの確認とパスワード再設定を、いつ導入するか(メール送信の基盤が決まってから)。
