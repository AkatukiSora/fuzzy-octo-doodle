import { Inject, Injectable } from "@nestjs/common";
import { DomainError } from "../../../domain/shared/errors.ts";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { POST_REPOSITORY } from "../../../application/ports/feed.repository.ts";
import type { PostRepository } from "../../../application/ports/feed.repository.ts";
import { REACTION_REPOSITORY } from "../../../application/ports/feed.repository.ts";
import type { ReactionRepository } from "../../../application/ports/feed.repository.ts";
import type { RemoveReactionInput } from "../../ports/usecases/remove-reaction.port.ts";

/**
 * 責務: 閲覧可能な投稿から、実行利用者自身のリアクションを削除する。投稿や他の利用者のリアクションは変更しない。
 *
 * 全体の流れ:
 *   DELETE /api/posts/{id}/reaction
 *     → FeedController.unreact（認証と投稿 ID を検証）
 *     → この execute
 *     → PostRepository.findFeedItem で閲覧可否を確認
 *     → ReactionRepository.remove。成功時は204を返す。
 *
 * 処理:
 *   1. UnitOfWork.run の中で PostRepository.findFeedItem(tx, postId, userId) を呼び、投稿を閲覧できることを確認する。
 *   2. 投稿が見つからない場合は DomainError("NOT_FOUND") を投げ、対象の存在を隠す。
 *   3. ReactionRepository.remove(tx, postId, userId) を呼ぶ。該当リアクションがすでになくても削除結果は同じである。
 *
 * 失敗:
 *   - DomainError("NOT_FOUND"): 投稿が存在しない、または本人・フレンドとして閲覧できない。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class RemoveReactionUseCase {
  /** 投稿の閲覧確認とリアクション削除を同じトランザクションで行う。 */
  protected readonly uow: UnitOfWork;
  /** 対象投稿を閲覧者が見られるか確認する。 */
  protected readonly posts: PostRepository;
  /** 指定利用者の投稿リアクションを削除する。 */
  protected readonly reactions: ReactionRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(POST_REPOSITORY) posts: PostRepository,
    @Inject(REACTION_REPOSITORY) reactions: ReactionRepository,
  ) {
    this.uow = uow;
    this.posts = posts;
    this.reactions = reactions;
  }

  /**
   * 閲覧可能な投稿から、実行利用者自身のリアクションを削除する。投稿や他の利用者のリアクションは変更しない。
   * 本体は未実装（todo）。上の「処理」の順に実装する。
   */
    execute(input: RemoveReactionInput): Promise<null> {
    return this.uow.run(async (tx) => {
      const item = await this.posts.findFeedItem(tx, input.postId, input.userId);
      if (item === null) throw new DomainError("NOT_FOUND", "投稿が見つかりません");
      await this.reactions.remove(tx, input.postId, input.userId);
      return null;
    });
  }
}
