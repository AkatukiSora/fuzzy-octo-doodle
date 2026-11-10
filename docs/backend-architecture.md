# バックエンドのアーキテクチャ

> ユースケースを実装する人は、先に [オンボーディング資料](onboarding-usecase.md) を読む。

`backend/` はオニオンアーキテクチャで構成する。依存の向きは外側から内側への一方向だけで、内側の層は外側の層を import しない。

```text
presentation (HTTP。NestJS の Controller)   ─┐
infrastructure (DB、Storage、決済の実装)      ├─→ application ─→ domain
                                            ─┘
```

| 層 | 場所 | 責務 | 依存してよいもの |
|---|---|---|---|
| domain | `backend/src/domain/` | 集約、状態遷移、ポリシー。クラスを使わず、型と関数で構成する | なし（標準ライブラリのみ） |
| application | `backend/src/application/` | ユースケースと、外部とのインターフェース（port） | domain |
| infrastructure | `backend/src/infrastructure/` | port の実装（DB、Storage、決済、時計） | application、domain |
| presentation | `backend/src/presentation/` | HTTP の入出力、認証、DTO への変換、エラーの HTTP 変換 | application |

## 依存性の注入（DI）

domain と application は、特定のフレームワークを import しない。

TypeScript の `interface` はコンパイル後に消えるため、実行時に実装を差し込むには別の目印が要る。そこで port ごとに `Symbol` のトークンを定義する。

```ts
// application/ports/task.repository.ts
export const TASK_REPOSITORY = Symbol("TaskRepository");
export interface TaskRepository { /* ... */ }
```

使う側は、トークンで受け取る。

```ts
// ユースケース（NestJS の @Inject を使う場合）
constructor(@Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository) {}
```

束縛は、NestJS のモジュールで行う。実装を差し替えるときに変更するのは、この1行だけである。

```ts
{ provide: TASK_REPOSITORY, useClass: KyselyTaskRepository }
```

`@Inject` は NestJS のデコレータである。「フレームワークに依存しない」のは domain と port の定義であり、ユースケースのクラスに `@Inject` を付ける場合は、そのクラスだけが NestJS に触れる。これも避けたい場合は、ユースケースを素のクラスにして、NestJS のモジュール内の factory（`useFactory`）で組み立てる。

## ファイル構成と責務

### domain

| ファイル | 責務 |
|---|---|
| `shared/brand.ts`, `shared/ids.ts` | 名目型（`Brand`）と、`TaskId` や `UserId` などの ID の型 |
| `shared/errors.ts` | `DomainError` と `ErrorCode`。HTTP ステータスへの変換は presentation の責務 |
| `shared/exhaustive.ts`, `shared/time.ts`, `shared/transition.ts` | `assertNever`、時間の定数、遷移の戻り値 `{ next, events }` |
| `task/task.ts` | タスクの状態型（共用体）と、全ての状態遷移の関数 |
| `task/task-policy.ts` | 期限（10分〜72時間）、金額（100〜10,000円）、同時3件、審査24時間、アップロード猶予5分の定数と検証 |
| `task/task-values.ts` | タイトルや金額の `parse*` 関数 |
| `task/task-status.ts` | 状態名の型 |
| `task/visibility-policy.ts`, `task/task-view.ts` | 誰が何を見られるかの判定と、権限の証明型。フレンド向けの出力型 |
| `task/task-events.ts` | 遷移が返すドメインイベント |
| `evidence/evidence.ts`, `evidence/upload-session.ts` | 証拠と、アップロードセッション |
| `objection/objection.ts` | 異議と取り下げ |
| `friendship/friendship.ts`, `friendship/friend-invite.ts` | フレンド関係（申請、承認、拒否、取消、解除、ブロック）と招待リンク |
| `user/user.ts` | ユーザーと、達成率の算出 |
| `feed/post.ts`, `notification/notification.ts` | 投稿、リアクション、通知の型 |

### application/ports

| port（トークン） | 責務 |
|---|---|
| `Clock`（`CLOCK`） | 現在時刻 |
| `IdGenerator`（`ID_GENERATOR`） | UUID と、招待リンク用の推測されにくいトークンの採番 |
| `UnitOfWork`（`UNIT_OF_WORK`） | トランザクション境界。`Tx` は中身の見えない型で、実装だけが中身を知る |
| `UserRepository` | ユーザーの取得と保存、達成実績の集計 |
| `FriendshipRepository`, `FriendInviteRepository` | フレンド関係と招待リンク |
| `TaskRepository` | タスクの保存、行ロック付き取得、一覧、期限切れジョブ用のロック取得 |
| `EvidenceRepository`, `UploadSessionRepository` | 証拠と、アップロードセッション |
| `ObjectionRepository` | 異議。先着1件の判定を含む |
| `PostRepository`, `ReactionRepository` | タイムラインの投稿とリアクション |
| `NotificationRepository` | アプリ内通知 |
| `IdempotencyRepository` | `Idempotency-Key` の予約と、レスポンスの保存 |
| `ObjectStorage` | 証拠写真の署名付き URL の発行と、存在確認 |
| `PaymentGateway` | 支払い状態の確認と、請求依頼。MVP ではモック |

