import { Inject, Injectable } from "@nestjs/common";
import { DomainError } from "../../../domain/shared/errors.ts";
import { expectFriendshipStatus, rejectFriendship } from "../../../domain/friendship/friendship.ts";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { CLOCK } from "../../../application/ports/clock.port.ts";
import type { Clock } from "../../../application/ports/clock.port.ts";
import { FRIENDSHIP_REPOSITORY } from "../../../application/ports/friendship.repository.ts";
import type { FriendshipRepository } from "../../../application/ports/friendship.repository.ts";
import { USER_REPOSITORY } from "../../../application/ports/user.repository.ts";
import type { UserRepository } from "../../../application/ports/user.repository.ts";
import type { FriendRequestView } from "../../../domain/friendship/friend-views.ts";
import type { RejectFriendRequestInput } from "../../ports/usecases/reject-friend-request.port.ts";

/**
 * 責務: 受信者本人の保留中フレンド申請を拒否済み状態にする。申請の作成や拒否理由の保存は担当しない。
 *
 * 全体の流れ:
 *   POST /api/friend-requests/:id/reject
 *     → 全体の Origin・セッションガード → FriendsController.reject（path ID を検証）
 *     → この execute → FriendshipRepository.findById → domain の expectFriendshipStatus / rejectFriendship → FriendshipRepository.save。
 *
 * 処理:
 *   1. UnitOfWork.run 内で FriendshipRepository.findById を呼び、friendshipId の関係を取得する。見つからなければ NOT_FOUND とする。
 *   2. expectFriendshipStatus(f, "pending") で保留中の関係に絞る。別状態なら STATE_CONFLICT とする。
 *   3. rejectFriendship(pending, userId) を呼ぶ。domain が受信者本人かを検証し、rejected 状態を返す。
 *   4. FriendshipRepository.save で拒否状態を保存し、FriendRequestView として返す。
 *
 * 失敗:
 *   - DomainError("NOT_FOUND"): 申請 ID が見つからない。
 *   - DomainError("STATE_CONFLICT"): 申請が pending ではない。
 *   - DomainError("FORBIDDEN"): 呼び出し利用者が申請の受信者ではない。
 *
 * 注意:
 *   - FriendRequestView の requester と addressee の nickname は、UserRepository.findByIds で取得して UserSummary にする。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class RejectFriendRequestUseCase {
  /** 関係の状態変更を保存するトランザクション境界を提供する。 */
  protected readonly uow: UnitOfWork;
  /** Clock port を注入するが、rejectFriendship は日時を受け取らず、現在の domain 遷移では時刻を記録しない。 */
  protected readonly clock: Clock;
  /** 申請を取得し、domain が作った拒否状態を保存する。 */
  protected readonly friendships: FriendshipRepository;
  /** 返す FriendRequestView の両者の nickname を取得する。 */
  protected readonly users: UserRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(CLOCK) clock: Clock,
    @Inject(FRIENDSHIP_REPOSITORY) friendships: FriendshipRepository,
    @Inject(USER_REPOSITORY) users: UserRepository,
  ) {
    this.uow = uow;
    this.clock = clock;
    this.friendships = friendships;
    this.users = users;
  }

  /**
   * 受信者本人の保留中フレンド申請を拒否済み状態にする。申請の作成や拒否理由の保存は担当しない。
   * 関係の遷移と FriendRequestView の作成を 1 つの UnitOfWork.run 内で行う。
   */
  execute(input: RejectFriendRequestInput): Promise<FriendRequestView> {
    return this.uow.run(async (tx) => {
      const friendship = await this.friendships.findById(tx, input.friendshipId, { forUpdate: true });
      if (friendship === null) throw new DomainError("NOT_FOUND", "フレンド申請が見つかりません");

      const pending = expectFriendshipStatus(friendship, "pending");
      const rejected = rejectFriendship(pending, input.userId);
      await this.friendships.save(tx, rejected);

      const users = await this.users.findByIds(tx, [rejected.requesterId, rejected.receiverId]);
      const requester = users.find((user) => user.id === rejected.requesterId);
      const addressee = users.find((user) => user.id === rejected.receiverId);
      if (requester === undefined || addressee === undefined) {
        throw new DomainError("NOT_FOUND", "申請者または受信者が見つかりません");
      }

      return {
        id: rejected.id,
        requester: { userId: requester.id, nickname: requester.nickname },
        addressee: { userId: addressee.id, nickname: addressee.nickname },
        requestedAt: rejected.requestedAt,
      };
    });
  }
}
