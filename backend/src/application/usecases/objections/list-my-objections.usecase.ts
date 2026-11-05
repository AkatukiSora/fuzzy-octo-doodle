import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { OBJECTION_REPOSITORY } from "../../../application/ports/objection.repository.ts";
import type { ObjectionRepository } from "../../../application/ports/objection.repository.ts";
import type { Page } from "../../../application/ports/task.repository.ts";
import type { ObjectionSummary } from "../../../domain/objection/objection-view.ts";
import type { ListMyObjectionsInput } from "../../ports/usecases/list-my-objections.port.ts";

/**
 * 責務: ログイン利用者が申し立てた異議をページ単位で返す。タスクの写真や他人が申し立てた異議はこの一覧に含めない。
 *
 * 全体の流れ:
 *   GET /api/me/objections
 *     → 全体のセッションガード → ObjectionsController.listMine（query 検証）
 *     → この execute → ObjectionRepository.listByObjector → ObjectionSummary のページを返す。
 *
 * 処理:
 *   1. UnitOfWork.run を開始し、cursor と limit をそのまま一覧条件に使う。
 *   2. ObjectionRepository.listByObjector に tx、userId、cursor、limit を渡し、自分が申立人である異議だけを取得する。
 *   3. Page.items を ObjectionSummary に写し、nextCursor を維持して返す。本人が申立人であるため理由を表示できるが、判定確定後を含め写真 URL は取得・返却しない。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class ListMyObjectionsUseCase {
  /** 一覧取得を UnitOfWork.run の読み取りトランザクション内で実行する。 */
  protected readonly uow: UnitOfWork;
  /** 現在の利用者が申し立てた異議をカーソルと件数で取得する。 */
  protected readonly objections: ObjectionRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(OBJECTION_REPOSITORY) objections: ObjectionRepository,
  ) {
    this.uow = uow;
    this.objections = objections;
  }

  /**
   * ログイン利用者が申し立てた異議をページ単位で返す。タスクの写真や他人が申し立てた異議はこの一覧に含めない。
   * 本体は未実装（todo）。上の「処理」の順に実装する。
   */
  execute(input: ListMyObjectionsInput): Promise<Page<ObjectionSummary>> {
  return this.uow.run(async (tx) => {
    const page = await this.objections.listByObjector(
      tx,
      input.userId,
      input.cursor,
      input.limit,
    );

    return {
      items: page.items.map((objection) => ({
        id: objection.id,
        taskId: objection.taskId,
        round: objection.reviewRound,
        reasonType: objection.reasonType,
        reasonDetail: objection.reasonDetail,
        withdrawn: objection.withdrawnAt !== null,
        createdAt: objection.createdAt,
      })),
      nextCursor: page.nextCursor,
    };
  });
}
}
