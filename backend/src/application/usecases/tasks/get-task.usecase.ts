import type { TaskView } from "../../../domain/task/task-view.ts";
import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { TASK_REPOSITORY } from "../../../application/ports/task.repository.ts";
import type { TaskRepository } from "../../../application/ports/task.repository.ts";
import { FRIENDSHIP_REPOSITORY } from "../../../application/ports/friendship.repository.ts";
import type { FriendshipRepository } from "../../../application/ports/friendship.repository.ts";
import type { GetTaskInput } from "../../ports/usecases/get-task.port.ts";
import { DomainError } from "../../../domain/shared/errors.ts";
import { viewerRole } from "../../../domain/task/visibility-policy.ts";
import { toTaskView } from "../../../domain/task/task-view.ts";

/**
 * 責務: タスク詳細を読む利用者の関係に応じて閲覧権限を決め、安全な TaskView を返す。HTTP 応答への変換と保存は担当しない。
 *
 * 全体の流れ:
 *   GET /api/tasks/{id}
 *     → TasksController.get（認証利用者と :id を検証）
 *     → GetTaskUseCase.execute
 *     → TaskRepository.findById / FriendshipRepository.areFriends
 *     → domain: viewerRole / toTaskView
 *   本人でもフレンドでもない閲覧者には NOT_FOUND を返し、存在を知らせない。
 *
 * 処理:
 *   1. parseTaskId 済みの taskId で UnitOfWork.run 内から TaskRepository.findById(tx, taskId) を呼ぶ。null なら NOT_FOUND を返す。
 *   2. FriendshipRepository.areFriends(tx, task.ownerId, viewerId) を調べ、viewerRole(task.ownerId, viewerId, isFriend) で owner / friend / none を決める。
 *   3. role が none なら NOT_FOUND を返す。存在を隠すため、権限なしを FORBIDDEN と区別しない。
 *   4. toTaskView(task, role) で閲覧者に合う TaskView を作って返す。friend の場合、非公開ペナルティ額は表示型にも含まれない。
 *
 * 失敗:
 *   - DomainError("NOT_FOUND"): タスクがない、または閲覧者が本人でもフレンドでもない。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class GetTaskUseCase {
  /** タスクとフレンド関係を読む処理を同じ読み取り境界で実行する。 */
  protected readonly uow: UnitOfWork;
  /** taskId に対応するタスクを取得する。 */
  protected readonly tasks: TaskRepository;
  /** 閲覧者と所有者がフレンドかを判定する。 */
  protected readonly friendships: FriendshipRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(TASK_REPOSITORY) tasks: TaskRepository,
    @Inject(FRIENDSHIP_REPOSITORY) friendships: FriendshipRepository,
  ) {
    this.uow = uow;
    this.tasks = tasks;
    this.friendships = friendships;
  }

  /**
   * タスク詳細を読む利用者の関係に応じて閲覧権限を決め、安全な TaskView を返す。HTTP 応答への変換と保存は担当しない。
   * 上の「処理」の順に、トランザクション内でタスク取得・権限判定・表示データ生成を行う。
   */
  execute(input: GetTaskInput): Promise<TaskView> {
    return this.uow.run(async (tx) => {
      // 1. タスクを取得する
      const task = await this.tasks.findById(tx, input.taskId);

      if (task === null) {
        throw new DomainError("NOT_FOUND", "タスクが見つかりません");
      }

      // 2. 所有者と閲覧者のフレンド関係を確認する
      const isFriend = await this.friendships.areFriends(
        tx,
        task.ownerId,
        input.viewerId,
      );

      // 3. 閲覧者の立場を判定する
      const role = viewerRole(
        task.ownerId,
        input.viewerId,
        isFriend,
      );

      // 4. 本人でもフレンドでもなければ閲覧を拒否する
      if (role === "none") {
        throw new DomainError("NOT_FOUND", "タスクが見つかりません");
      }

      // 5. 閲覧者に応じた安全なTaskViewを返す
      return toTaskView(task, role);
    });
  }
}
