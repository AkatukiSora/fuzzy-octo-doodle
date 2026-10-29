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
| `backend.yaml` | backend の Deployment と Service |
| `frontend.yaml` | frontend の Deployment と Service |
| `ingress.yaml` | `donee.sora-lab.dev` の公開設定(`/api` と `/`) |
| `networkpolicy.yaml` | 層ごとの許可する入口 |
| `jobs/` | 定期ジョブ(未展開) |
| `kustomization.yaml` | リソース一覧とイメージのタグ |

## イメージ

`kustomization.yaml` の `images` がタグの唯一の管理場所。

- `ghcr.io/akatukisora/fuzzy-octo-doodle-backend`(`backend/Dockerfile`)
- `ghcr.io/akatukisora/fuzzy-octo-doodle-frontend`

GHCR のパッケージは public にする。イメージのビルドと公開は、このディレクトリの範囲外である。

## データベース

CloudNativePG が `fuzzy-octo-doodle-db-app`(接続情報)と `fuzzy-octo-doodle-db-ca`(CA 証明書)の Secret を生成する。backend は両方を読み取り専用ファイルとしてマウントし、`DATABASE_*_FILE` で参照する。接続は `verify-full` の TLS で、ホストは `fuzzy-octo-doodle-db-rw`。

パスワードは Git に置かない。バックアップは設定しない(データが失われても許容できる閉じたアプリのため)。

スキーマ(`backend/migrations/`)の適用は、この構成には含まれない。

## 定期ジョブ

`jobs/` に、backend のイメージで動く 4 つの CronJob(`backend/src/jobs-main.ts` のジョブ)を置いている。ジョブの整備が済むまで展開しない。`kustomization.yaml` の `resources` に `jobs` を追加すると展開される。実行間隔は暫定値(5 分ごと)。

## NetworkPolicy

Cilium が audit モードの間は、違反は記録されるだけで遮断されない。許可する通信は次のとおり。

- frontend ← `cloudflare-tunnel-ingress-controller` namespace(3000)
- backend ← `cloudflare-tunnel-ingress-controller` namespace(8080)
- database ← backend と定期ジョブ(5432)、`cnpg-system`(5432、8000)、同一クラスタのインスタンス(5432、8000)、`monitoring`(9187)

enforce に切り替える前に、記録された拒否がこの一覧で説明できることを確認する。egress は未定義である。

## 検証

```bash
kubectl kustomize infra
```
