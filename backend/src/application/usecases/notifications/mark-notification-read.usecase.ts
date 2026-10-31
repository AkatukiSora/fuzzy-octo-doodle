import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { CLOCK } from "../../../application/ports/clock.port.ts";
import type { Clock } from "../../../application/ports/clock.port.ts";
import { NOTIFICATION_REPOSITORY } from "../../../application/ports/notification.repository.ts";
import type { NotificationRepository } from "../../../application/ports/notification.repository.ts";
import type { MarkNotificationReadInput } from "../../ports/usecases/mark-notification-read.port.ts";

/**
 * 責務: 利用者本人の指定通知を未読から既読に更新する。他人の通知や存在しない通知の有無は知らせない。
 *
 * 全体の流れ:
 *   POST /api/notifications/{id}/read
 *     → NotificationsController.read（セッション利用者と path parameter を検証）
 *     → この execute
 *     → NotificationRepository.markRead
 *     → 本文なしで204を返す。
 *
 * 処理:
 *   1. UnitOfWork.run の中で Clock.now() を取得する。
 *   2. NotificationRepository.markRead(tx, userId, notificationId, now) を呼ぶ。Repository は userId と未読状態も条件にして更新する。
 *   3. 更新対象が0件でも追加の DomainError は投げず、null を返す。
 *
 * 注意:
 *   - 通知が存在しない、他人の通知である、または既読済みの場合も更新は0件となり、操作結果から存在を推測できない。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class MarkNotificationReadUseCase {
  /** 既読更新をトランザクション内で行う。 */
  protected readonly uow: UnitOfWork;
  /** 既読にした時刻を取得する。 */
  protected readonly clock: Clock;
  /** 利用者本人の未読通知だけを既読に更新する。 */
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
   * 利用者本人の指定通知を未読から既読に更新する。他人の通知や存在しない通知の有無は知らせない。
   * 本体は未実装（todo）。上の「処理」の順に実装する。
   */
  execute(input: MarkNotificationReadInput): Promise<null> {
    return this.uow.run(async (tx) => {
      await this.notifications.markRead(tx, input.userId, input.notificationId, this.clock.now());
      return null;
    });
  }
}