### infrastructure（実装先）

| 場所 | 責務 |
|---|---|
| `infrastructure/db/schema.ts` | テーブルの型（Kysely） |
| `infrastructure/db/mappers/` | DB の行と domain 型の相互変換。不正な行は例外にする |
| `infrastructure/db/repositories/` | 各 `*Repository` の実装 |
| `infrastructure/db/unit-of-work.ts` | `UnitOfWork` の実装 |
| `infrastructure/db/errors.ts` | 一意制約違反の判定と、重複を許容する INSERT |
| `infrastructure/db/postgres.ts` | 環境変数（または `_FILE` で指すファイル）から読む PostgreSQL の接続設定と Dialect |
| `infrastructure/storage/` | `ObjectStorage` の実装 |
| `infrastructure/payment/` | `PaymentGateway` のモック実装 |
| `infrastructure/system/` | `Clock` と `IdGenerator` の実装 |
| `backend/migrations/` | スキーマの SQL |

### application のユースケース（実装先）

`application/usecases/<領域>/<操作>.usecase.ts` に、1ファイル1ユースケースで置く。入力 `<名前>Input`、出力 `<名前>Output` と、それに付随する型は、型の定義を port 側に置く規則に従い、`application/ports/usecases/<操作>.port.ts` に定義する（ID は `TaskId` などの名目型で持つ）。Output は新しい型を作らず、domain の型（`OwnerTaskView`、`FeedItemView` など）をそのまま返す（実体のある型への別名は作らない）。複数のユースケースが共有する表示形は `domain/` に置く。ユースケースのファイルには、`@Injectable()` のクラス `<名前>UseCase` がある。実装するのは `execute` の本体（`todo()` を置き換える）で、入出力の型とコンストラクタ（依存）は先に決めてある。依存を増やすときは、コンストラクタに `@Inject(トークン)` を足す。

コントローラ（`presentation/http/<領域>/`）の各ハンドラも `todo()` で、Zod で入力を検証 → `parse*` で名目型にする → `execute` を呼ぶ、の順に実装する。モジュール（`composition/<領域>.module.ts`）に登録済み。ユースケースは、次の流れで書く。

1. 入力を検証する。値は `parse*` を通して名目型にする。
2. `UnitOfWork.run` の中で、port と domain の関数を呼ぶ。
3. 遷移関数が返したイベントを、投稿に変換して保存する（通知は今は作らない。モック）。
4. コミット後に、外部への依頼（請求）を行う。

## NestJS の骨格

| 場所 | 責務 | 担当 |
|---|---|---|
| `main.ts` | 起動。`PORT` で待ち受ける | 骨格（済み） |
| `composition/create-app.ts` | アプリの組み立て。API を `/api` 配下に置く（`/healthz` を除く）。起動とテストの両方で使う | 骨格（済み） |
| `composition/app.module.ts` | ルートのモジュール。機能のモジュールはここの `imports` に足す | 骨格（済み） |
| `composition/persistence.module.ts` | DB 接続と、DB・システムに依存する port の束縛 | 骨格（済み） |
| `composition/auth.module.ts` | 認証ガードと Origin ガードの全体適用 | 骨格（済み） |
| `presentation/http/errors/` | `DomainError`、`ZodError`、Nest の例外を API のエラーレスポンスに変換する | 骨格（済み） |
| `presentation/http/auth/` | `@Public()`、`@CurrentUser()`、`SessionAuthGuard`、`OriginGuard` | 実装済み |
| `infrastructure/auth/` | Better Auth設定と`SessionAuthenticator`の実装 | 実装済み |
| `infrastructure/system/system.ts` | `Clock` と `IdGenerator` の実装 | 骨格（済み） |

### リクエストが処理される流れ

1 つのリクエストは、次の順に通る。各ファイルの先頭のコメントに、同じ形式（責務、全体の流れ）でその箇所の役割を書いてある。

1. `main.ts` が `createApp()` でアプリを組み立て、`PORT` で待ち受ける。
2. `OriginGuard`（`presentation/http/auth/`）が、状態を変えるリクエストの `Origin` を確認する。CSRF 対策の 2 層目（1 層目は Cookie の `SameSite=Lax`）。
3. `SessionAuthGuard` が、Cookie のセッション ID から利用者を確定し、`request.userId` に載せる。`@Public()` のエンドポイントは省く。
4. コントローラ（`presentation/http/<領域>/`）が、パス・クエリ・ヘッダ・本文を Zod で検証し、`parse*` で名目型にして、ユースケースの `execute` を呼ぶ。利用者の ID は `@CurrentUser()` で受け取る。
5. ユースケース（`application/usecases/<領域>/`）が、`UnitOfWork.run` の中で、domain の関数と port を呼ぶ。業務の手順を持つのはここ。
6. domain の関数が、状態の遷移と権限の判定を行う。DB や HTTP は知らない。
7. port の実装（`infrastructure/`）が DB などに読み書きする。
8. 途中で例外が起きたら、`AllExceptionsFilter` が `DomainError`・`ZodError`・その他を API のエラーレスポンスに変換する。

