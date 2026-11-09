import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../ports/unit-of-work.port.ts";
import { FRIENDSHIP_REPOSITORY } from "../../ports/friendship.repository.ts";
import type { FriendshipRepository } from "../../ports/friendship.repository.ts";
import { USER_REPORT_REPOSITORY } from "../../ports/user-report.repository.ts";
import type { UserReportRepository } from "../../ports/user-report.repository.ts";
import { CLOCK } from "../../ports/clock.port.ts";
import type { Clock } from "../../ports/clock.port.ts";
import { ID_GENERATOR } from "../../ports/id-generator.port.ts";
import type { IdGenerator } from "../../ports/id-generator.port.ts";
import { DomainError } from "../../../domain/shared/errors.ts";
import { validateUserReport } from "../../../domain/friendship/user-report.ts";
import type { UserReport } from "../../../domain/friendship/user-report.ts";
import type { ReportUserInput, UserReportReceipt } from "../../ports/usecases/report-user.port.ts";

@Injectable()
export class ReportUserUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(FRIENDSHIP_REPOSITORY) private readonly friends: FriendshipRepository,
    @Inject(USER_REPORT_REPOSITORY) private readonly reports: UserReportRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  execute(input: ReportUserInput): Promise<UserReportReceipt> {
    const detail = validateUserReport(input.reason, input.detail);
    const receipt = (report: UserReport): UserReportReceipt => {
      if (report.targetUserId !== input.targetUserId || report.reason !== input.reason || report.detail !== detail) {
        throw new DomainError("IDEMPOTENCY_KEY_REUSED", "同じ送信キーが別の通報で使われています");
      }
      return { id: report.id, createdAt: report.createdAt };
    };
    return this.uow.run(async tx => {
      const saved = await this.reports.findByKey(tx, input.userId, input.idempotencyKey);
      if (saved !== null) return receipt(saved);
      if (!(await this.friends.areFriends(tx, input.userId, input.targetUserId))) throw new DomainError("NOT_FOUND", "フレンドが見つかりません");
      const report: UserReport = { id: this.ids.uuid(), reporterId: input.userId, targetUserId: input.targetUserId, reason: input.reason, detail, key: input.idempotencyKey, createdAt: this.clock.now() };
      if (await this.reports.insert(tx, report)) return receipt(report);
      const existing = await this.reports.findByKey(tx, input.userId, input.idempotencyKey);
      if (existing === null) throw new DomainError("TEMPORARILY_UNAVAILABLE", "通報結果を確認できません");
      return receipt(existing);
    });
  }
}
