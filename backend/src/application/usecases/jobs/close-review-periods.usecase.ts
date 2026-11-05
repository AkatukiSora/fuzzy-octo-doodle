import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { CLOCK } from "../../../application/ports/clock.port.ts";
import type { Clock } from "../../../application/ports/clock.port.ts";
import { TASK_REPOSITORY } from "../../../application/ports/task.repository.ts";
import type { TaskRepository } from "../../../application/ports/task.repository.ts";
import { TaskEventPublisher } from "../../../application/shared/task-event-publisher.ts";
import type { JobResult } from "../../ports/usecases/job-result.ts";
import type { CloseReviewPeriodsInput } from "../../ports/usecases/close-review-periods.port.ts";
import { closeReviewPeriod } from "../../../domain/task/task.ts";
/**
 * 責務: 審査期限を過ぎた reviewing タスクを success に確定し、確定する。ジョブの起動方法や認証は担わない。
 *
 * 全体の流れ:
 *   jobs-main.ts（CronJob が `node dist/jobs-main.js <ジョブ名>` で起動する別エントリーポイント）
 *     → CloseReviewPeriodsUseCase.execute
 *     → TaskRepository.lockReviewEnded
 *     → domain の closeReviewPeriod
 *     → TaskRepository.save / TaskEventPublisher.publish
 *     → JobResult。
 *
 * 処理:
 *   1. Clock.now() を取得し、batchSize を上限として対象を処理する。各タスクの処理は UnitOfWork.run の別トランザクションに分ける。
 *   2. TaskRepository.lockReviewEnded(tx, now, limit) で審査期限が終了した ReviewingTask をロックする。FOR UPDATE SKIP LOCKED が並行ジョブの二重取得を防ぐ。
 *   3. 各 ReviewingTask に closeReviewPeriod(task, now) を呼ぶ。期限がまだ来ていなければ null となり、保存を行わない。
 *   4. 遷移があれば TaskRepository.save(tx, transition.next) と TaskEventPublisher.publish(tx, transition.events) を同じトランザクションで行う。
 *
 * 注意:
 *   - 1件の処理失敗はその1件のトランザクションだけをロールバックし、残りの対象を続ける。ジョブは HTTP クライアントへ DomainError を返さない。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class CloseReviewPeriodsUseCase {
  /** 審査期限が終了したタスクを1件ごとのトランザクションで処理する。 */
  protected readonly uow: UnitOfWork;
  /** 審査期限の判定に使う現在時刻を取得する。 */
  protected readonly clock: Clock;
  /** 審査終了候補をロックし、遷移後のタスクを保存する。 */
  protected readonly tasks: TaskRepository;
  /** 確定イベントを TaskEventPublisher に渡す（通知は今は作らない）。 */
  protected readonly events: TaskEventPublisher;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(CLOCK) clock: Clock,
    @Inject(TASK_REPOSITORY) tasks: TaskRepository,
    @Inject(TaskEventPublisher) events: TaskEventPublisher,
  ) {
    this.uow = uow;
    this.clock = clock;
    this.tasks = tasks;
    this.events = events;
  }

  /**
   * 審査期限を過ぎた reviewing タスクを success に確定し、確定する。ジョブの起動方法や認証は担わない。
   * 本体は未実装（todo）。上の「処理」の順に実装する。
   */
  async execute(input: CloseReviewPeriodsInput): Promise<JobResult> {
    const now = this.clock.now();
    const candidates = await this.uow.run((tx) =>
      this.tasks.lockReviewEnded(tx, now, input.batchSize),
    );
    let processed = 0;
    for (const candidate of candidates) {
      try {
        const closed = await this.uow.run(async (tx) => {
          const task = await this.tasks.findByIdForUpdate(tx, candidate.id);
          if (task?.status !== "reviewing") return false;
          const transition = closeReviewPeriod(task, now);
          if (transition === null) return false;
              await this.tasks.save(tx, transition.next);
              await this.events.publish(tx, transition.events);
          return true;
        });
        if (closed) processed += 1;
      } catch (error) {
        console.error(
          JSON.stringify({
            msg: "close-review-periods: task failed",
            taskId: candidate.id,
            error: String(error),
          }),
        );
      }
    }
    return { processed };
  }
}