層の責務の境目は、「入力の形の誤り（400）はコントローラ」「業務のルール違反（403・404・409・422 など）はユースケースと domain」。

### 開発の手順

- `pnpm --filter @app/backend dev` — `tsx watch` で起動する（デコレータを使うため、Node の strip-types は使えない）。DB の接続設定は環境変数で渡す。
- 本番は `tsc` でビルドし、`node dist/main.js` で起動する。
- `emitDecoratorMetadata` は使わない。依存は必ず `@Inject(トークン)` で明示する。

### 実装を引き継ぐ箇所の目印

本体が未実装の関数は `todo("名前")`（`application/shared/todo.ts`）を返す。`todo` は `never` を返すので、型検査は通る。

- 残りの数: `grep -r "todo(" backend/src | wc -l`
- 実装したら `todo(` を消す。完了の条件は、`todo(` が残っていないことと、型検査・lint・ビルドが通ること。

### 認証の方針

- Better Authのメール・パスワード認証とDBセッションを使う。設定・Migration・運用は[better-auth.md](better-auth.md)を参照。
- Cookie の属性: `HttpOnly; SameSite=Lax; Path=/api`、HTTPSでは`Secure`。発行・検証はBetter Authが行う。
- CSRF 対策: `SameSite=Lax` に加え、状態を変えるリクエストで `Origin` を検証する（`OriginGuard`）。
- 認証が不要なエンドポイントには `@Public()` を付ける。

## 型による保証

テストコードは書かず、不正な状態や操作をコンパイルできない形にして担保する。`pnpm typecheck` が通ることが検証になる。

| 保証すること | 方法 |
|---|---|
| 不正な状態遷移（達成済みに証拠提出、審査中に追加証拠など） | `Task` を `status` で判別する共用体にし、遷移関数の引数を遷移元の状態に限定する |
| 状態ごとに必要な値（審査期限、追加証拠期限、達成日時） | 該当する状態の型にだけフィールドを持たせる。`reviewing` は必ず `reviewDeadlineAt` を持つ |
| 再審査（2回目）の異議は取り下げ不可 | `Objection<1, "open">` だけが取り下げ関数に渡せる |
| 非公開の金額がフレンド向け出力に載らない | `FriendTaskView` は `isPenaltyPublic: false` のとき `penaltyAmount?: never` |
| 権限のない証拠写真 URL の発行 | `ObjectStorage.createSignedReadUrl` が `authorizePhotoAccess` の結果（`PhotoAccessGrant`）を要求する |
| 権限のない異議申し立て | `createObjection` が `authorizeObjection` の結果（`ObjectionRight`）と審査中のタスクを要求する |
| 写真は1〜3枚 | `PhotoPaths` は1〜3要素のタプル型 |
| ストレージのパスの検証 | `ObjectStorage` の各メソッドは、`parseStoragePath` を通した `StoragePath` だけを受け付ける。`PhotoPaths` の要素も `StoragePath` |
| 期限の範囲と作成数の上限の確認 | `createTask` の入力は `parseTaskDeadline` の結果（`TaskDeadline`）と `authorizeTaskCreation` の結果（`TaskCreationPermit`）を要求する |
| 冪等性の対象 | `IdempotencyRepository` は、列挙した `IdempotentOperation`、`parseIdempotencyKey` を通した `IdempotencyKey`、`RequestHash`、成功のステータスに限った `IdempotentResponseStatus`（200、201、204）だけを受け付ける。これらの型と `parse*` は `domain/shared/idempotency.ts` にあり、port のファイルには入出力のインターフェースだけを置く |
| 検証前の値の混入 | タイトル、金額、ニックネームは `parse*` を通した名目型（`Brand`）だけを受け付ける |
| ID の取り違え | `TaskId` や `UserId` を名目型にする |
| フレンド関係の状態の網羅 | `switch` の `default` で `assertNever` を呼ぶ。状態を増やすとコンパイルエラーになる |

具体例は `backend/src/domain/type-guarantees.ts` にある。`@ts-expect-error` を付けた行は、コンパイルできてはいけない操作である。型が緩むと、未使用の `@ts-expect-error` として `pnpm typecheck` が失敗する。このファイルは実行されず、ビルドの出力にも含まれない。

