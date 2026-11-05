import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { FRIENDSHIP_REPOSITORY } from "../../../application/ports/friendship.repository.ts";
import type { FriendshipRepository } from "../../../application/ports/friendship.repository.ts";
import { USER_REPOSITORY } from "../../../application/ports/user.repository.ts";
import type { UserRepository } from "../../../application/ports/user.repository.ts";
import type { UserSummary } from "../../../domain/friendship/friend-views.ts";
import type { ListFriendsInput } from "../../ports/usecases/list-friends.port.ts";

/**
 * 責務: ログイン利用者の accepted なフレンドを UserSummary の配列で返す。申請中や blocked の関係は一覧に含めない。
 *
 * 全体の流れ:
 *   GET /api/friends
 *     → 全体のセッションガード → FriendsController.list
 *     → この execute → FriendshipRepository.listFriendIds → UserRepository.findByIds → UserSummary[]。
 *
 * 処理:
 *   1. UnitOfWork.run 内で FriendshipRepository.listFriendIds(tx, userId) を呼び、フレンド ID を取得する。
 *   2. ID が空なら空配列を返す。空でなければ UserRepository.findByIds に渡す。
 *   3. 取得したユーザーの userId と nickname を UserSummary に写して返す。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class ListFriendsUseCase {
  /** フレンド ID とプロフィールの読み取りをトランザクション内で行う。 */
  protected readonly uow: UnitOfWork;
  /** 現在の利用者の accepted な相手 ID を取得する。 */
  protected readonly friendships: FriendshipRepository;
  /** 相手 ID 群の User を取得して UserSummary に変換する。 */
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
   * ログイン利用者の accepted なフレンドを UserSummary の配列で返す。申請中や blocked の関係は一覧に含めない。
   */
  async execute(input: ListFriendsInput): Promise<readonly UserSummary[]> {
    return this.uow.run(async (tx) => {
      const ids = await this.friendships.listFriendIds(tx, input.userId);
      if (ids.length === 0) return [];
      const users = await this.users.findByIds(tx, ids);
      return users.map((user) => ({ userId: user.id, nickname: user.nickname }));
    });
  }
}
