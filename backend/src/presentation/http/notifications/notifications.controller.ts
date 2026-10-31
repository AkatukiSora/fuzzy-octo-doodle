import type { Notification } from "../../../domain/notification/notification.ts";
import type { Page } from "../../../application/ports/task.repository.ts";
import type { UnreadCount } from "../../../application/ports/usecases/count-unread-notifications.port.ts";
import { Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator.ts";
import type { UserId } from "../../../domain/shared/ids.ts";
import { CountUnreadNotificationsUseCase } from "../../../application/usecases/notifications/count-unread-notifications.usecase.ts";
import { ListNotificationsUseCase } from "../../../application/usecases/notifications/list-notifications.usecase.ts";
import { MarkAllNotificationsReadUseCase } from "../../../application/usecases/notifications/mark-all-notifications-read.usecase.ts";
import { MarkNotificationReadUseCase } from "../../../application/usecases/notifications/mark-notification-read.usecase.ts";
import { parseNotificationId } from "../../../domain/shared/id-parsers.ts";
/**
 * 責務: 通知 API の HTTP 入出力を受け持つ。認証利用者と入力を UseCase に渡し、通知の検索・既読化は UseCase に委ねる。
 *
 * 全体の流れ:
 *   HTTP リクエスト → 全体のガード（Origin、セッション）→ このコントローラ → ユースケース → レスポンス
 *   /api/notifications を route prefix とし、全体ガードの後にリクエストを受ける。
 *   一覧・件数・既読更新を各 Notifications use case に振り分ける。
 *
 * 各ハンドラの実装（presentation 層の仕事はここまで）:
 *   1. Zod で、パス・クエリ・ヘッダ・本文を検証する（形式の誤りは ZodError → 400）。
 *   2. parse*Id などで、文字列を名目型に変換する。
 *   3. ユースケースの execute を呼び、戻り値をそのまま返す。
 * 業務のルール（権限、状態の遷移、排他）は、ここに書かない。ユースケースと domain の責務である。
 */

const listQuerySchema = z.object({
  filter: z.enum(["all", "unread"]).default("all"),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

@Controller("notifications")
export class NotificationsController {
  constructor(
    @Inject(CountUnreadNotificationsUseCase) protected readonly countUnreadNotifications: CountUnreadNotificationsUseCase,
    @Inject(ListNotificationsUseCase) protected readonly listNotifications: ListNotificationsUseCase,
    @Inject(MarkAllNotificationsReadUseCase) protected readonly markAllNotificationsRead: MarkAllNotificationsReadUseCase,
    @Inject(MarkNotificationReadUseCase) protected readonly markNotificationRead: MarkNotificationReadUseCase,
  ) {}

  /**
   * 本人の通知を条件付きでページ取得する。
   *
   * HTTP: GET /api/notifications → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: @CurrentUser() のセッション利用者 ID と query の filter・cursor・limit。
   * 呼び出し先: ListNotificationsUseCase.execute
   */
  @Get("")
  @HttpCode(200)
  listAll(@CurrentUser() user: UserId, @Query() query: Record<string, string | undefined>): Promise<Page<Notification>> {
        const { filter, cursor, limit } = listQuerySchema.parse(query);
    return this.listNotifications.execute({
      userId: user,
      filter,
      limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
  }

  /**
   * 本人の未読通知数を返す。
   *
   * HTTP: GET /api/notifications/unread-count → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: @CurrentUser() のセッション利用者 ID。
   * 呼び出し先: CountUnreadNotificationsUseCase.execute
   */
  @Get("unread-count")
  @HttpCode(200)
    unreadCount(@CurrentUser() user: UserId): Promise<UnreadCount> {
    return this.countUnreadNotifications.execute({ userId: user });
  }

  /**
   * 本人の未読通知をすべて既読にする。
   *
   * HTTP: POST /api/notifications/read-all → 204
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: @CurrentUser() のセッション利用者 ID。
   * 呼び出し先: MarkAllNotificationsReadUseCase.execute
   */
  @Post("read-all")
  @HttpCode(204)
  readAll(@CurrentUser() user: UserId): Promise<null> {
    return this.markAllNotificationsRead.execute({ userId: user });
  }

  /**
   * 本人の指定通知を既読にする。
   *
   * HTTP: POST /api/notifications/:id/read → 204
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: @CurrentUser() のセッション利用者 ID と path parameter id。
   * 呼び出し先: MarkNotificationReadUseCase.execute
   */
  @Post(":id/read")
  @HttpCode(204)
  read(@CurrentUser() user: UserId, @Param("id") id: string): Promise<null> {
     return this.markNotificationRead.execute({ userId: user, notificationId: parseNotificationId(id) });
  }
}