型で表せないもの（期限などの時刻、フレンド数、行ロックの取得）は、関数内の実行時検証と、port の契約で扱う。DB から読んだ値を特定の状態に絞る `expectStatus` などは、infrastructure のマッパーとユースケースの境界で使う。

## タスクの状態遷移

遷移は `domain/task/task.ts` の純粋関数で行い、`{ next, events }`（`TaskTransition`。共通の定義は `shared/transition.ts` の `Transition`）を返す。元の値は変更しない。

| 契機 | 関数（引数の状態） | 結果 |
|---|---|---|
| 作成 | `createTask` | `active` |
| 初回証拠の提出確定 | `submitInitialEvidence(active, friendCount, now)` | フレンド0人は `success`。1人以上は `reviewing`（1回目、24時間審査） |
| 初回審査中の異議の受理 | `acceptFirstObjection(reviewing 1回目, now)` | `disputed`（追加証拠の期限は24時間後） |
| 再審査中の異議の受理 | `acceptSecondObjection(reviewing 2回目, now)` | `indeterminate` |
| 追加証拠の提出確定 | `submitAdditionalEvidence(disputed, now)` | `reviewing`（2回目、24時間の再審査） |
| 異議の取り下げ | `withdrawFirstObjection(disputed, 初回の未取り下げ異議, now)` | `success` |
| 初回期限切れ（ジョブ） | `expireInitial(active, now, hasLiveUploadSession)` | `failed`（請求の対象） |
| 審査期間の終了（ジョブ） | `closeReviewPeriod(reviewing, now)` | `success` |
| 追加証拠の期限切れ（ジョブ） | `expireAdditional(disputed, now, hasLiveUploadSession)` | `indeterminate`（請求なし） |

ジョブ用の関数は、まだ確定しない場合に `null` を返す。多重に実行しても結果は変わらない。

## ユースケースと使う部品

API 設計書のエンドポイントごとに、使う関数と port を示す。重要な POST は、冒頭で `IdempotencyRepository.reserve` による冪等性の確認を行う（詳細は後述）。

### タスク

| 操作 | 処理の流れ |
|---|---|
| `POST /api/tasks` | `PaymentGateway.assertCanCreateTask` → `lockUserForCreation` → `countActiveInitial` → `authorizeTaskCreation` → `parseTaskDeadline` → `createTask` → `TaskRepository.insert` → 「作成」の投稿 |
| `GET /api/tasks` | `TaskRepository.listByOwner` → `toTaskView(task, "owner")` |
| `GET /api/tasks/{id}` | `findById` → `viewerRole`（本人・フレンド・その他）→ 「その他」は `NOT_FOUND`。それ以外は `toTaskView` |
| `GET /api/tasks/{id}/retry-template` | 本人のタスクを取得し、入力値だけを返す。保存はしない |

### 証拠の提出

| 操作 | 処理の流れ |
|---|---|
| `POST /api/tasks/{id}/evidence-upload-sessions` | `findById` → `startInitialUpload` または `startAdditionalUpload` → `UploadSessionRepository.insert` |
| `POST .../upload-urls` | `findByIdForUpdate` → `expectUploading` → `issuePhotoPath` で決めたパスに `ObjectStorage.createSignedUploadUrl` |
| `POST .../complete` | 下記の手順 |
| `GET /api/tasks/{id}/evidences` | `viewerRole` → `authorizePhotoAccess`（null なら `FORBIDDEN`）→ `listByTask` → 写真ごとに `createSignedReadUrl` |

`complete` の手順は次のとおり。

1. `TaskRepository.findByIdForUpdate` と `UploadSessionRepository.findByIdForUpdate` で行ロックを取る。
2. `completeUpload`（所有者と完了期限の検証）。
3. `parsePhotoPaths`（1〜3枚）と、`ObjectStorage.exists` による存在確認。
4. `EvidenceRepository.insert`（重複は `ALREADY_EXISTS`）。
5. `countFriends` を取得し、`submitInitialEvidence` または `submitAdditionalEvidence` を呼ぶ。
6. `TaskRepository.save`、イベントから投稿を保存する（通知は今は作らない）。

### 異議

| 操作 | 処理の流れ |
|---|---|
| `POST /api/tasks/{id}/objections` | `findByIdForUpdate` → `areFriends` → `authorizeObjection` → `createObjection` → `ObjectionRepository.tryInsert`（false なら `STATE_CONFLICT`）→ `acceptFirstObjection` または `acceptSecondObjection` → `save` |
| `POST /api/objections/{id}/withdraw` | `ObjectionRepository.findById` → `TaskRepository.findByIdForUpdate` → `expectOpenFirst` → `withdrawObjection` → `withdrawFirstObjection` → 保存 |
| `GET /api/me/objections` | `listByObjector`。判定が確定したタスクの写真は返さない |

### フレンド

