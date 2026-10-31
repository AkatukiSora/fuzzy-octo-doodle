import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { CLOCK } from "../../../application/ports/clock.port.ts";
import type { Clock } from "../../../application/ports/clock.port.ts";
import { NOTIFICATION_REPOSITORY } from "../../../application/ports/notification.repository.ts";
import type { NotificationRepository } from "../../../application/ports/notification.repository.ts";
import type { MarkAllNotificationsReadInput } from "../../ports/usecases/mark-all-notifications-read.port.ts";

/**
 * 責務: 認証利用者本人の未読通知をすべて既読にする。他の利用者の通知は変更しない。
 *
 * 全体の流れ:
 *   POST /api/notifications/read-all
 *     → NotificationsController.readAll（セッション利用者を取得）
 *     → この execute
 *     → NotificationRepository.markAllRead
 *     → 本文なしで204を返す。
 *
 * 処理:
 *   1. UnitOfWork.run の中で Clock.now() を取得する。
 *   2. NotificationRepository.markAllRead(tx, userId, now) を呼び、本人の未読通知だけを同じ時刻で既読にする。
 *   3. 戻り値の本文は作らず、null を返す。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class MarkAllNotificationsReadUseCase {
  /** 一括既読更新をトランザクション内で行う。 */
  protected readonly uow: UnitOfWork;
  /** 既読にした時刻を取得する。 */
  protected readonly clock: Clock;
  /** 利用者本人の未読通知をすべて既読に更新する。 */
  protected readonly notifications: NotificationRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(CLOCK) clock: Clock,
    @Inject(NOTIFICATION_REPOSITORY) notifications: NotificationRepository,
  ) {
    this.uow = uow;
    this.clock = clock;
    this.notifications = notifications;
  }

  /**
   * 認証利用者本人の未読通知をすべて既読にする。他の利用者の通知は変更しない。
   * 本体は未実装（todo）。上の「処理」の順に実装する。
   */
  execute(input: MarkAllNotificationsReadInput): Promise<null> {
    return this.uow.run(async (tx) => {
      await this.notifications.markAllRead(tx, input.userId, this.clock.now());
      return null;
    });
  }
}
