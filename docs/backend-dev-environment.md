# backend のローカル開発環境

DB（PostgreSQL）、API、frontend をコンテナで起動し、nginx で本番と同じ構成（`/api/*` は backend、それ以外は frontend）にまとめる環境。ソースを変更すると自動で反映される。

## 必要なもの

1. **Docker Engine と Docker Compose プラグイン**（backend の開発に必須）。
   - インストール手順: <https://docs.docker.com/engine/install/>
   - Compose プラグインの手順: <https://docs.docker.com/compose/install/linux/>
   - 確認: `docker compose version` が表示され、`docker run --rm hello-world` が成功する。
   - Linux では、`sudo` なしで使うために、ユーザーを `docker` グループに入れる（<https://docs.docker.com/engine/install/linux-postinstall/>）。
2. [mise](https://mise.jdx.dev/)（任意）。入れない場合は、下の `docker compose` コマンドを直接使う。

## 使い方

| やりたいこと | mise | docker compose |
| --- | --- | --- |
| 起動して変更を監視する | `mise run dev` | `docker compose up --build --watch` |
| 止める（データは残る） | `mise run dev:down` | `docker compose down` |
| 止めて DB のデータも消す | `mise run dev:reset` | `docker compose down -v` |
| 新しい SQL を適用する | `mise run dev:migrate` | `docker compose run --rm migrate && docker compose run --rm --no-deps seed` |
| seed 対象のデータを初期値で上書きする（DB 起動済み） | — | `docker compose run --rm --no-deps seed` |
| `atlas.sum` を更新する | `mise run db:hash` | (mise のタスクの `docker run` を参照) |

起動すると、次の順に動く。

1. `db` — PostgreSQL 17 が起動する（`127.0.0.1:5432`、ユーザー・パスワード・DB 名はすべて `app`）。
2. `migrate` — [Atlas](https://atlasgo.io/)(Community Edition)が `backend/migrations/*.sql` を番号順に適用して終了する。適用済みは DB の `atlas_schema_revisions` に記録するため、何度実行しても同じ結果になる。
3. `seed` — 開発用の利用者と、動作確認用のデータを入れて終了する(次の「動作確認用のデータ」を参照)。
4. `api` — `tsx watch` で API が起動する（`127.0.0.1:8080`）。
5. `frontend` — `next dev` が起動する。ホストには公開しない。
6. `proxy` — nginx が `127.0.0.1:3000` で待ち受け、本番の Ingress と同じく `/api/*` を `api`、それ以外を `frontend` に振り分ける（設定は `infra/dev-proxy/default.conf`）。

ブラウザでは `http://localhost:3000` を開く。フロントエンドの `fetch("/api/...")` が、本番と同じ同一オリジンで backend に届く。

動作確認:

```bash
curl -i http://127.0.0.1:3000/api/me       # proxy 経由で backend に届く
curl -i http://127.0.0.1:3000/             # proxy 経由で frontend に届く
curl -i http://127.0.0.1:8080/healthz      # backend に直接。200 が返る
```

## 変更が反映される仕組み

`compose.yaml` の `develop.watch` が、変更を監視する。

| 変更したファイル | 起きること |
| --- | --- |
| `backend/src/**` | コンテナ内の同じ場所にコピーされる。コンテナ内の `tsx watch` が API を再起動する（数秒）。 |
| `backend/scripts/**` | API コンテナ内の同じ場所にコピーされる。テスト実行時は最新のスクリプトを使う。 |
| `backend/package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` | 開発用イメージを作り直し、コンテナを入れ替える（依存関係のインストールを含むため数十秒〜数分）。 |

- `up --watch` を実行している端末を開いたままにする。閉じると監視が止まる。
- 開発用のイメージは `backend/Dockerfile.dev`。本番用の `backend/Dockerfile` とは別で、ビルドせずに TypeScript を直接実行する。
- 監視の対象外のファイル（`tsconfig.json`、`backend/migrations` など）を変えたときは、`docker compose up --build --watch` をやり直す。SQL を足しただけなら `mise run dev:migrate` でよい。

## 開発用の認証

認証方式が決まるまで、compose の API は環境変数 `DEV_AUTH_USER_ID` を設定して起動する。

- 認証が必要なエンドポイントは、Cookie なしで呼べる。常にその固定の利用者（ID `11111111-1111-4111-8111-111111111111`、ニックネーム「開発ユーザー」）として扱われる。
- `@Public()` のエンドポイントは、これまでどおり認証なしで呼べる。
- 状態を変えるリクエスト(POST など)でも、`Origin` ヘッダは要らない。
- 利用者は、`seed` サービスが `infra/dev-seed/seed.sql` で作る(何度実行しても同じ結果になる)。
- 設定しなければ、本物の認証ガードが動く。`NODE_ENV=production` で設定すると、起動に失敗する。
- 実装は `composition/auth.module.ts` と `presentation/http/auth/dev-auth.guard.ts`。認証の実装(`SessionAuthGuard`)には触れない。

```bash
curl -i http://127.0.0.1:8080/api/me      # 開発用の利用者として処理される
```

## 動作確認用のデータ

`infra/dev-seed/seed.sql` が、開発ユーザーの視点で次の 3 種類のデータを入れる。

| 種類 | 内容 |
| --- | --- |
| 開発ユーザーが所有する | 全ステータスのタスク(進行中・審査中・追加証拠待ち・達成・未達成・判定不能・終了・再挑戦)、証拠と写真、投稿、通知、フレンド招待リンク |
| 開発ユーザーが参照しうる | フレンド 3 人(田中・佐藤・鈴木)とそのタスク・証拠・投稿・リアクション・異議。承認待ちのフレンド申請の相手(高橋)と、送信済みの申請の相手(伊藤) |
| 開発ユーザーが参照し得ない | 他人、フレンドのフレンド、開発ユーザーをブロックした人、開発ユーザーがブロックした人、承認前の申請者が持つタスク・投稿・証拠・異議・通知 |

参照し得ないデータは、ニックネームやタイトル、本文に「【閲覧不可】」と入れてある。画面やレスポンスに表示されたら、権限判定の不具合である。

- 日時は実行時点の `now()` からの相対値。seed を再実行すると日時も計算し直すため、直近 7 日のフィード用データも更新される。
- k8s では、同じファイルを `seed` の Job(`infra/migrate.yaml`)が ConfigMap 経由で流す。ファイルが `infra/` にあるのは、kustomize が `infra/` の外のファイルを読めないため。
- 同じ ID の行があれば、ID 以外の全列を定義値で上書きする（`ON CONFLICT (id) DO UPDATE`）。**seed 対象のタスクの状態や、通知の既読状態などの手動変更も戻る。** seed にない ID の行は削除しない。データを足したいときは、ID の付け方(`seed.sql` の冒頭)に従う。

DB が起動済みなら、次のコマンドで seed だけを再実行できる。DB 全体の削除は不要である。

```bash
docker compose run --rm --no-deps seed
```

## マイグレーションを足す

1. `backend/migrations/` に、番号を続けた SQL を置く(例: `0002_add_foo.sql`)。1 ファイルは 1 トランザクションで適用される。
2. `mise run db:hash` で `backend/migrations/atlas.sum` を更新し、SQL と一緒にコミットする。
3. `mise run dev:migrate` で手元の DB に適用する。

`atlas.sum` は各ファイルのチェックサムを持つ。`atlas.sum` を更新せずに SQL を足したり書き換えたりすると、適用がエラーになる。CI も `atlas.sum` が最新かを検証する。複数人が同時に SQL を足したときは `atlas.sum` が衝突するので、番号を振り直して `mise run db:hash` をやり直す。

## DB を直接見る

```bash
docker compose exec db psql -U app -d app
```

## 困ったとき

- `docker: 'compose' is not a docker command` — Compose プラグインが入っていない。上の手順 1 を見る。
- `permission denied ... docker.sock` — ユーザーが `docker` グループに入っていない。上の手順 1 を見る。
- ポート 5432、8080、3000 が使用中 — 他のプロセスを止める。`compose.yaml` の `ports` の左側の数字を変えてもよい（コミットしない）。
- マイグレーションが失敗した — エラーの SQL を直したあと、`mise run dev:reset` で DB を作り直す。
- 以前の開発 DB が残っていて `atlas_schema_revisions` がない — スキーマは適用済みなのに Atlas が DB が空でないとして失敗する。`mise run dev:reset` で DB を作り直す。