| 操作 | 処理の流れ |
|---|---|
| `POST /api/friend-invites` | `FriendInviteRepository.findActiveByInviter`。なければ `IdGenerator.inviteToken` で作って `insert` する |
| `GET /api/friend-invites/{token}` | `findActiveByToken` → 招待者のニックネームを返す |
| `POST /api/friend-requests` | `invite_token` から `findActiveByToken` で招待者を特定（なければ `NOT_FOUND`）→ `findByPair(forUpdate)` → `requestFriendship` → `save` → 招待者へ通知。申請が作られるだけで、フレンドにはならない |
| `.../accept`, `/reject`, `/cancel` | `findById` → `acceptFriendship`、`rejectFriendship`、`cancelFriendship` → `save` |
| `DELETE /api/friends/{userId}` | `findByPair(forUpdate)` → `removeFriendship` → `save` |
| `POST`、`DELETE /api/users/{userId}/block` | `findByPair(forUpdate)` → `blockUser`（関係の有無を区別しない）→ `save`。解除は `unblockFriendship` |
| `GET /api/friends`, `/friend-requests`, `/blocked-users` | `listFriendIds`、`listIncomingPending`、`listOutgoingPending`、`listBlockedBy` |

### タイムライン・通知・ユーザー

| 操作 | 処理の流れ |
|---|---|
| `GET /api/feed` | `PostRepository.listFeed`。`since` は `now - FEED_WINDOW_DAYS`。タスクは `TaskRepository.findByIds` で取得し、`toTaskView(task, "friend")` で金額を伏せる |
| `GET /api/posts/{id}` | `findFeedItem`（本人とフレンドの投稿だけ返る） |
| `PUT`、`DELETE /api/posts/{id}/reaction` | `ReactionRepository.upsert`、`remove`（投稿を見られる人だけ） |
| 通知 API | `NotificationRepository` の `list`、`countUnread`、`markRead`、`markAllRead` |
| `GET`、`PATCH /api/me` | `UserRepository` と `changeNickname` |
| `GET /api/me/stats` | `getStats` → `successRate` |

### 定期ジョブ

各ジョブは、1回に処理する件数を決めて、1件ごとに別のトランザクションで処理する。

| ジョブ | 処理の流れ |
|---|---|
| 初回期限切れ | `lockExpiredInitial` → `hasLiveSession` → `expireInitial` → 保存 → 「失敗」の投稿 → コミット後に `PaymentGateway.requestCharge` |
| 審査期間の終了 | `lockReviewEnded` → `closeReviewPeriod` → 保存 |
| 追加証拠の期限切れ | `lockExpiredAdditional` → `hasLiveSession` → `expireAdditional` → 保存 |
| アップロードセッションの整理 | `UploadSessionRepository.expireStale` |

`lock*` は `FOR UPDATE SKIP LOCKED` で取得するため、ジョブを複数同時に動かしても同じ行を二重に処理しない。

#### ジョブの起動

ジョブは API とは別のプロセスで、**同じ Docker イメージ**のコマンドだけを変えて動かす。HTTP の入口は作らない（認証の仕組みが要らず、外から呼べる面も増えない）。

- エントリーポイントは `backend/src/jobs-main.ts`。`node dist/jobs-main.js <ジョブ名>` で 1 回実行して終了する。
- ジョブ名は `expire-initial-tasks`、`close-review-periods`、`expire-additional-evidence`、`expire-stale-upload-sessions` の 4 つ。未知の名前は Zod の検証で失敗する。
- 環境変数 `JOB_BATCH_SIZE` で 1 回の処理件数を指定する（正の整数、省略時は 100）。DB の接続設定は API と同じ。
- `AppModule` は使わず `JobsModule` だけで DI コンテナを作るため、ガードや HTTP は載らない。
- 成功時は 0 で終了し、結果（処理件数）を JSON で標準出力に出す。失敗は例外のまま伝わり、終了コード 1 になる。
- 手元では `pnpm --filter @app/backend dev:job <ジョブ名>` で動かせる。

Kubernetes の CronJob では、API と同じイメージを使い、`command` だけを差し替える。`concurrencyPolicy: Forbid` を推奨する（前回の実行が終わる前に、次を始めない）。CronJob の manifest は `k8s-deploys` リポジトリで管理する。

## 実装に影響する関数の使い方

実装者が直接呼ぶ関数と、型を扱うときの約束事をまとめる。いずれも `backend/src/domain/` にある。

### `assertNever`：状態の網羅を型で保証する

`shared/exhaustive.ts` の関数で、`switch` の `default` に置く。全ての状態を `case` で扱い終えると、`default` に届く値の型は `never` になり、コンパイルが通る。状態を増やして `case` を書き忘れると、`never` ではなくなり、コンパイルエラーで漏れを検出できる。実行時に到達した場合は例外を投げる。

