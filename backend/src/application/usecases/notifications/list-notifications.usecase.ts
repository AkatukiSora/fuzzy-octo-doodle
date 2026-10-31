import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { NOTIFICATION_REPOSITORY } from "../../../application/ports/notification.repository.ts";
import type { NotificationRepository } from "../../../application/ports/notification.repository.ts";
import type { Notification } from "../../../domain/notification/notification.ts";
import type { Page } from "../../../application/ports/task.repository.ts";
import type { ListNotificationsInput } from "../../ports/usecases/list-notifications.port.ts";

/**
 * 責務: 認証利用者自身の通知を条件付きでページ取得する。通知の作成や既読更新は担わない。
 *
 * 全体の流れ:
 *   GET /api/notifications
 *     → NotificationsController.listAll（セッション利用者とクエリを検証）
 *     → この execute
 *     → NotificationRepository.list
 *     → 通知ページを返す。
 *
 * 処理:
 *   1. UnitOfWork.run を開始する。
 *   2. NotificationRepository.list(tx, userId, filter, cursor, limit) を呼ぶ。Repository は userId で所有者を絞り、unread の場合は未読だけを返す。
 *   3. 返された Page<Notification> を Output として返す。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class ListNotificationsUseCase {
  /** 通知一覧の読み取りをトランザクション内で行う。 */
  protected readonly uow: UnitOfWork;
  /** 利用者・既読条件・カーソルに応じた通知ページを取得する。 */
  protected readonly notifications: NotificationRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(NOTIFICATION_REPOSITORY) notifications: NotificationRepository,
  ) {
    this.uow = uow;
    this.notifications = notifications;
  }

  /**
   * 認証利用者自身の通知を条件付きでページ取得する。通知の作成や既読更新は担わない。
   * 本体は未実装（todo）。上の「処理」の順に実装する。
   */
  execute(input: ListNotificationsInput): Promise<Page<Notification>> {
    return this.uow.run((tx) =>
      this.notifications.list(tx, input.userId, input.filter, input.cursor, input.limit),
    );
  }
}
