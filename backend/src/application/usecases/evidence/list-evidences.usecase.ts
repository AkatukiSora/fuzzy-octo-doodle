import { OBJECTION_REPOSITORY } from "../../ports/objection.repository.ts";
import type { ObjectionRepository } from "../../ports/objection.repository.ts";
import type { EvidenceListItem } from "../../ports/usecases/list-evidences.port.ts";
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
 * Return only evidence the viewer may read. Initial evidence is available to the
 * owner and friends in every task state. Additional evidence is restricted to
 * the owner and the first-round objector. Authorize each submission before
 * issuing any short-lived read URL; hidden submissions are omitted entirely.
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
    @Inject(OBJECTION_REPOSITORY) private readonly objections: ObjectionRepository,
  ) {
    this.uow = uow;
    this.tasks = tasks;
    this.evidences = evidences;
    this.friendships = friendships;
    this.storage = storage;
  }

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

      const evidences = await this.evidences.listByTask(tx, input.taskId);
      // Only round 1 requested additional evidence; round 2 must not grant access.
      const objection = role === "friend" && evidences.some((e) => e.submissionType === "additional")
        ? await this.objections.findByTaskAndRound(tx, task.id, 1)
        : null;
      const isInitialObjector = objection?.objectorId === input.viewerId;
      const items: EvidenceListItem[] = [];
      for (const evidence of evidences) {
        const grant = authorizePhotoAccess(task, role, evidence.submissionType, isInitialObjector);
        if (grant === null) continue;
        const photoUrls = await Promise.all(evidence.photos.map((path) =>
          this.storage.createSignedReadUrl(grant, path, 60),
        ));
        items.push({ submissionType: evidence.submissionType, submittedAt: evidence.submittedAt, photoUrls });
      }

      return { evidences: items };
    });
  }
}