```ts
switch (existing.status) {
  case "blocked":
    throw new DomainError("FORBIDDEN", "この相手には申請できません");
  case "accepted":
    throw new DomainError("ALREADY_EXISTS", "すでにフレンドです");
  case "pending":
    throw new DomainError("ALREADY_EXISTS", "すでに申請中です");
  case "rejected":
  case "cancelled":
  case "removed":
    return fresh(existing.id);
  default:
    return assertNever(existing); // 状態が増えて case が足りなければ、ここでコンパイルエラー
}
```

使う場面は次のとおり。

- 共用体（`Task`、`Friendship`、`UploadSession`、`Objection`）の `status` で分岐するとき。ユースケースやマッパーでも同じ書き方をする。
- `default` に `break` や空の処理を書かない。書くと網羅の検査が働かなくなる。
- `if` / `else if` の連鎖で分岐する場合は、最後の `else` で `return assertNever(x)` とする。

### 状態を絞る関数（`expect*`）

DB から読んだ値の型は `Task` や `Friendship` などの共用体で、特定の状態とは限らない。遷移関数に渡す前に、次の関数で状態を絞る。状態が違えば `STATE_CONFLICT` を投げる。

| 関数 | 用途 |
|---|---|
| `expectStatus(task, "reviewing")` | `Task` を指定した状態に絞る（`task/task.ts`） |
| `expectFriendshipStatus(f, "pending")` | `Friendship` を指定した状態に絞る |
| `expectUploading(session)` | `UploadSession` を `uploading` に絞る |
| `expectOpenFirst(objection)` | `Objection` を、初回で未取り下げのものに絞る |

```ts
const task = await tasks.findByIdForUpdate(tx, id);
if (task === null) throw new DomainError("NOT_FOUND", "タスクが見つかりません");
const reviewing = expectStatus(task, "reviewing"); // ReviewingTask（1回目か2回目）
if (reviewing.reviewRound !== 1) {
  throw new DomainError("STATE_CONFLICT", "初回の審査中ではありません"); // ここを通れば 1回目に絞られる
}
const { next, events } = acceptFirstObjection(reviewing, now);
```

引数の型を絞るだけで済む場合（`if (task.status === "active")` の中など）は、`expect*` を使わず、通常の絞り込みで構わない。

### 値を作る関数（`parse*`）

外部から来た文字列や数値は、`parse*` を通して名目型にする。検証に失敗すると `VALIDATION_ERROR` を投げる。名目型の値は `parse*` の外では作れないため、検証を通っていない値は、型の上で遷移関数に渡せない。

| 関数 | 結果の型 | 検証 |
|---|---|---|
| `parseTaskTitle` | `TaskTitle` | 前後の空白を除いて1〜100文字 |
| `parseNonEmptyText(raw, label)` | `NonEmptyText` | 空でないこと。`label` はエラーメッセージに使う |
| `parsePenaltyAmount` | `PenaltyAmount` | 100〜10,000の整数 |
| `parseNickname` | `Nickname` | 前後の空白を除いて1〜20文字 |
| `parsePhotoPaths(session, paths)` | `PhotoPaths` | 1〜3枚、重複なし、セッション配下のパスだけ。各要素を `parseStoragePath` で検証する |
| `parseStoragePath` | `StoragePath` | S3 のキーとして安全な文字だけ、1024バイト以内、`//` や `..` を含まない |
| `parseTaskDeadline(deadline, now)` | `TaskDeadline` | 作成時点から10分〜72時間 |
| `authorizeTaskCreation(count)` | `TaskCreationPermit` | 初回未提出のタスクが3件未満（権限の証明と同じ扱い） |
| `parseIdempotencyKey` | `IdempotencyKey` | UUID（`domain/shared/idempotency.ts`） |
| `parseRequestHash` | `RequestHash` | SHA-256 の16進64文字 |

`createTask` と `registerUser` は、タイトルなどの文字列を受け取って内部で `parse*` を呼ぶので、ユースケースから個別に呼ぶ必要はない。ただし期限と作成数の上限は、`createTask` の前に `parseTaskDeadline` と `authorizeTaskCreation` を呼び、その結果を入力に渡す。

写真のパスは、アップロード用の署名 URL を発行するとき `issuePhotoPath(session, slot, extension)` でサーバーが決める。クライアントが返してきたパスは、`parsePhotoPaths` で検証してから使う。

ID は、リクエストやDBの文字列を名目型にして使う。変換は、presentation（リクエストの ID）と infrastructure のマッパー（DB の ID）の境界で行い、それ以外の場所では行わない。新しい ID は `IdGenerator.uuid()` の結果を変換する。

### 権限を確かめる関数（`authorize*`）

権限の判定は、結果が「許可の証明」の型になる。証明は、この関数だけが作る。

| 関数 | 結果 | 渡す先 |
|---|---|---|
| `viewerRole(ownerId, viewerId, isFriend)` | `"owner"`、`"friend"`、`"none"` | `toTaskView`、`authorize*` |
| `authorizePhotoAccess(task, role)` | `PhotoAccessGrant` または `null` | `ObjectStorage.createSignedReadUrl` |
| `authorizeObjection(task, role, viewerId)` | `{ task, right }` または `null` | `createObjection` |

