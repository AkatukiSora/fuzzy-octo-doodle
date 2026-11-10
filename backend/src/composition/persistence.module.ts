import { Inject, Module } from "@nestjs/common";
import { FRIEND_ACTIVITY_REPOSITORY } from "../application/ports/friend-activity.repository.ts";
import { USER_REPORT_REPOSITORY } from "../application/ports/user-report.repository.ts";
import { KyselyFriendActivityRepository } from "../infrastructure/db/repositories/friend-activity.repository.ts";
import { KyselyUserReportRepository } from "../infrastructure/db/repositories/user-report.repository.ts";
import type { OnApplicationShutdown } from "@nestjs/common";
import { S3Client } from "@aws-sdk/client-s3";
import type { Kysely } from "kysely";
import { CLOCK } from "../application/ports/clock.port.ts";
import { EVIDENCE_REPOSITORY, UPLOAD_SESSION_REPOSITORY } from "../application/ports/evidence.repository.ts";
import { POST_REPOSITORY, REACTION_REPOSITORY } from "../application/ports/feed.repository.ts";
import { FRIEND_INVITE_REPOSITORY, FRIENDSHIP_REPOSITORY } from "../application/ports/friendship.repository.ts";
import { ID_GENERATOR } from "../application/ports/id-generator.port.ts";
import { IDEMPOTENCY_REPOSITORY } from "../application/ports/idempotency.repository.ts";
import { NOTIFICATION_REPOSITORY } from "../application/ports/notification.repository.ts";
import { OBJECTION_REPOSITORY } from "../application/ports/objection.repository.ts";
import { TASK_REPOSITORY } from "../application/ports/task.repository.ts";
import { UNIT_OF_WORK } from "../application/ports/unit-of-work.port.ts";
import { USER_REPOSITORY } from "../application/ports/user.repository.ts";
import { createDatabase } from "../infrastructure/db/create-database.ts";
import { createPostgresDialect, loadPostgresConfig } from "../infrastructure/db/postgres.ts";
import type { PostgresHandle } from "../infrastructure/db/postgres.ts";
import { KyselyEvidenceRepository, KyselyUploadSessionRepository } from "../infrastructure/db/repositories/evidence.repository.ts";
import { KyselyPostRepository, KyselyReactionRepository } from "../infrastructure/db/repositories/feed.repository.ts";
import { KyselyFriendInviteRepository, KyselyFriendshipRepository } from "../infrastructure/db/repositories/friendship.repository.ts";
import { KyselyIdempotencyRepository } from "../infrastructure/db/repositories/idempotency.repository.ts";
import { KyselyNotificationRepository } from "../infrastructure/db/repositories/notification.repository.ts";
import { KyselyObjectionRepository } from "../infrastructure/db/repositories/objection.repository.ts";
import { KyselyTaskRepository } from "../infrastructure/db/repositories/task.repository.ts";
import { KyselyUserRepository } from "../infrastructure/db/repositories/user.repository.ts";
import type { Database } from "../infrastructure/db/schema.ts";
import { KyselyUnitOfWork } from "../infrastructure/db/unit-of-work.ts";
import { RandomIdGenerator, SystemClock } from "../infrastructure/system/system.ts";
import { OBJECT_STORAGE } from "../application/ports/object-storage.port.ts";
import type { ObjectStorage } from "../application/ports/object-storage.port.ts";
import { PAYMENT_GATEWAY } from "../application/ports/payment-gateway.port.ts";
import { MockPaymentGateway } from "../infrastructure/payment/mock-payment-gateway.ts";
import { MockObjectStorage } from "../infrastructure/storage/mock-object-storage.ts";
import { SignedUrlObjectStorage } from "../infrastructure/storage/object-storage.ts";
import { loadObjectStorageConfig } from "../infrastructure/storage/s3-config.ts";
import type { ObjectStorageConfig } from "../infrastructure/storage/s3-config.ts";

const POSTGRES_HANDLE = Symbol("PostgresHandle");
export const DATABASE = Symbol("Database");
const OBJECT_STORAGE_CONFIG = Symbol("ObjectStorageConfig");
const S3_CLIENT = Symbol("S3Client");

/**
 * 責務: DB 接続と、DB・システム・外部サービスに依存する port の束縛。application が定義した port（インターフェース）に、
 * infrastructure の実装を結びつける唯一の場所。ユースケースは実装クラスを知らず、トークン（Symbol）だけで注入を受ける。
 *
 * 全体の流れ: 起動時に環境変数から接続設定を読み（loadPostgresConfig）→ Kysely を作り → 各 repository を束縛する。
 * 終了時（SIGTERM など）は `onApplicationShutdown` で接続を閉じる。
 * 機能モジュールは、これを imports して `exports` の port を使う。
 *
 * 実装を差し替える箇所: ObjectStorage（OBJECT_STORAGE_DRIVER でモック / S3互換実装を切り替える）、PaymentGateway（モックから Stripe へ）、認証は AuthModule。
 */
