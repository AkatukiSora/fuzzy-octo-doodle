import type { OwnerTaskView } from "../../../domain/task/task-view.ts";
import type { Page } from "../../../application/ports/task.repository.ts";
import { Inject, Injectable } from "@nestjs/common";
import { toTaskView } from "../../../domain/task/task-view.ts";import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { TASK_REPOSITORY } from "../../../application/ports/task.repository.ts";
import type { TaskRepository } from "../../../application/ports/task.repository.ts";
import type { ListMyTasksInput } from "../../ports/usecases/list-my-tasks.port.ts";

/**
 * 責務: 認証利用者のタスクを条件付きでカーソルページ取得し、本人向け表示型に変換する。検索・絞り込みの意味は repository に委ね、HTTP クエリの検証は担当しない。
 *
 * 全体の流れ:
 *   GET /api/tasks
 *     → TasksController.list（認証利用者とクエリを検証）
 *     → ListMyTasksUseCase.execute
 *     → UnitOfWork.run → TaskRepository.listByOwner
 *     → 各 Task を toTaskView(task, "owner") に変換
 *     → Page<OwnerTaskView> を TasksController から返す。
 *
 * 処理:
 *   1. UnitOfWork.run の中で ListMyTasksQuery を組み立て、TaskRepository.listByOwner(tx, query) を呼ぶ。repository が active/history、status、search、cursor、limit を適用する。
 *   2. 戻り値の items をそれぞれ toTaskView(task, "owner") に変換する。本人向けのため penaltyAmount を含む。
 *   3. 変換後の items と repository の nextCursor を Page<OwnerTaskView> として返す。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class ListMyTasksUseCase {
  /** TaskRepository.listByOwner の読み取りをトランザクション境界内で実行する。 */
  protected readonly uow: UnitOfWork;
  /** 指定条件に合う本人のタスクをカーソルページとして取得する。 */
  protected readonly tasks: TaskRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(TASK_REPOSITORY) tasks: TaskRepository,
  ) {
    this.uow = uow;
    this.tasks = tasks;
  }

  /**
   * 認証利用者のタスクを条件付きでカーソルページ取得し、本人向け表示型に変換する。検索・絞り込みの意味は repository に委ね、HTTP クエリの検証は担当しない。
   * 本体は未実装（todo）。上の「処理」の順に実装する。
   */
    execute(input: ListMyTasksInput): Promise<Page<OwnerTaskView>> {
    return this.uow.run(async (tx) => {
      const page = await this.tasks.listByOwner(tx, {
        owner: input.userId,
        view: input.view,
        limit: input.limit,
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.search === undefined ? {} : { search: input.search }),
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      });
      return {
        items: page.items.map((task) => toTaskView(task, "owner")),
        nextCursor: page.nextCursor,
      };
    });
  }
}
