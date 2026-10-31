import type { UploadingSession } from "../../../domain/evidence/upload-session.ts";
import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { CLOCK } from "../../../application/ports/clock.port.ts";
import type { Clock } from "../../../application/ports/clock.port.ts";
import { ID_GENERATOR } from "../../../application/ports/id-generator.port.ts";
import type { IdGenerator } from "../../../application/ports/id-generator.port.ts";
import { TASK_REPOSITORY } from "../../../application/ports/task.repository.ts";
import type { TaskRepository } from "../../../application/ports/task.repository.ts";
import { UPLOAD_SESSION_REPOSITORY } from "../../../application/ports/evidence.repository.ts";
import type { UploadSessionRepository } from "../../../application/ports/evidence.repository.ts";
import type { StartEvidenceUploadSessionInput } from "../../ports/usecases/start-evidence-upload-session.port.ts";
import { DomainError } from "../../../domain/shared/errors.ts"
import { parseUploadSessionId } from "../../../domain/shared/id-parsers.ts";
import { startInitialUpload } from "../../../domain/evidence/upload-session.ts";
import { startAdditionalUpload } from "../../../domain/evidence/upload-session.ts";
/**
 * 責務: 所有者の初回または追加証拠提出について、期限内にアップロードセッションを開始して保存する。写真本体の転送は担当しない。
 *
 * 全体の流れ:
 *   POST /api/tasks/{id}/evidence-upload-sessions
 *     → EvidenceController.startSession（認証利用者、:id、本文の提出種別を検証）
 *     → StartEvidenceUploadSessionUseCase.execute
 *     → TaskRepository.findById
 *     → domain: startInitialUpload または startAdditionalUpload
 *     → UploadSessionRepository.insert
 *   次に同じ sessionId で upload-urls を要求し、写真を Object Storage へ直接 PUT する。
 *
 * 処理:
 *   1. parseTaskId 済みの taskId で UnitOfWork.run 内から TaskRepository.findById(tx, taskId) を呼ぶ。タスクがなければ NOT_FOUND を返す。
 *   2. Clock.now() で開始時刻を得て、IdGenerator.uuid() の値を parseUploadSessionId に通して新しいセッション ID にする。
 *   3. submissionType が initial なら active タスクを startInitialUpload(id, task, userId, now) に渡し、additional なら disputed タスクを startAdditionalUpload(id, task, userId, now) に渡す。domain 関数が所有者と開始期限を検証する。
 *   4. UploadSessionRepository.insert(tx, session) で uploading セッションを保存し、セッション情報を返す。
 *
 * 失敗:
 *   - DomainError("NOT_FOUND"): 指定したタスクが存在しない。
 *   - DomainError("FORBIDDEN"): タスク所有者以外が証拠アップロードを開始した。
 *   - DomainError("DEADLINE_EXPIRED"): 初回または追加証拠のアップロード開始期限を過ぎた。
 *   - DomainError("STATE_CONFLICT"): 提出種別に対応する active / disputed 状態ではない。
 *
 * 注意:
 *   - アップロード開始は TaskRepository.findById で行う。タスク状態を更新しないため、docs の手順では findByIdForUpdate を使わない。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class StartEvidenceUploadSessionUseCase {
  /** タスクの読み取りとアップロードセッションの保存をひとつのトランザクションで行う。 */
  protected readonly uow: UnitOfWork;
  /** 提出期限内にセッションを開始できるかを判定する現在時刻を提供する。 */
  protected readonly clock: Clock;
  /** アップロードセッションの ID を UUID で採番する。 */
  protected readonly ids: IdGenerator;
  /** 提出対象のタスクを取得する。 */
  protected readonly tasks: TaskRepository;
  /** domain が作った uploading セッションを保存する。 */
  protected readonly uploadSessions: UploadSessionRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(CLOCK) clock: Clock,
    @Inject(ID_GENERATOR) ids: IdGenerator,
    @Inject(TASK_REPOSITORY) tasks: TaskRepository,
    @Inject(UPLOAD_SESSION_REPOSITORY) uploadSessions: UploadSessionRepository,
  ) {
    this.uow = uow;
    this.clock = clock;
    this.ids = ids;
    this.tasks = tasks;
    this.uploadSessions = uploadSessions;
  }

  /**
   * 所有者の初回または追加証拠提出について、期限内にアップロードセッションを開始して保存する。写真本体の転送は担当しない。
   * 本体は未実装（todo）。上の「処理」の順に実装する。
   */
  execute(input: StartEvidenceUploadSessionInput): Promise<UploadingSession> {
    return this.uow.run(async (tx) => {
      const task = await this.tasks.findById(tx, input.taskId);
      if (!task) {
        throw new DomainError("NOT_FOUND", "タスクが見つかりません");
      }
      const now = this.clock.now();
      const sessionId = parseUploadSessionId(this.ids.uuid());
      let session: UploadingSession;

      if (input.submissionType === "initial") {
        if (task.status !== "active") {
          throw new DomainError(
            "STATE_CONFLICT",
            "初回提出できる状態ではありません",
          );
        }
        session = startInitialUpload(
          sessionId,
          task,
          input.userId,
          now,
        );
      } else {
        if (task.status !== "disputed") {
          throw new DomainError(
            "STATE_CONFLICT",
            "追加提出できる状態ではありません",
          );
        }
        session = startAdditionalUpload(
          sessionId,
          task,
          input.userId,
          now,
        );
      }
      await this.uploadSessions.insert(tx, session);
      return session;
});
  }
}
