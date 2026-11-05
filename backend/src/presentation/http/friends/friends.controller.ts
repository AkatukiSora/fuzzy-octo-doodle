import { z } from "zod";
import type { FriendInviteView } from "../../../domain/friendship/friend-invite.ts";
import type { UserSummary } from "../../../domain/friendship/friend-views.ts";
import type { FriendRequestView } from "../../../domain/friendship/friend-views.ts";
import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.ts";
import { Public } from "../auth/public.decorator.ts";
import type { UserId } from "../../../domain/shared/ids.ts";
import { parseUserId, parseFriendshipId } from "../../../domain/shared/id-parsers.ts";
import { parseIdempotencyKey } from "../../../domain/shared/idempotency.ts";
import { AcceptFriendRequestUseCase } from "../../../application/usecases/friends/accept-friend-request.usecase.ts";
import { BlockUserUseCase } from "../../../application/usecases/friends/block-user.usecase.ts";
import { CancelFriendRequestUseCase } from "../../../application/usecases/friends/cancel-friend-request.usecase.ts";
import { CreateFriendInviteUseCase } from "../../../application/usecases/friends/create-friend-invite.usecase.ts";
import { CreateFriendRequestUseCase } from "../../../application/usecases/friends/create-friend-request.usecase.ts";
import { GetFriendInviteUseCase } from "../../../application/usecases/friends/get-friend-invite.usecase.ts";
import { ListBlockedUsersUseCase } from "../../../application/usecases/friends/list-blocked-users.usecase.ts";
import { ListFriendRequestsUseCase } from "../../../application/usecases/friends/list-friend-requests.usecase.ts";
import { ListFriendsUseCase } from "../../../application/usecases/friends/list-friends.usecase.ts";
import { RejectFriendRequestUseCase } from "../../../application/usecases/friends/reject-friend-request.usecase.ts";
import { RemoveFriendUseCase } from "../../../application/usecases/friends/remove-friend.usecase.ts";
import { UnblockUserUseCase } from "../../../application/usecases/friends/unblock-user.usecase.ts";

const createFriendRequestBodySchema = z.object({ inviteToken: z.string() });
/**
 * 責務: 招待、フレンド申請、フレンド一覧、ブロックの HTTP 入出力を受け持ち、検証済み入力を対応 use case に渡す。関係の権限・状態遷移や repository 操作は所有しない。
 *
 * 全体の流れ:
 *   HTTP リクエスト → 全体のガード（Origin、セッション）→ このコントローラ → ユースケース → レスポンス
 *   API 全体の /api prefix の下にルートを公開する。OriginGuard と SessionAuthGuard が先に適用されるが、招待情報を読む GET /friend-invites/:token だけは @Public() で認証を要求しない。handler は application/usecases/friends の use case を呼び、DomainError の HTTP 変換は共通例外 filter に委ねる。
 *
 * 各ハンドラの実装（presentation 層の仕事はここまで）:
 *   1. Zod で、パス・クエリ・ヘッダ・本文を検証する（形式の誤りは ZodError → 400）。
 *   2. parse*Id などで、文字列を名目型に変換する。
 *   3. ユースケースの execute を呼び、戻り値をそのまま返す。
 * 業務のルール（権限、状態の遷移、排他）は、ここに書かない。ユースケースと domain の責務である。
 */
@Controller("")
export class FriendsController {
  constructor(
    @Inject(AcceptFriendRequestUseCase) protected readonly acceptFriendRequest: AcceptFriendRequestUseCase,
    @Inject(BlockUserUseCase) protected readonly blockUser: BlockUserUseCase,
    @Inject(CancelFriendRequestUseCase) protected readonly cancelFriendRequest: CancelFriendRequestUseCase,
    @Inject(CreateFriendInviteUseCase) protected readonly createFriendInvite: CreateFriendInviteUseCase,
    @Inject(CreateFriendRequestUseCase) protected readonly createFriendRequest: CreateFriendRequestUseCase,
    @Inject(GetFriendInviteUseCase) protected readonly getFriendInvite: GetFriendInviteUseCase,
    @Inject(ListBlockedUsersUseCase) protected readonly listBlockedUsers: ListBlockedUsersUseCase,
    @Inject(ListFriendRequestsUseCase) protected readonly listFriendRequests: ListFriendRequestsUseCase,
    @Inject(ListFriendsUseCase) protected readonly listFriends: ListFriendsUseCase,
    @Inject(RejectFriendRequestUseCase) protected readonly rejectFriendRequest: RejectFriendRequestUseCase,
    @Inject(RemoveFriendUseCase) protected readonly removeFriend: RemoveFriendUseCase,
    @Inject(UnblockUserUseCase) protected readonly unblockUser: UnblockUserUseCase,
  ) { }

