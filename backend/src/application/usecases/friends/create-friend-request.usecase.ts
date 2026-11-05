import { Inject, Injectable } from "@nestjs/common";
import { hashRequest } from "../../../application/shared/request-hash.ts";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { CLOCK } from "../../../application/ports/clock.port.ts";
import type { Clock } from "../../../application/ports/clock.port.ts";
import { ID_GENERATOR } from "../../../application/ports/id-generator.port.ts";
import type { IdGenerator } from "../../../application/ports/id-generator.port.ts";
import { IDEMPOTENCY_REPOSITORY } from "../../../application/ports/idempotency.repository.ts";
import type { IdempotencyRepository } from "../../../application/ports/idempotency.repository.ts";
import { FRIEND_INVITE_REPOSITORY } from "../../../application/ports/friendship.repository.ts";
import type { FriendInviteRepository } from "../../../application/ports/friendship.repository.ts";
import { FRIENDSHIP_REPOSITORY } from "../../../application/ports/friendship.repository.ts";
import type { FriendshipRepository } from "../../../application/ports/friendship.repository.ts";
import { USER_REPOSITORY } from "../../../application/ports/user.repository.ts";
import type { UserRepository } from "../../../application/ports/user.repository.ts";
import { NOTIFICATION_REPOSITORY } from "../../../application/ports/notification.repository.ts";
import type { NotificationRepository } from "../../../application/ports/notification.repository.ts";
import { requestFriendship } from "../../../domain/friendship/friendship.ts";
import type { FriendRequestView } from "../../../domain/friendship/friend-views.ts";
import type { Notification } from "../../../domain/notification/notification.ts";
import { DomainError } from "../../../domain/shared/errors.ts";
import { parseFriendshipId, parseNotificationId } from "../../../domain/shared/id-parsers.ts";
import type { CreateFriendRequestInput } from "../../ports/usecases/create-friend-request.port.ts";