@Module({
  providers: [
    { provide: FRIEND_ACTIVITY_REPOSITORY, useClass: KyselyFriendActivityRepository },
    { provide: USER_REPORT_REPOSITORY, useClass: KyselyUserReportRepository },
    { provide: POSTGRES_HANDLE, useFactory: (): PostgresHandle => createPostgresDialect(loadPostgresConfig(process.env)) },
    { provide: DATABASE, useFactory: (handle: PostgresHandle) => createDatabase(handle.dialect), inject: [POSTGRES_HANDLE] },
    { provide: UNIT_OF_WORK, useFactory: (db: Kysely<Database>) => new KyselyUnitOfWork(db), inject: [DATABASE] },
    { provide: USER_REPOSITORY, useClass: KyselyUserRepository },
    { provide: FRIENDSHIP_REPOSITORY, useClass: KyselyFriendshipRepository },
    { provide: FRIEND_INVITE_REPOSITORY, useClass: KyselyFriendInviteRepository },
    { provide: TASK_REPOSITORY, useClass: KyselyTaskRepository },
    { provide: EVIDENCE_REPOSITORY, useClass: KyselyEvidenceRepository },
    { provide: UPLOAD_SESSION_REPOSITORY, useClass: KyselyUploadSessionRepository },
    { provide: OBJECTION_REPOSITORY, useClass: KyselyObjectionRepository },
    { provide: POST_REPOSITORY, useClass: KyselyPostRepository },
    { provide: REACTION_REPOSITORY, useClass: KyselyReactionRepository },
    { provide: NOTIFICATION_REPOSITORY, useClass: KyselyNotificationRepository },
    { provide: IDEMPOTENCY_REPOSITORY, useClass: KyselyIdempotencyRepository },
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: RandomIdGenerator },
    { provide: OBJECT_STORAGE_CONFIG, useFactory: () => loadObjectStorageConfig(process.env) },
    {
      provide: S3_CLIENT,
      useFactory: (config: ObjectStorageConfig): S3Client | null => {
        if (config.driver === "mock") return null;
        return new S3Client({
          endpoint: config.s3.endpoint,
          region: config.s3.region,
          forcePathStyle: config.s3.forcePathStyle,
          credentials: {
            accessKeyId: config.s3.accessKeyId,
            secretAccessKey: config.s3.secretAccessKey,
          },
        });
      },
      inject: [OBJECT_STORAGE_CONFIG],
    },
    {
      provide: OBJECT_STORAGE,
      useFactory: (config: ObjectStorageConfig, client: S3Client | null): ObjectStorage =>
        createObjectStorage(config, client),
      inject: [OBJECT_STORAGE_CONFIG, S3_CLIENT],
    },
    { provide: PAYMENT_GATEWAY, useClass: MockPaymentGateway },
  ],
  exports: [
    DATABASE,
    FRIEND_ACTIVITY_REPOSITORY,
    USER_REPORT_REPOSITORY,
    UNIT_OF_WORK,
    USER_REPOSITORY,
    FRIENDSHIP_REPOSITORY,
    FRIEND_INVITE_REPOSITORY,
    TASK_REPOSITORY,
    EVIDENCE_REPOSITORY,
    UPLOAD_SESSION_REPOSITORY,
    OBJECTION_REPOSITORY,
    POST_REPOSITORY,
    REACTION_REPOSITORY,
    NOTIFICATION_REPOSITORY,
    IDEMPOTENCY_REPOSITORY,
    CLOCK,
    ID_GENERATOR,
    OBJECT_STORAGE,
    PAYMENT_GATEWAY,
  ],
})
export class PersistenceModule implements OnApplicationShutdown {
  private readonly handle: PostgresHandle;
  private readonly s3Client: S3Client | null;

  constructor(
    @Inject(POSTGRES_HANDLE) handle: PostgresHandle,
    @Inject(S3_CLIENT) s3Client: S3Client | null,
  ) {
    this.handle = handle;
    this.s3Client = s3Client;
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.handle.close();
    } finally {
      this.s3Client?.destroy();
    }
  }
}

export function createObjectStorage(config: ObjectStorageConfig, client: S3Client | null): ObjectStorage {
  if (config.driver === "mock") return new MockObjectStorage();
  if (client === null) throw new Error("S3 storage client was not initialized");
  return new SignedUrlObjectStorage(client, config.s3.bucket);
}