  /**
   * 有効な自分の招待リンクを再利用し、なければ作成して返す。
   *
   * HTTP: POST /api/friend-invites → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: CurrentUser の userId。body、query、header は受け取らない。
   * 呼び出し先: CreateFriendInviteUseCase.execute
   */
  @Post("friend-invites")
  @HttpCode(200)
  createInvite(@CurrentUser() user: UserId): Promise<FriendInviteView> {
    return this.createFriendInvite.execute({ userId: user });
  }

  /**
   * 有効な招待 token に対応する招待者の公開プロフィールを返す。
   *
   * HTTP: GET /api/friend-invites/:token → 200
   * 認証: 不要（@Public）
   * 入力: path の :token。認証不要の公開 route であり、token の有効性は use case が確認する。
   * 呼び出し先: GetFriendInviteUseCase.execute
   * 主な失敗: NOT_FOUND
   */
  @Public()
  @Get("friend-invites/:token")
  @HttpCode(200)
  getInvite(@Param("token") rawToken: string): Promise<UserSummary> {
    const token = z.string().parse(rawToken);
    return this.getFriendInvite.execute({ token });
  }

  /**
   * 招待 token を使って招待者へフレンド申請を送るが、申請は承認しない。
   *
   * HTTP: POST /api/friend-requests → 201
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: CurrentUser の userId、Idempotency-Key ヘッダ、body の inviteToken。ヘッダ形式と本文の文字列形式を検証する。
   * 呼び出し先: CreateFriendRequestUseCase.execute
   * 主な失敗: NOT_FOUND / VALIDATION_ERROR / IDEMPOTENCY_KEY_REUSED / FORBIDDEN / ALREADY_EXISTS
   */
  @Post("friend-requests")
  @HttpCode(201)
  createRequest(@CurrentUser() user: UserId, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown): Promise<FriendRequestView> {
    const { inviteToken } = createFriendRequestBodySchema.parse(body);
    const idempotencyKey = parseIdempotencyKey(z.string().parse(key));
    return this.createFriendRequest.execute({ userId: user, idempotencyKey, inviteToken });
  }

  /**
   * incoming または outgoing を指定して pending 申請を返す。
   *
   * HTTP: GET /api/friend-requests → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: CurrentUser の userId、query の direction。値を incoming または outgoing に限定して検証する。
   * 呼び出し先: ListFriendRequestsUseCase.execute
   */
  @Get("friend-requests")
  @HttpCode(200)
  listRequests(@CurrentUser() user: UserId, @Query() query: Record<string, string | undefined>): Promise<readonly FriendRequestView[]> {
    const { direction } = z.object({
      direction: z.enum(["incoming", "outgoing"]),
    }).parse(query);
    return this.listFriendRequests.execute({
      userId: user,
      direction
    });
  }

  /**
   * 受信者本人が pending 申請を承認する。
   *
   * HTTP: POST /api/friend-requests/:id/accept → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: CurrentUser の userId、path の :id。path ID を UUID 形式で検証する。
   * 呼び出し先: AcceptFriendRequestUseCase.execute
   * 主な失敗: NOT_FOUND / STATE_CONFLICT / FORBIDDEN
   */
  @Post("friend-requests/:id/accept")
  @HttpCode(200)
  accept(@CurrentUser() user: UserId, @Param("id") rawId: string): Promise<FriendRequestView> {
    const friendshipId = parseFriendshipId(z.string().parse(rawId));
    return this.acceptFriendRequest.execute({ userId: user, friendshipId });
  }

