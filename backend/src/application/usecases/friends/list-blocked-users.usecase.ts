import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { FRIENDSHIP_REPOSITORY } from "../../../application/ports/friendship.repository.ts";
import type { FriendshipRepository } from "../../../application/ports/friendship.repository.ts";
import { USER_REPOSITORY } from "../../../application/ports/user.repository.ts";
import type { UserRepository } from "../../../application/ports/user.repository.ts";
import type { UserSummary } from "../../../domain/friendship/friend-views.ts";
import type { ListBlockedUsersInput } from "../../ports/usecases/list-blocked-users.port.ts";
import { friendOf } from "../../../domain/friendship/friendship.ts";

/**
 * 責務: ログイン利用者自身がブロックした相手を一覧で返す。相手から自分へのブロックや申請状態の一覧は担当しない。
 *
 * 全体の流れ:
 *   GET /api/blocked-users
 *     → 全体のセッションガード → FriendsController.listBlocked
 *     → この execute → FriendshipRepository.listBlockedBy → domain の friendOf → UserRepository.findByIds → UserSummary[]。
 *
 * 処理:
 *   1. UnitOfWork.run 内で FriendshipRepository.listBlockedBy(tx, userId) を呼び、本人が設定した blocked 関係を取得する。
 *   2. 各関係について friendOf(f, userId) で相手側の UserId を取り出し、UserRepository.findByIds に渡す。
 *   3. 相手の userId と nickname を UserSummary に写して返す。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class ListBlockedUsersUseCase {
  /** ブロック関係と対象プロフィールの読み取りをトランザクション内で行う。 */
  protected readonly uow: UnitOfWork;
  /** 現在の利用者がブロックした関係を取得する。 */
  protected readonly friendships: FriendshipRepository;
  /** ブロック対象の User を取得して UserSummary に変換する。 */
  protected readonly users: UserRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(FRIENDSHIP_REPOSITORY) friendships: FriendshipRepository,
    @Inject(USER_REPOSITORY) users: UserRepository,
  ) {
    this.uow = uow;
    this.friendships = friendships;
    this.users = users;
  }

  /**
   * ログイン利用者自身がブロックした相手を一覧で返す。相手から自分へのブロックや申請状態の一覧は担当しない。
   * 本体は未実装（todo）。上の「処理」の順に実装する。
   */
  execute(input: ListBlockedUsersInput): Promise<readonly UserSummary[]> {
    return this.uow.run(async (tx) => {
      const blocked = await this.friendships.listBlockedBy(tx, input.userId);

      if (blocked.length === 0) {
        return [];
      }

      const userIds = blocked.map((f) => friendOf(f, input.userId));
      const users = await this.users.findByIds(tx, userIds);

      return users.map((user) => ({
        userId: user.id,
        nickname: user.nickname,
      }));
    });
  }
}
