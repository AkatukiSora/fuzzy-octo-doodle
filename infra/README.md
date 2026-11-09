# infra

アプリケーションを Kubernetes(Argo CD)へデプロイするためのマニフェスト。Kustomize で構成し、`infra/` を Argo CD の Application が直接参照する。Application 自体は別リポジトリ(`k8s-deploys`)で管理する。

## 構成

```text
Cloudflare Tunnel ─┬─ /api → backend  (8080) ── database (CloudNativePG, 5432)
                   └─ /    → frontend (3000)
```

ブラウザは同一ホストの `/api` を通して backend を呼ぶ。frontend から backend への通信は存在しない。

| ファイル | 内容 |
| --- | --- |
| `namespace.yaml` | `fuzzy-octo-doodle` namespace(Pod Security: restricted を audit/warn) |
| `database.yaml` | CloudNativePG の `Cluster`(PostgreSQL、2 インスタンス) |
| `migrate.yaml` | スキーマを適用する Sync フックの Job |
| `backend.yaml` | backend の Deployment と Service |
| `frontend.yaml` | frontend の Deployment と Service |
| `ingress.yaml` | `donee.sora-lab.dev` の公開設定(`/api` と `/`) |
| `networkpolicy.yaml` | 層ごとの許可する入口 |
| `jobs/` | 期限切れ・審査終了の定期ジョブ |
| `kustomization.yaml` | リソース一覧とイメージのタグ |
| `../docs/object-storage.md` | S3互換ストレージ、Secret同期、権限、CORSの設定 |

## イメージ

`kustomization.yaml` の `images` がタグの唯一の管理場所。

- `ghcr.io/akatukisora/fuzzy-octo-doodle-backend`(`backend/Dockerfile`)
- `ghcr.io/akatukisora/fuzzy-octo-doodle-frontend`
- `ghcr.io/akatukisora/fuzzy-octo-doodle-migrate`(`backend/Dockerfile.migrate`)

3 つは同じコミットから作り、タグを同時に更新する。

GHCR のパッケージは public にする。イメージのビルドと公開は、このディレクトリの範囲外である。

## データベース

CloudNativePG が `fuzzy-octo-doodle-db-app`(接続情報)と `fuzzy-octo-doodle-db-ca`(CA 証明書)の Secret を生成する。backend は両方を読み取り専用ファイルとしてマウントし、`DATABASE_*_FILE` で参照する。接続は `verify-full` の TLS で、ホストは `fuzzy-octo-doodle-db-rw`。

パスワードは Git に置かない。バックアップは設定しない(データが失われても許容できる閉じたアプリのため)。

## オブジェクトストレージ

backend は既定で `OBJECT_STORAGE_DRIVER=mock` のまま起動する。S3へ切り替える前に、`docs/object-storage.md` に従い1Password Item `fuzzy-octo-doodle-s3` をSecret `fuzzy-octo-doodle-s3` に同期し、非公開バケット、最小権限、CORSを準備する。Vault ID / Item ID を含むoperator設定はこのリポジトリに追加していない。Secretの任意参照は、S3を準備する間も現在のbackend Deploymentを起動可能にする。

スキーマ(`backend/migrations/`)は、同期のたびに `migrate` の Job が適用する。Job は Argo CD の Sync フックで、Cluster が Healthy になったあと(wave 1)、アプリの更新(wave 3)より先に実行される。失敗すると同期が止まり、アプリは更新されない。イメージは `backend/Dockerfile.migrate` で作る。

## 定期ジョブ

`jobs/` の4つのCronJobを `kustomization.yaml` の `resources` から展開する。初回提出期限切れ、審査終了、追加提出期限切れ、アップロードセッション期限切れを5分ごとに処理する。APIと同じbackendイメージを使用し、マイグレーション後のwave 3で反映する。各CronJobは `concurrencyPolicy: Forbid` で重複実行を防ぐ。

期限切れからジョブ実行までの時間差はあるため、フレンドの進行中一覧・件数はDBのstatusだけでなく現在の適用期限でも絞る。期限内に開始したアップロードの猶予中はドメインの判定を尊重し、DB状態を強制的に未達成にしない。

## NetworkPolicy

Cilium が audit モードの間は、違反は記録されるだけで遮断されない。許可する通信は次のとおり。

- frontend ← `cloudflare-tunnel-ingress-controller` namespace(3000)
- backend ← `cloudflare-tunnel-ingress-controller` namespace(8080)
- database ← backend、定期ジョブ、migrate(5432)、`cnpg-system`(5432、8000)、同一クラスタのインスタンス(5432、8000)、`monitoring`(9187)

enforce に切り替える前に、記録された拒否がこの一覧で説明できることを確認する。egress は未定義である。

## 検証

```bash
kubectl kustomize infra
```

## 開発用の認証

認証方式が決まるまでの暫定として、backend は `DEV_AUTH_USER_ID` で固定の利用者として動く。認証なしで `/api` を使えるので、公開ドメインに出る間は、閉じたアプリの範囲でのみ使う。

- backend は `NODE_ENV=production` だと起動に失敗するため、Deployment で `NODE_ENV=development` に上書きしている。
- その利用者と動作確認用のデータは、`seed` の Job(Sync フック、wave 2)が `infra/dev-seed/seed.sql`(ConfigMap `dev-seed`)から入れる。`migrate`(wave 1)のあと、アプリ(wave 3)より先に実行される。同期のたびに、seed と同じ ID の既存行を全列（ID を除く）上書きする。日時も実行時点の `now()` から計算し直すため、直近 7 日のフィード用データも更新される。
- **seed 対象への手動変更（タスクの状態、通知の既読状態など）は同期のたびに戻る。** seed にない ID の行は削除しない。共有の DB で同期するときは、この上書きを許容できることを確認する。
- 認証を実装したら、`seed` の Job、`NetworkPolicy` の `seed` の許可、backend の 2 つの環境変数を消す。
