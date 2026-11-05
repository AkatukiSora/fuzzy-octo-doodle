import { Inject, Injectable } from "@nestjs/common";
import { DomainError } from "../../../domain/shared/errors.ts";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { FRIEND_INVITE_REPOSITORY } from "../../../application/ports/friendship.repository.ts";
import type { FriendInviteRepository } from "../../../application/ports/friendship.repository.ts";
import { USER_REPOSITORY } from "../../../application/ports/user.repository.ts";
import type { UserRepository } from "../../../application/ports/user.repository.ts";
import type { UserSummary } from "../../../domain/friendship/friend-views.ts";
import type { GetFriendInviteInput } from "../../ports/usecases/get-friend-invite.port.ts";

/**
 * 責務: 公開招待リンクから招待者のニックネームだけを返す。認証やフレンド申請の作成は担当しない。
 *
 * 全体の流れ:
 *   GET /api/friend-invites/:token（@Public）
 *     → 全体のガードは認証を要求せず、Origin・セッションガードの規則に従う → FriendsController.getInvite
 *     → この execute → FriendInviteRepository.findActiveByToken → UserRepository.findById → UserSummary。
 *
 * 処理:
 *   1. UnitOfWork.run 内で FriendInviteRepository.findActiveByToken を呼ぶ。該当する有効招待がなければ NOT_FOUND とする。
 *   2. 招待の inviterId を UserRepository.findById に渡し、招待者を取得する。ユーザーが存在しなければ NOT_FOUND とする。
 *   3. User の ID とニックネームだけを UserSummary にして返す。ここでは申請や承認を作らず、リンク閲覧の権限をプロフィール参照に限定する。
 *
 * 失敗:
 *   - DomainError("NOT_FOUND"): 有効な招待 token または招待者が見つからない。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class GetFriendInviteUseCase {
  /** 公開プロフィールを読む招待参照をトランザクション内で行う。 */
  protected readonly uow: UnitOfWork;
  /** token に一致する有効な招待を取得する。 */
  protected readonly invites: FriendInviteRepository;
  /** 招待者の User を取得して UserSummary に変換する。 */
  protected readonly users: UserRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(FRIEND_INVITE_REPOSITORY) invites: FriendInviteRepository,
    @Inject(USER_REPOSITORY) users: UserRepository,
  ) {
    this.uow = uow;
    this.invites = invites;
    this.users = users;
  }

  /**
   * 公開招待リンクから招待者のニックネームだけを返す。認証やフレンド申請の作成は担当しない。
   * 有効な招待と招待者をトランザクション内で読み、公開用の UserSummary を返す。
   */
  execute(input: GetFriendInviteInput): Promise<UserSummary> {
    return this.uow.run(async (tx) => {
      const invite = await this.invites.findActiveByToken(tx, input.token);
      if (invite === null) {
        throw new DomainError("NOT_FOUND", "有効な招待が見つかりません");
      }

      const inviter = await this.users.findById(tx, invite.inviterId);
      if (inviter === null) {
        throw new DomainError("NOT_FOUND", "招待者が見つかりません");
      }

      return { userId: inviter.id, nickname: inviter.nickname };
    });
  }
}
