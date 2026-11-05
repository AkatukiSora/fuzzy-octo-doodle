import type { EvidenceListResult } from "../../ports/usecases/list-evidences.port.ts";
import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { TASK_REPOSITORY } from "../../../application/ports/task.repository.ts";
import type { TaskRepository } from "../../../application/ports/task.repository.ts";
import { EVIDENCE_REPOSITORY } from "../../../application/ports/evidence.repository.ts";
import type { EvidenceRepository } from "../../../application/ports/evidence.repository.ts";
import { FRIENDSHIP_REPOSITORY } from "../../../application/ports/friendship.repository.ts";
import type { FriendshipRepository } from "../../../application/ports/friendship.repository.ts";
import { OBJECT_STORAGE } from "../../../application/ports/object-storage.port.ts";
import type { ObjectStorage } from "../../../application/ports/object-storage.port.ts";
import type { ListEvidencesInput } from "../../ports/usecases/list-evidences.port.ts";
import { DomainError } from "../../../domain/shared/errors.ts";
import { viewerRole, authorizePhotoAccess } from "../../../domain/task/visibility-policy.ts";

/**
 * 責務: 本人または許可されたフレンドに証拠一覧と写真の短期閲覧 URL を返す。権限のない利用者には URL を発行しない。
 *
 * 全体の流れ:
 *   GET /api/tasks/{id}/evidences
 *     → EvidenceController.list（認証利用者と :id を検証）
 *     → ListEvidencesUseCase.execute
 *     → TaskRepository.findById / FriendshipRepository.areFriends
 *     → domain: viewerRole / authorizePhotoAccess
 *     → EvidenceRepository.listByTask / ObjectStorage.createSignedReadUrl
 *   判定確定後はフレンド向けの写真アクセスを許可しない。
 *
 * 処理:
 *   1. parseTaskId 済みの taskId で UnitOfWork.run 内から TaskRepository.findById(tx, taskId) を呼ぶ。タスクがなければ NOT_FOUND を返す。
 *   2. FriendshipRepository.areFriends(tx, task.ownerId, viewerId) を調べ、viewerRole(task.ownerId, viewerId, isFriend) で閲覧者の役割を決める。role が none なら対象の存在を隠して NOT_FOUND を返す。
 *   3. authorizePhotoAccess(task, role) を呼ぶ。結果が null なら FORBIDDEN を返す。本人は常に許可され、フレンドは reviewing または disputed の間だけ許可される。
 *   4. EvidenceRepository.listByTask(tx, taskId) で証拠を取得し、各写真について ObjectStorage.createSignedReadUrl(grant, path, expiresInSec) を呼ぶ。
 *   5. submissionType、submittedAt、photoUrls を EvidenceListItem にまとめ、EvidenceListResult として返す。
 *
 * 失敗:
 *   - DomainError("NOT_FOUND"): タスクがない、または閲覧者が本人でもフレンドでもない。
 *   - DomainError("FORBIDDEN"): 利用者は本人またはフレンドだが、現在のタスク状態では写真を閲覧できない。
 *
 * 注意:
 *   - authorizePhotoAccess が返す PhotoAccessGrant を使って署名 URL を発行する。grant を経由しない写真 URL の発行を行わない。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class ListEvidencesUseCase {
  /** タスク・権限・証拠を読み取る処理境界である。 */
  protected readonly uow: UnitOfWork;
  /** 対象タスクの存在と所有者を取得する。 */
  protected readonly tasks: TaskRepository;
  /** 対象タスクに保存された証拠を取得する。 */
  protected readonly evidences: EvidenceRepository;
  /** 閲覧者とタスク所有者のフレンド関係を確認する。 */
  protected readonly friendships: FriendshipRepository;
  /** 閲覧を許可した写真に短期署名付き GET URL を発行する。 */
  protected readonly storage: ObjectStorage;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(TASK_REPOSITORY) tasks: TaskRepository,
    @Inject(EVIDENCE_REPOSITORY) evidences: EvidenceRepository,
    @Inject(FRIENDSHIP_REPOSITORY) friendships: FriendshipRepository,
    @Inject(OBJECT_STORAGE) storage: ObjectStorage,
  ) {
    this.uow = uow;
    this.tasks = tasks;
    this.evidences = evidences;
    this.friendships = friendships;
    this.storage = storage;
  }

  /**
   * 本人または許可されたフレンドに証拠一覧と写真の短期閲覧 URL を返す。権限のない利用者には URL を発行しない。
   * 本体は未実装（todo）。上の「処理」の順に実装する。
   */
execute(input: ListEvidencesInput): Promise<EvidenceListResult> {
  return this.uow.run(async (tx) => {
    // 1. タスクを取得
    const task = await this.tasks.findById(tx, input.taskId);

    if (!task) {
      throw new DomainError("NOT_FOUND", "Task not found");
    }

    // 2. 閲覧者の役割を確認
    const isFriend = await this.friendships.areFriends(
      tx,
      task.ownerId,
      input.viewerId,
    );

    const role = viewerRole(task.ownerId, input.viewerId, isFriend);

    if (role === "none") {
      throw new DomainError("NOT_FOUND", "Task not found");
    }

    // 3. 写真の閲覧権限を確認
    const grant = authorizePhotoAccess(task, role);

    if (grant === null) {
      throw new DomainError("FORBIDDEN", "Photo access denied");
    }

    // 4. 証拠一覧を取得
    const evidences = await this.evidences.listByTask(tx, input.taskId);

    // 5. 写真の閲覧URLを発行
    const items = await Promise.all(
      evidences.map(async (evidence) => {
        const photoUrls = await Promise.all(
          evidence.photos.map((path) =>
            this.storage.createSignedReadUrl(grant, path, 60),
          ),
        );

        return {
          submissionType: evidence.submissionType,
          submittedAt: evidence.submittedAt,
          photoUrls,
        };
      }),
    );

    return { evidences: items };
  });
}
}
