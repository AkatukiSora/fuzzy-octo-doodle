import { Module } from "@nestjs/common";
import { FriendActivityController } from "../presentation/http/friends/friend-activity.controller.ts";
import { GetFriendActivityUseCase } from "../application/usecases/friends/get-friend-activity.usecase.ts";
import { ReportUserUseCase } from "../application/usecases/friends/report-user.usecase.ts";
import { PersistenceModule } from "./persistence.module.ts";
import { SharedApplicationModule } from "./shared-application.module.ts";
import { CreateObjectionUseCase } from "../application/usecases/objections/create-objection.usecase.ts";
import { WithdrawObjectionUseCase } from "../application/usecases/objections/withdraw-objection.usecase.ts";
import { ListMyObjectionsUseCase } from "../application/usecases/objections/list-my-objections.usecase.ts";
import { CreateFriendInviteUseCase } from "../application/usecases/friends/create-friend-invite.usecase.ts";
import { GetFriendInviteUseCase } from "../application/usecases/friends/get-friend-invite.usecase.ts";
import { CreateFriendRequestUseCase } from "../application/usecases/friends/create-friend-request.usecase.ts";
import { AcceptFriendRequestUseCase } from "../application/usecases/friends/accept-friend-request.usecase.ts";
import { RejectFriendRequestUseCase } from "../application/usecases/friends/reject-friend-request.usecase.ts";
import { CancelFriendRequestUseCase } from "../application/usecases/friends/cancel-friend-request.usecase.ts";
import { RemoveFriendUseCase } from "../application/usecases/friends/remove-friend.usecase.ts";
import { BlockUserUseCase } from "../application/usecases/friends/block-user.usecase.ts";
import { UnblockUserUseCase } from "../application/usecases/friends/unblock-user.usecase.ts";
import { ListFriendsUseCase } from "../application/usecases/friends/list-friends.usecase.ts";
import { ListFriendRequestsUseCase } from "../application/usecases/friends/list-friend-requests.usecase.ts";
import { ListBlockedUsersUseCase } from "../application/usecases/friends/list-blocked-users.usecase.ts";
import { GetFriendDetailUseCase } from "../application/usecases/friends/get-friend-detail.usecase.ts";
import { ObjectionsController } from "../presentation/http/objections/objections.controller.ts";
import { FriendsController } from "../presentation/http/friends/friends.controller.ts";

/**
 * 責務: friends と objections の HTTP controller と application use case を Nest の DI に登録する composition 層の module である。業務ロジックや port 実装は持たない。
 *
 * composition 層。コントローラとユースケースを Nest の DI に登録し、AppModule から読み込まれる。
 * ユースケースが @Inject する port（リポジトリなど）は、PersistenceModule が束縛して公開している。
 * ユースケースを足したら、providers に追加する（追加し忘れると起動時に依存が解決できずに失敗する）。
 * 新しい route を追加するときは対応 controller と use case の両方を controllers・providers に登録する。repository port、Clock、IdGenerator は PersistenceModule が実装を束縛して公開し、SharedApplicationModule は TaskEventPublisher を公開する。
 */
@Module({
  imports: [PersistenceModule, SharedApplicationModule],
  controllers: [ObjectionsController, FriendsController, FriendActivityController],
  providers: [GetFriendActivityUseCase, ReportUserUseCase, CreateObjectionUseCase, WithdrawObjectionUseCase, ListMyObjectionsUseCase, CreateFriendInviteUseCase, GetFriendInviteUseCase, CreateFriendRequestUseCase, AcceptFriendRequestUseCase, RejectFriendRequestUseCase, CancelFriendRequestUseCase, RemoveFriendUseCase, BlockUserUseCase, UnblockUserUseCase, ListFriendsUseCase, ListFriendRequestsUseCase, ListBlockedUsersUseCase, GetFriendDetailUseCase],
})
export class SocialModule {}