`null` が返ったら、`FORBIDDEN` を投げる。ただし、本人でもフレンドでもない人（`role` が `"none"`）に対しては、対象の存在を隠すため `NOT_FOUND` を返す。

```ts
const role = viewerRole(task.ownerId, viewerId, await friends.areFriends(tx, task.ownerId, viewerId));
const authorized = authorizeObjection(task, role, viewerId);
if (authorized === null) throw new DomainError("FORBIDDEN", "異議を申し立てられません");
const objection = createObjection(
  { id, task: authorized.task, right: authorized.right, reasonType, reasonDetail },
  now,
);
```

`as` で `PhotoAccessGrant` や `ObjectionRight` を作ってはいけない。

### 状態を変える関数（遷移関数）

`task.ts` の遷移関数は、新しい状態とイベントを `{ next, events }` で返す。呼び出し側は、次の順に処理する。

1. 引数の型に合う状態に絞る（`expectStatus` など）。
2. 遷移関数を呼ぶ。
3. `next` を `TaskRepository.save` で保存する。
4. `events` を投稿に変換して保存する（通知は今は作らない）。

遷移関数は、渡された値を書き換えない。保存を忘れても、元の値は変わらない。ジョブ用の関数（`expireInitial`、`closeReviewPeriod`、`expireAdditional`）は、まだ確定しない場合に `null` を返す。`null` のときは何も保存せず、次の対象に進む。

### 時刻の関数

`shared/time.ts` に、`MINUTE_MS`、`HOUR_MS`、`addMs(date, ms)` がある。時刻の計算に `Date.now()` や `new Date()` は使わず、`Clock.now()` の結果と `addMs` で計算する。

## 実装時の規約

### 排他制御

1. タスクの状態を変更するユースケースは、必ず `TaskRepository.findByIdForUpdate` で行ロックを取ってから遷移関数を呼ぶ。取り下げと追加証拠の同時発生や、異議と審査終了の競合は、先に確定した処理が勝つ。
2. 異議の「全フレンド合計で先着1件」は、`ObjectionRepository.tryInsert` の戻り値で判定する。`(task_id, review_round)` の UNIQUE 制約に任せ、事前の SELECT で判定しない。取り下げ済みでも枠は戻らない。
3. タスク作成は、`lockUserForCreation` で同一ユーザーの処理を直列化してから、`countActiveInitial` を確認する。そうしないと、並列のリクエストで3件の上限を超える。
4. フレンド申請は、`findByPair` に `forUpdate` を指定して、同時申請の競合を防ぐ。

### トランザクション

5. 外部への請求依頼（`PaymentGateway.requestCharge`）は、トランザクションのコミット後に呼ぶ。トランザクションの中で外部通信をしない。
6. 一意制約に違反しても継続したい INSERT（通知、投稿の重複排除など）は、PostgreSQL では失敗した文でトランザクション全体が中断される。実装では savepoint で囲み、違反したら savepoint まで戻す。`ON CONFLICT` などの製品固有の構文は使わない。

### 冪等性

7. 重要な POST は `Idempotency-Key` を必須とする。ユースケースの冒頭で `IdempotencyRepository.reserve` を呼ぶ。
   - 戻り値が `null` なら新規の要求である。処理の最後に `complete` でレスポンスを保存する。
   - 記録があり `requestHash` が違えば、`IDEMPOTENCY_KEY_REUSED` を返す。
   - 記録があり完了済みなら、保存したレスポンスを返す。
   - `requestHash` は `application/shared/request-hash.ts` の `hashRequest(操作, ペイロード)` だけで作る。
     - 入力は `{ operation, payload }` を RFC 8785（JSON Canonicalization Scheme、ライブラリ `json-canonicalize`）で正規化した文字列で、UTF-8 の SHA-256 を 16 進 64 文字にする。
     - 使わない値は省略せず `null` にする。型 `RequestPayloads` が、操作ごとに許す項目を決めている（余分な項目や `undefined` は型エラー）。
     - 含めるのは、操作の意味を決める入力。含めないのは、`Idempotency-Key`、利用者 ID、時刻、乱数など。文字列は加工しない。
     - 規則を変えると既存の記録と一致しなくなるため、変更には互換性の判断が要る。
8. 通知を作るときは、`deduplicationKey` で重複を防ぐ（通知は今は作らないため、現時点では使わない）。キーは「種別:タスク ID:審査回」のように、同じ出来事から必ず同じ文字列になる形にする。ジョブが再実行されても、通知は1件になる。

### 時刻・ID・値