  /**
   * 受信者本人が pending 申請を拒否する。
   *
   * HTTP: POST /api/friend-requests/:id/reject → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: CurrentUser の userId、path の :id。path ID を UUID 形式で検証する。
   * 呼び出し先: RejectFriendRequestUseCase.execute
   * 主な失敗: NOT_FOUND / STATE_CONFLICT / FORBIDDEN
   */
  @Post("friend-requests/:id/reject")
  @HttpCode(200)
  reject(@CurrentUser() user: UserId, @Param("id") rawId: string): Promise<FriendRequestView> {
    const friendshipId = parseFriendshipId(z.string().parse(rawId));
    return this.rejectFriendRequest.execute({ userId: user, friendshipId });
  }

  /**
   * 申請者本人が pending 申請を取り消す。
   *
   * HTTP: POST /api/friend-requests/:id/cancel → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: CurrentUser の userId、path の :id。path ID を UUID 形式で検証する。
   * 呼び出し先: CancelFriendRequestUseCase.execute
   * 主な失敗: NOT_FOUND / STATE_CONFLICT / FORBIDDEN
   */
  @Post("friend-requests/:id/cancel")
  @HttpCode(200)
  cancel(@CurrentUser() user: UserId, @Param("id") rawId: string): Promise<FriendRequestView> {
    const friendshipId = parseFriendshipId(z.string().parse(rawId));
    return this.cancelFriendRequest.execute({ userId: user, friendshipId });
  }

  /**
   * ログイン利用者の accepted なフレンド一覧を返す。
   *
   * HTTP: GET /api/friends → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: CurrentUser の userId。body、query、header は受け取らない。
   * 呼び出し先: ListFriendsUseCase.execute
   */
  @Get("friends")
  @HttpCode(200)
  list(@CurrentUser() user: UserId): Promise<readonly UserSummary[]> {
    return this.listFriends.execute({ userId: user });
  }

  /**
   * 相手との accepted なフレンド関係を解除する。
   *
   * HTTP: DELETE /api/friends/:userId → 204
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: CurrentUser の userId、path の :userId。相手 ID を UUID 形式で検証する。
   * 呼び出し先: RemoveFriendUseCase.execute
   * 主な失敗: NOT_FOUND / STATE_CONFLICT
   */
  @Delete("friends/:userId")
  @HttpCode(204)
  remove(@CurrentUser() user: UserId, @Param("userId") rawFriendUserId: string): Promise<null> {
    const friendUserId = parseUserId(z.string().parse(rawFriendUserId));
    return this.removeFriend.execute({ userId: user, friendUserId });
  }

  /**
   * ログイン利用者がブロックした相手の一覧を返す。
   *
   * HTTP: GET /api/blocked-users → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: CurrentUser の userId。body、query、header は受け取らない。
   * 呼び出し先: ListBlockedUsersUseCase.execute
   */
 @Get("blocked-users")
@HttpCode(200)
listBlocked(@CurrentUser() user: UserId): Promise<readonly UserSummary[]> {
  return this.listBlockedUsers.execute({ userId: user });
}

  /**
   * 指定した相手をブロックし、関係の有無を応答で区別しない。
   *
   * HTTP: POST /api/users/:userId/block → 204
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: CurrentUser の userId、path の :userId。対象 ID を UUID 形式で検証する。
   * 呼び出し先: BlockUserUseCase.execute
   * 主な失敗: VALIDATION_ERROR / STATE_CONFLICT
   */
  @Post("users/:userId/block")
  @HttpCode(204)
  block(@CurrentUser() user: UserId, @Param("userId") rawTargetUserId: string): Promise<null> {
    const targetUserId = parseUserId(z.string().parse(rawTargetUserId));
    return this.blockUser.execute({ userId: user, targetUserId });
  }

  /**
   * 自分が設定した相手へのブロックを解除する。
   *
   * HTTP: DELETE /api/users/:userId/block → 204
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: CurrentUser の userId、path の :userId。対象 ID を UUID 形式で検証する。
   * 呼び出し先: UnblockUserUseCase.execute
   * 主な失敗: NOT_FOUND / STATE_CONFLICT / FORBIDDEN
   */
  @Delete("users/:userId/block")
  @HttpCode(204)
  unblock(@CurrentUser() user: UserId, @Param("userId") rawTargetUserId: string): Promise<null> {
    const targetUserId = parseUserId(z.string().parse(rawTargetUserId));
    return this.unblockUser.execute({ userId: user, targetUserId });
  }
}
