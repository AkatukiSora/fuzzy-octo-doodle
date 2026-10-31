import { Inject, Injectable } from "@nestjs/common";
import { DomainError } from "../../../domain/shared/errors.ts";
import { toTaskView } from "../../../domain/task/task-view.ts";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { POST_REPOSITORY } from "../../../application/ports/feed.repository.ts";
import type { PostRepository } from "../../../application/ports/feed.repository.ts";
import { TASK_REPOSITORY } from "../../../application/ports/task.repository.ts";
import type { TaskRepository } from "../../../application/ports/task.repository.ts";
import { USER_REPOSITORY } from "../../../application/ports/user.repository.ts";
import type { UserRepository } from "../../../application/ports/user.repository.ts";
import type { FeedItemView } from "../../../domain/feed/feed-view.ts";
import type { GetPostInput } from "../../ports/usecases/get-post.port.ts";

/**
 * 責務: 指定された投稿が閲覧者本人またはフレンドの投稿であることを確認し、表示用データを返す。投稿の更新は担わない。
 *
 * 全体の流れ:
 *   GET /api/posts/{id}
 *     → FeedController.post（セッション利用者と path parameter を検証）
 *     → この execute
 *     → PostRepository.findFeedItem（閲覧範囲を確認）
 *     → TaskRepository / UserRepository で表示データを補い、FeedItemView を返す。
 *
 * 処理:
 *   1. UnitOfWork.run の中で PostRepository.findFeedItem(tx, postId, userId) を呼び、本人またはフレンドとして見られる投稿だけを取得する。
 *   2. 結果が null なら DomainError("NOT_FOUND") を投げ、閲覧権限のない投稿の存在を知らせない。
 *   3. FeedItem.taskId で TaskRepository.findById を呼び、投稿者 ID で UserRepository.findByIds を呼ぶ。
 *   4. 投稿、投稿者、リアクション集計を FeedItemView にまとめ、task は toTaskView(task, "friend") で返す。
 *
 * 失敗:
 *   - DomainError("NOT_FOUND"): 投稿が存在しない、または本人・フレンドとして閲覧できない。
 *
 * 注意:
 *   - toTaskView(task, "friend") を使い、非公開のペナルティ金額をレスポンスに含めない。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class GetPostUseCase {
  /** 投稿・タスク・投稿者の読み取りを1つのトランザクションにまとめる。 */
  protected readonly uow: UnitOfWork;
  /** 投稿 ID と閲覧者 ID を照合し、閲覧可能な投稿情報を取得する。 */
  protected readonly posts: PostRepository;
  /** 投稿に関連するタスクを取得する。 */
  protected readonly tasks: TaskRepository;
  /** 投稿者の利用者情報を取得する。 */
  protected readonly users: UserRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(POST_REPOSITORY) posts: PostRepository,
    @Inject(TASK_REPOSITORY) tasks: TaskRepository,
    @Inject(USER_REPOSITORY) users: UserRepository,
  ) {
    this.uow = uow;
    this.posts = posts;
    this.tasks = tasks;
    this.users = users;
  }

  /**
   * 指定された投稿が閲覧者本人またはフレンドの投稿であることを確認し、表示用データを返す。投稿の更新は担わない。
   * 本体は未実装（todo）。上の「処理」の順に実装する。
   */
    execute(input: GetPostInput): Promise<FeedItemView> {
    return this.uow.run(async (tx) => {
      const item = await this.posts.findFeedItem(tx, input.postId, input.userId);
      // 閲覧権限のない投稿の存在を知らせないため、「ない」と「見られない」を同じ NOT_FOUND にする。
      if (item === null) throw new DomainError("NOT_FOUND", "投稿が見つかりません");

      const task = await this.tasks.findById(tx, item.taskId);
      const [author] = await this.users.findByIds(tx, [item.post.userId]);
      if (task === null || author === undefined) {
        throw new DomainError("NOT_FOUND", "投稿の関連データが見つかりません");
      }

      return {
        postId: item.post.id,
        postType: item.post.postType,
        postedAt: item.post.createdAt,
        author: { userId: author.id, nickname: author.nickname },
        task: toTaskView(task, "friend"),
        reactionCounts: item.reactionCounts,
        myReaction: item.myReaction,
      };
    });
  }
}
