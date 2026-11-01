import { Inject, Injectable } from "@nestjs/common";
import { DomainError } from "../../../domain/shared/errors.ts";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { CLOCK } from "../../../application/ports/clock.port.ts";
import type { Clock } from "../../../application/ports/clock.port.ts";
import { POST_REPOSITORY } from "../../../application/ports/feed.repository.ts";
import type { PostRepository } from "../../../application/ports/feed.repository.ts";
import { REACTION_REPOSITORY } from "../../../application/ports/feed.repository.ts";
import type { ReactionRepository } from "../../../application/ports/feed.repository.ts";
import type { SetReactionInput } from "../../ports/usecases/set-reaction.port.ts";

/**
 * 責務: 閲覧可能な投稿への利用者のリアクションを1種類に設定する。投稿の可視性判定は PostRepository に委ね、投稿自体は変更しない。
 *
 * 全体の流れ:
 *   PUT /api/posts/{id}/reaction
 *     → FeedController.react（認証、投稿 ID、body を検証）
 *     → この execute
 *     → PostRepository.findFeedItem で閲覧可否を確認
 *     → ReactionRepository.upsert。成功時は204を返す。
 *
 * 処理:
 *   1. UnitOfWork.run の中で PostRepository.findFeedItem(tx, postId, userId) を呼び、リアクション対象を閲覧できることを確認する。
 *   2. 投稿が見つからない場合は DomainError("NOT_FOUND") を投げ、対象の存在を隠す。
 *   3. Clock.now() を取得し、ReactionRepository.upsert(tx, postId, userId, type, now) を呼ぶ。同じ投稿への再設定は種類の更新となる。
 *
 * 失敗:
 *   - DomainError("NOT_FOUND"): 投稿が存在しない、または本人・フレンドとして閲覧できない。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class SetReactionUseCase {
  /** 投稿の閲覧確認とリアクション更新を同じトランザクションで行う。 */
  protected readonly uow: UnitOfWork;
  /** リアクションの作成・更新時刻を取得する。 */
  protected readonly clock: Clock;
  /** 対象投稿を閲覧者が見られるか確認する。 */
  protected readonly posts: PostRepository;
  /** 利用者のリアクションを作成または選択した種類に更新する。 */
  protected readonly reactions: ReactionRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(CLOCK) clock: Clock,
    @Inject(POST_REPOSITORY) posts: PostRepository,
    @Inject(REACTION_REPOSITORY) reactions: ReactionRepository,
  ) {
    this.uow = uow;
    this.clock = clock;
    this.posts = posts;
    this.reactions = reactions;
  }

  /**
   * 閲覧可能な投稿への利用者のリアクションを1種類に設定する。投稿の可視性判定は PostRepository に委ね、投稿自体は変更しない。
   * 本体は未実装（todo）。上の「処理」の順に実装する。
   */
    execute(input: SetReactionInput): Promise<null> {
    return this.uow.run(async (tx) => {
      const item = await this.posts.findFeedItem(tx, input.postId, input.userId);
      if (item === null) throw new DomainError("NOT_FOUND", "投稿が見つかりません");
      await this.reactions.upsert(tx, input.postId, input.userId, input.type, this.clock.now());
      return null;
    });
  }
}