9. 時刻は `Clock` から取得する。domain と application では `new Date()` を使わない。DB の日時は UTC で保存する。
10. ID は `IdGenerator.uuid` で採番する。DB の自動採番は使わない。
11. ページングはカーソル方式とし、並び順の列と ID の組で位置を表す。`limit + 1` 件を取得して、次のページの有無を判定する。
12. DB から読んだ行は、マッパーで `Task` などの共用体に変換する。状態と必須フィールドの組み合わせが不正な行は、変換時に例外とする。

### 型の使い方

13. `any` を使わない。backend では、型アサーション（`as`、`<T>`）を lint（`consistent-type-assertions`）で禁止している。`as const` は使ってよい。frontend には適用しない。
14. 名目型を付けるときは `domain/shared/brand.ts` の `brandAs<"名前">()(値)` を使う。検証を済ませた `parse*` / `authorize*` の内部と、DB から読んだ値を信頼できる mapper に限る。
15. 型の変換が避けられない箇所（ジェネリクスの絞り込みなど）は、`// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- 理由` で、理由を書いて明示的に許可する。理由が書けない変換は、設計を見直す。

## エラーの扱い

domain と application は `DomainError`（`code`、`message`、`details`）を投げる。presentation の例外フィルタで、API 設計書のエラーレスポンスに変換する。

| `code` | HTTP ステータス | 発生する場面 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | 入力の形式、文字数、範囲の不正 |
| `UNAUTHENTICATED` | 401 | 未認証 |
| `FORBIDDEN` | 403 | 権限がない |
| `NOT_FOUND` | 404 | 対象がない。見せてはいけない対象も、存在を隠すためにこれを返す |
| `ALREADY_EXISTS`, `STATE_CONFLICT`, `IDEMPOTENCY_KEY_REUSED` | 409 | 重複、状態の競合、冪等キーの再利用 |
| `DEADLINE_EXPIRED`, `TOO_MANY_ACTIVE_TASKS`, `PAYMENT_REQUIRED`, `INVALID_EVIDENCE_COUNT` | 422 | 業務ルールの違反 |
| `TEMPORARILY_UNAVAILABLE` | 503 | サービスの障害 |

予期しない例外（DB の接続エラー、不正な行の変換エラーなど）は 500 にし、詳細はログにだけ出す。

## DB

- DB は PostgreSQL、クエリビルダーは Kysely を使う。
- 接続先と認証情報は環境変数で渡す。各項目は `NAME`（値そのもの）または `NAME_FILE`（値を書いたファイルのパス。Secret のマウントなど）で指定できる。両方の指定はエラーにする。
  - `DATABASE_HOST`、`DATABASE_NAME`、`DATABASE_USER`、`DATABASE_PASSWORD`: 必須
  - `DATABASE_PORT`: 既定は 5432
  - `DATABASE_SSL_MODE`: `disable`（既定）、`require`、`verify-full`。`verify-full` では `DATABASE_SSL_CA`（PEM）で CA を指定できる
  - `DATABASE_POOL_MAX`: 既定は 10
- 起動時に `loadPostgresConfig(process.env)` で 1 回だけ検証し、`createPostgresDialect` で Dialect を作る。
- 製品に依存するのは接続の `Dialect` だけである。別の製品に変える場合は、`postgres.ts` の差し替えと `migrations/` の書き直しで対応する。
- テーブルの定義は `infrastructure/db/schema.ts` を正とし、`migrations/` の SQL と対応させる。

## 要件に対する判断

- 招待リンクは恒久的に再利用でき、`POST /api/friend-invites` でいつでも再取得できる。このため、`friend_invites` にはトークンの平文を保存する（`FriendInvite.token`）。ハッシュだけの保存とは両立しない。
- 招待リンクでできるのは、招待者のプロフィールの閲覧と、フレンド申請の送信だけである。リンクを開いても、招待者の承認は済んだことにならない。フレンドになるには、招待者が申請を `accept` する必要がある。トークンはこの範囲の権限しか持たないので、URL が外部に漏れても、承認なしにフレンドにはなれない。
- 初回期限を過ぎても、期限内に開始したアップロードは期限の5分後まで完了できる。このため、期限切れのジョブは、有効なアップロードセッションが残っている間は `failed` にしない。
- フレンドが証拠写真を見られるのは、`reviewing` と `disputed` の間だけである。判定の確定後は、写真の URL を発行しない。
- 決済は MVP ではモックとし、`PaymentGateway` を差し替えられるようにしておく。

## 未決定

- 認証の追加機能（メール確認・パスワード再設定のメール送信、OAuth、既存seedユーザーの移行方法）。
- 通知・自分の情報の API の経路（`/api/notifications`、`/api/me` 以下）は暫定。API 設計書と食い違う場合は設計書に合わせる。
- 通知の範囲。今は通知を作らず（モック）、`TaskEventPublisher` は投稿だけを保存する。通知を始めるときに、種別（現在の5種は暫定）、宛先、文面を決める。
