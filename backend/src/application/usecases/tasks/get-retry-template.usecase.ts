
import type { RetryTemplate } from "../../ports/usecases/get-retry-template.port.ts";
import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { TASK_REPOSITORY } from "../../../application/ports/task.repository.ts";
import type { TaskRepository } from "../../../application/ports/task.repository.ts";
import { DomainError } from "../../../domain/shared/errors.ts";
import type { GetRetryTemplateInput } from "../../ports/usecases/get-retry-template.port.ts";

/**
 * 責務: 本人が所有するタスクから再挑戦フォーム用の初期値を返す。新しいタスクの作成や元タスクの変更は行わない。
 *
 * 全体の流れ:
 *   GET /api/tasks/{id}/retry-template
 *     → TasksController.retryTemplate（認証利用者と :id を検証）
 *     → GetRetryTemplateUseCase.execute
 *     → TaskRepository.findById
 *     → 所有者を照合し RetryTemplate を返す
 *   フォーム送信後は POST /api/tasks の CreateTaskUseCase が新しいタスクを作る。
 *
 * 処理:
 *   1. parseTaskId 済みの taskId で UnitOfWork.run 内から TaskRepository.findById(tx, taskId) を呼ぶ。見つからなければ NOT_FOUND を返す。
 *   2. 取得した task.ownerId と userId を比較する。一致しない場合は所有物の存在を知らせず NOT_FOUND を返す。
 *   3. title、achievementCondition、evidenceMethod、penaltyAmount、isPenaltyPublic、originalTaskId を RetryTemplate に詰めて返す。保存やタスク状態の変更はしない。
 *
 * 失敗:
 *   - DomainError("NOT_FOUND"): 指定したタスクがない、または利用者が所有していない。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class GetRetryTemplateUseCase {
  /** 元タスクの取得を読み取りトランザクション境界内で行う。 */
  protected readonly uow: UnitOfWork;
  /** 再挑戦元となるタスクを ID で取得する。 */
  protected readonly tasks: TaskRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(TASK_REPOSITORY) tasks: TaskRepository,
  ) {
    this.uow = uow;
    this.tasks = tasks;
  }

  /**
   * 本人が所有するタスクから再挑戦フォーム用の初期値を返す。
   * 新しいタスクの作成や元タスクの変更は行わない。
   */
  execute(input: GetRetryTemplateInput): Promise<RetryTemplate> {
    return this.uow.run(async (tx) => {
      const task = await this.tasks.findById(tx, input.taskId);

      if (task === null) {
        throw new DomainError("NOT_FOUND", "タスクが見つかりません");
      }

      if (task.ownerId !== input.userId) {
        throw new DomainError("NOT_FOUND", "タスクが見つかりません");
      }

      return {
        title: task.title,
        achievementCondition: task.achievementCondition,
        evidenceMethod: task.evidenceMethod,
        penaltyAmount: task.penaltyAmount,
        isPenaltyPublic: task.isPenaltyPublic,
        originalTaskId: task.id,
      };
    });
  }
}
