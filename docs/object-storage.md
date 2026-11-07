# S3互換オブジェクトストレージ

## 動作

backend は `OBJECT_STORAGE_DRIVER` を起動時に読み込みます。値は `mock` または `s3` のどちらかを明示してください。未設定・不明な値では起動しません。`mock` を選んだときは S3 設定を読み込まず、`s3` では設定を検証して共有 `S3Client` を作成します。

| 環境変数 | 必須 | 説明 |
| --- | --- | --- |
| `OBJECT_STORAGE_DRIVER` | Yes | `mock` または `s3` |
| `S3_ENDPOINT` | S3時 | S3互換APIのURL。HTTPS必須 |
| `S3_REGION` | S3時 | サービスが要求するregion（R2では通常 `auto`） |
| `S3_BUCKET` | S3時 | 事前に作成した非公開バケット |
| `S3_ACCESS_KEY_ID` | S3時 | ストレージのアクセスキー |
| `S3_SECRET_ACCESS_KEY` | S3時 | ストレージのシークレットキー |
| `S3_FORCE_PATH_STYLE` | No | `true` または `false`。既定値は `false`。MinIOなど必要な環境で `true` |
| `S3_ALLOW_INSECURE_LOCAL_ENDPOINT` | No | ローカル開発専用。`NODE_ENV=development` のとき `true` を明示するとloopback endpoint（localhost、127.0.0.1、[::1]）だけHTTPを許可 |

`S3_ALLOW_INSECURE_LOCAL_ENDPOINT=true` は `NODE_ENV=development` と組み合わせた場合に限り、ローカル開発のloopback endpointでHTTPを許可します。開発環境である `infra/backend.yaml` はこの変数を設定しないため、`NODE_ENV=development` でもKubernetesではHTTPSが必須です。Composeは既定で `mock` を使うため、この例外を有効にしません。

PUT URLは `PutObjectCommand` から生成し、拡張子 `jpg` / `png` / `webp` に応じた `image/jpeg` / `image/png` / `image/webp` の `Content-Type` を署名します。ブラウザはURLへ直接PUTし、同じ `Content-Type` ヘッダーを送ってください。URLの有効期限はアップロードセッションの残り時間以下、最大300秒です。GET URLは既存どおり60秒です。閲覧権限はapplication/domain層で確認し、認可済み `PhotoAccessGrant` を要求するport契約を維持します。

`exists()` は `HeadObject` の成功を `true`、明確な404 / `NotFound` を `false` とします。403、認証失敗、接続障害、5xxなどはそのままエラーになります。これはオブジェクトの存在確認だけで、画像の内容・サイズ・マジックバイト・安全性の検証ではありません。

## 1PasswordとKubernetes

1Password Item `fuzzy-octo-doodle-s3` に次のフィールドを用意し、既存の1Password Kubernetes OperatorでKubernetes Secret `fuzzy-octo-doodle-s3` に同じキー名で同期してください。

```text
S3_ENDPOINT
S3_REGION
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_FORCE_PATH_STYLE
```

`infra/backend.yaml` はこのSecretを任意の `secretKeyRef` として参照します。Secretが未作成でも現在の `OBJECT_STORAGE_DRIVER=mock` で稼働でき、Secret値はGitに置きません。S3へ切り替える前に、operatorの既存設定でItemとSecretの紐付けを用意し、Secretの全必須キーとバケット設定を確認してください。Vault ID / Item ID はこのリポジトリで管理していないため、operator設定は実際の環境で値を確認して構成します。1Password APIをbackendから呼び出す必要はありません。

切り替え時は、`infra/backend.yaml` の `OBJECT_STORAGE_DRIVER` を `s3` に変更してbackendを再起動します。Secretが不足または不正ならbackendは起動に失敗するため、切り替え前にoperatorの同期状態と設定値を確認してください。Compose開発環境は明示的に `mock` のままです。

バケットの自動作成は行いません。NetworkPolicyのegressは現状定義されていません。将来egress制限を有効にする場合は、backendからDNSとストレージendpointへのHTTPS通信を許可してください。

## バケット権限

バケットを非公開にし、backend用キーは `evidence/*` のみに制限してください。AWS S3で必要な最小操作は次のとおりです。

- `s3:PutObject` — `arn:aws:s3:::<bucket>/evidence/*`（署名付きPUT）
- `s3:GetObject` — 同じオブジェクト範囲（署名付きGETとHEAD確認）
- `s3:ListBucket` — バケットリソースに付与。存在しないKeyを404ではなく403として返す環境で、404を必要とする場合に限り検討してください。

`ListBucket` は `evidence/*` のオブジェクト範囲より広い権限で、バケット内のKey一覧を許可する場合があります。`s3:prefix` 条件を付ければ `HeadObject` の存在しないKeyが404になるとは限らないため、付与前に利用サービスの挙動とポリシーを確認してください。AWS S3では `ListBucket` がない場合に存在しないKeyのHEADが403になることがあり、このadapterはその403を意図どおりエラーとして伝播します。S3互換サービスでも挙動を確認してください。無関係な一覧取得、削除、バケット作成の権限は付与しないでください。

## ブラウザCORS

バケットのCORS設定で、利用するfrontend originだけを許可します。例:

```json
[
  {
    "AllowedOrigins": ["https://donee.sora-lab.dev"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

ローカルのfrontendからS3互換endpointへ直接接続する場合だけ、開発用origin（例 `http://localhost:3000`）を追加してください。`*` の許可は使わず、CORS設定後にブラウザからPUTとGETを確認してください。CORSはアクセス権限を置き換えません。

## 運用上の制約

- アップロードセッション配下のKeyはbackendが発行し、frontendから任意のKeyは受け付けません。
- 署名付きURLとアクセスキーをログへ出力しないでください。
- `Content-Type` の署名は送信ヘッダーを固定するもので、画像実体の形式検証ではありません。
- 実S3互換サービスへのPUT→HEAD→GET接続確認は、実環境の認証情報を用意した場合にのみ行います。
