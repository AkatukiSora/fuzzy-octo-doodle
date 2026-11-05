import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { CLOCK } from "../../../application/ports/clock.port.ts";
import type { Clock } from "../../../application/ports/clock.port.ts";
import { FRIENDSHIP_REPOSITORY } from "../../../application/ports/friendship.repository.ts";
import type { FriendshipRepository } from "../../../application/ports/friendship.repository.ts";
import type { RemoveFriendInput } from "../../ports/usecases/remove-friend.port.ts";
import { DomainError } from "../../../domain/shared/errors.ts";
import { expectFriendshipStatus, removeFriendship } from "../../../domain/friendship/friendship.ts";

/**
 * 責務: 2 人の accepted なフレンド関係を removed 状態にする。ユーザーのブロックや申請の拒否は担当しない。
 *
 * 全体の流れ:
 *   DELETE /api/friends/:userId
 *     → 全体の Origin・セッションガード → FriendsController.remove（相手 ID を検証）
 *     → この execute → FriendshipRepository.findByPair(forUpdate) → domain の expectFriendshipStatus / removeFriendship → save → 204。
 *
 * 処理:
 *   1. UnitOfWork.run 内で FriendshipRepository.findByPair(tx, userId, friendUserId, { forUpdate: true }) を呼ぶ。ペア関係の同時変更を防ぐためロック付き取得を使う。
 *   2. 関係がない場合は NOT_FOUND とし、expectFriendshipStatus(f, "accepted") で現在フレンドであることを確認する。別状態なら STATE_CONFLICT とする。
 *   3. removeFriendship(accepted, userId) で removed 状態を作り、FriendshipRepository.save で保存する。
 *   4. HTTP 204 に対応する null を返す。
 *
 * 失敗:
 *   - DomainError("NOT_FOUND"): 指定した 2 人の関係がない。
 *   - DomainError("STATE_CONFLICT"): 関係が accepted ではない。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class RemoveFriendUseCase {
  /** フレンド関係の状態変更をトランザクション内で保存する。 */
  protected readonly uow: UnitOfWork;
  /** Clock port を注入するが、removeFriendship は日時を受け取らず、解除時刻を記録しない。 */
  protected readonly clock: Clock;
  /** 利用者ペアの関係を排他取得し、解除後の状態を保存する。 */
  protected readonly friendships: FriendshipRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(CLOCK) clock: Clock,
    @Inject(FRIENDSHIP_REPOSITORY) friendships: FriendshipRepository,
  ) {
    this.uow = uow;
    this.clock = clock;
    this.friendships = friendships;
  }

  /**
   * 2 人の accepted なフレンド関係を removed 状態にする。ユーザーのブロックや申請の拒否は担当しない。
   */
  async execute(input: RemoveFriendInput): Promise<null> {
    return this.uow.run(async (tx) => {
      const friendship = await this.friendships.findByPair(
        tx,
        input.userId,
        input.friendUserId,
        { forUpdate: true },
      );
      if (friendship === null) {
        throw new DomainError("NOT_FOUND", "関係がありません");
      }
      const accepted = expectFriendshipStatus(friendship, "accepted");
      const removed = removeFriendship(accepted, input.userId);
      await this.friendships.save(tx, removed);
      return null;
    });
  }
}
