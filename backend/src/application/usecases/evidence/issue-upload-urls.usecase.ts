import type { UploadUrlsResult } from "../../ports/usecases/issue-upload-urls.port.ts";
import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { CLOCK } from "../../../application/ports/clock.port.ts";
import type { Clock } from "../../../application/ports/clock.port.ts";
import { TASK_REPOSITORY } from "../../../application/ports/task.repository.ts";
import type { TaskRepository } from "../../../application/ports/task.repository.ts";
import { UPLOAD_SESSION_REPOSITORY } from "../../../application/ports/evidence.repository.ts";
import type { UploadSessionRepository } from "../../../application/ports/evidence.repository.ts";
import { OBJECT_STORAGE } from "../../../application/ports/object-storage.port.ts";
import type { ObjectStorage } from "../../../application/ports/object-storage.port.ts";
import type { IssueUploadUrlsInput } from "../../ports/usecases/issue-upload-urls.port.ts";
import { DomainError } from "../../../domain/shared/errors.ts";
import {
  expectUploading,
  issuePhotoPath,
} from "../../../domain/evidence/upload-session.ts";

/**
 * 責務: 有効なアップロードセッションに対して、サーバー管理の写真パスと署名付き PUT URL を発行する。クライアント指定の任意パスは受け付けない。
 *
 * 全体の流れ:
 *   POST /api/tasks/{id}/evidence-upload-sessions/{sessionId}/upload-urls
 *     → EvidenceController.issueUrls（認証利用者、タスク ID、セッション ID、写真枠を検証）
 *     → IssueUploadUrlsUseCase.execute
 *     → TaskRepository.findByIdForUpdate / UploadSessionRepository.findByIdForUpdate
 *     → domain: expectUploading / issuePhotoPath
 *     → ObjectStorage.createSignedUploadUrl
 *   クライアントは返却 URL に写真を PUT した後、complete を呼ぶ。
 *
 * 処理:
 *   1. parseTaskId 済みの taskId と parseUploadSessionId 済みの sessionId を使い、UnitOfWork.run 内で TaskRepository.findByIdForUpdate と UploadSessionRepository.findByIdForUpdate を呼ぶ。対象がなければ NOT_FOUND を返す。
 *   2. Clock.now() を使ってセッションの完了期限を確認し、task と session の所有者・関連付けを照合する。
 *   3. expectUploading(session) で状態を uploading に絞る。完了済み・期限切れなど別状態のセッションには URL を発行しない。
 *   4. photos の各 slot と extension に対して issuePhotoPath(session, slot, extension) を呼び、セッション配下の StoragePath をサーバー側で作る。
 *   5. 各パスについて ObjectStorage.createSignedUploadUrl(path, expiresInSec) を呼び、slot、path、uploadUrl を UploadUrlsResult にまとめる。
 *
 * 失敗:
 *   - DomainError("NOT_FOUND"): タスクまたはアップロードセッションが存在しない。
 *   - DomainError("FORBIDDEN"): 認証利用者がタスクまたはセッションの所有者ではない。
 *   - DomainError("STATE_CONFLICT"): アップロードセッションが uploading 状態ではない。
 *   - DomainError("DEADLINE_EXPIRED"): アップロードセッションの完了期限を過ぎた。
 *
 * 注意:
 *   - TaskRepository.findByIdForUpdate と UploadSessionRepository.findByIdForUpdate は完了処理との競合を避ける排他取得である。署名 URL 発行前に所有者・関連付け・状態を確認する。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class IssueUploadUrlsUseCase {
  /** タスクとセッションのロック付き読み取りをまとめる処理境界である。 */
  protected readonly uow: UnitOfWork;
  /** セッションのアップロード期限を現在時刻と照合するために使う。 */
  protected readonly clock: Clock;
  /** 提出対象タスクを行ロック付きで取得する。 */
  protected readonly tasks: TaskRepository;
  /** 対象セッションを行ロック付きで取得し状態を確認する。 */
  protected readonly uploadSessions: UploadSessionRepository;
  /** サーバーが決めた写真パスに対する短期署名付き PUT URL を発行する。 */
  protected readonly storage: ObjectStorage;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(CLOCK) clock: Clock,
    @Inject(TASK_REPOSITORY) tasks: TaskRepository,
    @Inject(UPLOAD_SESSION_REPOSITORY) uploadSessions: UploadSessionRepository,
    @Inject(OBJECT_STORAGE) storage: ObjectStorage,
  ) {
    this.uow = uow;
    this.clock = clock;
    this.tasks = tasks;
    this.uploadSessions = uploadSessions;
    this.storage = storage;
  }

  /**
   * 有効なアップロードセッションに対して、サーバー管理の写真パスと署名付き PUT URL を発行する。クライアント指定の任意パスは受け付けない。
   * 本体は未実装（todo）。上の「処理」の順に実装する。
   */
async execute(input: IssueUploadUrlsInput): Promise<UploadUrlsResult> {
  return this.uow.run(async (tx) => {
    // 1. タスクとアップロードセッションをロック付きで取得
    const task = await this.tasks.findByIdForUpdate(tx, input.taskId);
    if (!task) {
      throw new DomainError("NOT_FOUND", "タスクが見つかりません");
    }

    const session = await this.uploadSessions.findByIdForUpdate(
      tx,
      input.sessionId,
    );
    if (!session) {
      throw new DomainError("NOT_FOUND", "アップロードセッションが見つかりません");
    }

    // 2. 所有者と関連付けを確認
    if (
      task.ownerId !== input.userId ||
      session.userId !== input.userId
    ) {
      throw new DomainError("FORBIDDEN", "このセッションは利用できません");
    }

    if (session.taskId !== task.id) {
      throw new DomainError("NOT_FOUND", "タスクとセッションが一致しません");
    }

    // 3. 完了期限を確認
    const now = this.clock.now();
    if (now.getTime() > session.uploadExpiresAt.getTime()) {
      throw new DomainError("DEADLINE_EXPIRED", "アップロード完了期限を過ぎています");
    }

    // 4. uploading 状態であることを確認
    const uploading = expectUploading(session);

    // 5. 写真ごとにサーバー管理のパスを生成
    const uploads = await Promise.all(
      input.photos.map(async ({ slot, extension }) => {
        const path = issuePhotoPath(uploading, slot, extension);

        // 署名URLはセッションの残り有効時間を超えないようにする
        const remainingSeconds = Math.max(
          1,
          Math.ceil(
            (session.uploadExpiresAt.getTime() - now.getTime()) / 1000,
          ),
        );

        const uploadUrl = await this.storage.createSignedUploadUrl(
          path,
          remainingSeconds,
        );

        return { slot, path, uploadUrl };
      }),
    );

    return { uploads };
  });
}
}