/**
 * 責務: 有効な招待 token を使ったフレンド申請を作成し、招待者に通知する。招待リンクの閲覧だけで申請を承認したり、フレンド関係を成立させたりしない。
 *
 * 全体の流れ:
 *   POST /api/friend-requests
 *     → 全体の Origin・セッションガード → FriendsController.createRequest（本文・ヘッダ検証）
 *     → この execute → 招待者の特定 → FriendshipRepository.findByPair(forUpdate) → domain の requestFriendship
 *     → 関係・通知・冪等性レスポンスを保存し、FriendRequestView を返す。
 *
 * 処理:
 *   1. UnitOfWork.run 内で clock.now と parseIdempotencyKey を用意し、hashRequest("create_friend_request", { inviteToken }) で RequestHash を作り（作ってよいのは hashRequest だけ）、IdempotencyRepository.reserve に userId、create_friend_request、キー、その RequestHash を渡す。
 *   2. 既存記録の hash 不一致は IDEMPOTENCY_KEY_REUSED、完了済み記録は保存された FriendRequestView を返す。新規要求だけを続ける。
 *   3. FriendInviteRepository.findActiveByToken で inviteToken の有効性と inviterId を確認する。招待がなければ NOT_FOUND とする。
 *   4. FriendshipRepository.findByPair(tx, userId, inviterId, { forUpdate: true }) でペアをロックする。同時申請を直列化するため、ロックなしの検索や事前 SELECT による競合判定を使わない。
 *   5. requestFriendship に IdGenerator.uuid() で採番した新規行用 ID、申請者、招待者、既存関係、現在時刻を渡す。既存状態が rejected・cancelled・removed なら domain は同じ関係 ID を再利用する。自分自身への申請、ブロック、既存フレンド、保留中の重複申請は domain のエラーとして扱う。
 *   6. FriendshipRepository.save で申請を保存する。UserRepository から両者を取得して FriendRequestView を組み立て、NotificationRepository.insertIfAbsent で招待者に friend_request 通知を保存する。
 *   7. IdempotencyRepository.complete に成功ステータスと FriendRequestView を保存し、トランザクションをコミットする。招待 token は申請を送る用途だけであり、承認処理は呼ばない。
 *
 * 失敗:
 *   - DomainError("NOT_FOUND"): token に一致する有効な招待がない。
 *   - DomainError("VALIDATION_ERROR"): Idempotency-Key が UUID ではない、または自分自身に申請した。
 *   - DomainError("IDEMPOTENCY_KEY_REUSED"): 同じキーを異なる要求内容で再利用した。
 *   - DomainError("FORBIDDEN"): 相手との関係が blocked である。
 *   - DomainError("ALREADY_EXISTS"): すでにフレンド、または保留中の申請がある。
 *
 * 注意:
 *   - 招待 token は招待者の本人確認や承認を代替しない。申請を受け取った招待者が別途 acceptFriendship を実行して初めてフレンドになる。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class CreateFriendRequestUseCase {
  /** 申請、通知、冪等性レスポンスを原子的に保存するトランザクション境界を提供する。 */
  protected readonly uow: UnitOfWork;
  /** 申請日時と冪等性予約時刻に使う現在時刻を提供する。 */
  protected readonly clock: Clock;
  /** 新しい Friendship と通知の ID を採番する。 */
  protected readonly ids: IdGenerator;
  /** create_friend_request の要求を予約し、再送では成功レスポンスを再利用する。 */
  protected readonly idempotency: IdempotencyRepository;
  /** 招待 token から招待者を特定する。 */
  protected readonly invites: FriendInviteRepository;
  /** 申請対象の 2 人の関係をロック付きで読み、遷移後の関係を保存する。 */
  protected readonly friendships: FriendshipRepository;
  /** 申請者・招待者の表示情報を取得して FriendRequestView を組み立てる。 */
  protected readonly users: UserRepository;
  /** 招待者への friend_request 通知を重複排除付きで保存する。 */
  protected readonly notifications: NotificationRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(CLOCK) clock: Clock,
    @Inject(ID_GENERATOR) ids: IdGenerator,
    @Inject(IDEMPOTENCY_REPOSITORY) idempotency: IdempotencyRepository,
    @Inject(FRIEND_INVITE_REPOSITORY) invites: FriendInviteRepository,
    @Inject(FRIENDSHIP_REPOSITORY) friendships: FriendshipRepository,
    @Inject(USER_REPOSITORY) users: UserRepository,
    @Inject(NOTIFICATION_REPOSITORY) notifications: NotificationRepository,
  ) {
    this.uow = uow;
    this.clock = clock;
    this.ids = ids;
    this.idempotency = idempotency;
    this.invites = invites;
    this.friendships = friendships;
    this.users = users;
    this.notifications = notifications;
  }

  /**
   * 有効な招待 token を使ったフレンド申請を作成し、招待者に通知する。招待リンクの閲覧だけで申請を承認したり、フレンド関係を成立させたりしない。
   * 申請、通知、冪等性レスポンスを UnitOfWork.run 内で原子的に保存する。
   */
  execute(input: CreateFriendRequestInput): Promise<FriendRequestView> {
    return this.uow.run(async (tx) => {
      const now = this.clock.now();
      const requestHash = hashRequest("create_friend_request", { inviteToken: input.inviteToken });
      const record = await this.idempotency.reserve(
        tx,
        input.userId,
        "create_friend_request",
        input.idempotencyKey,
        requestHash,
        now,
      );
      if (record !== null) {
        if (record.requestHash !== requestHash) {
          throw new DomainError("IDEMPOTENCY_KEY_REUSED", "同じキーが別の内容で使われています");
        }
        if (record.responseBody !== null) return record.responseBody;
      }

      const invite = await this.invites.findActiveByToken(tx, input.inviteToken);
      if (invite === null) throw new DomainError("NOT_FOUND", "有効な招待が見つかりません");

      const existing = await this.friendships.findByPair(tx, input.userId, invite.inviterId, { forUpdate: true });
      const pending = requestFriendship(
        parseFriendshipId(this.ids.uuid()),
        input.userId,
        invite.inviterId,
        existing,
        now,
      );
      await this.friendships.save(tx, pending);

      const users = await this.users.findByIds(tx, [input.userId, invite.inviterId]);
      const requestUser = users.find((user) => user.id === input.userId);
      const inviter = users.find((user) => user.id === invite.inviterId);
      if (requestUser === undefined || inviter === undefined) {
        throw new DomainError("NOT_FOUND", "申請者または招待者が見つかりません");
      }

      const view: FriendRequestView = {
        id: pending.id,
        requester: { userId: requestUser.id, nickname: requestUser.nickname },
        addressee: { userId: inviter.id, nickname: inviter.nickname },
        requestedAt: pending.requestedAt,
      };
      const notification: Notification = {
        id: parseNotificationId(this.ids.uuid()),
        userId: inviter.id,
        type: "friend_request",
        title: "フレンド申請が届きました",
        body: `${requestUser.nickname}さんからフレンド申請が届きました`,
        relatedTaskId: null,
        readAt: null,
        createdAt: now,
        deduplicationKey: `create_friend_request:${input.userId}:${input.idempotencyKey}`,
      };
      await this.notifications.insertIfAbsent(tx, notification);
      await this.idempotency.complete(tx, input.userId, "create_friend_request", input.idempotencyKey, 201, view);
      return view;
    });
  }
}
