import type { Page } from "../../../application/ports/task.repository.ts";
import type { FeedItemView } from "../../../domain/feed/feed-view.ts";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { FEED_PAGE_SIZE } from "../../../domain/feed/post.ts";
import { CurrentUser } from "../auth/current-user.decorator.ts";
import type { UserId } from "../../../domain/shared/ids.ts";
import { GetFeedUseCase } from "../../../application/usecases/feed/get-feed.usecase.ts";
import { GetPostUseCase } from "../../../application/usecases/feed/get-post.usecase.ts";
import { RemoveReactionUseCase } from "../../../application/usecases/feed/remove-reaction.usecase.ts";
import { SetReactionUseCase } from "../../../application/usecases/feed/set-reaction.usecase.ts";
import { todo } from "../../../application/shared/todo.ts"
import { parsePostId } from "../../../domain/shared/id-parsers.ts";
/**
 * 責務: タイムラインと投稿リアクションの HTTP 入出力を受け持つ。入力検証と UseCase 呼び出しまでを行い、閲覧権限や保存処理は担わない。
 *
 * 全体の流れ:
 *   HTTP リクエスト → 全体のガード（Origin、セッション）→ このコントローラ → ユースケース → レスポンス
 *   /api 配下のリクエストを全体の Origin・セッションガードが確認した後に受ける。
 *   各ハンドラは対応する feed use case を呼び、Output を HTTP レスポンスとして返す。
 *
 * 各ハンドラの実装（presentation 層の仕事はここまで）:
 *   1. Zod で、パス・クエリ・ヘッダ・本文を検証する（形式の誤りは ZodError → 400）。
 *   2. parse*Id などで、文字列を名目型に変換する。
 *   3. ユースケースの execute を呼び、戻り値をそのまま返す。
 * 業務のルール（権限、状態の遷移、排他）は、ここに書かない。ユースケースと domain の責務である。
 */
const feedQuerySchema = z.object({
  filter: z.enum(["all", "objected"]).default("all"),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(FEED_PAGE_SIZE),
});

@Controller("")
export class FeedController {
  constructor(
    @Inject(GetFeedUseCase) protected readonly getFeed: GetFeedUseCase,
    @Inject(GetPostUseCase) protected readonly getPost: GetPostUseCase,
    @Inject(RemoveReactionUseCase) protected readonly removeReaction: RemoveReactionUseCase,
    @Inject(SetReactionUseCase) protected readonly setReaction: SetReactionUseCase,
  ) {}

  /**
   * 条件に合うタイムラインの1ページを返す。
   *
   * HTTP: GET /api/feed → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: @CurrentUser() のセッション利用者 ID と query の filter・cursor・limit。
   * 呼び出し先: GetFeedUseCase.execute
   */
    @Get("feed")
  @HttpCode(200)
  feed(@CurrentUser() user: UserId, @Query() query: Record<string, string | undefined>): Promise<Page<FeedItemView>> {
    const { filter, cursor, limit } = feedQuerySchema.parse(query);
    return this.getFeed.execute({
      userId: user,
      filter,
      limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
  }

  /**
   * 本人またはフレンドとして閲覧できる投稿の詳細を返す。
   *
   * HTTP: GET /api/posts/:id → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: @CurrentUser() のセッション利用者 ID と path parameter id。
   * 呼び出し先: GetPostUseCase.execute
   * 主な失敗: NOT_FOUND: 投稿がない、または閲覧できない。
   */
  @Get("posts/:id")
  @HttpCode(200)
    post(@CurrentUser() user: UserId, @Param("id") id: string): Promise<FeedItemView> {
    return this.getPost.execute({ userId: user, postId: parsePostId(id) });
  }

  /**
   * 閲覧できる投稿にリアクションを設定または付け替える。
   *
   * HTTP: PUT /api/posts/:id/reaction → 204
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: @CurrentUser() のセッション利用者 ID、path parameter id、body の type。
   * 呼び出し先: SetReactionUseCase.execute
   * 主な失敗: NOT_FOUND: 投稿がない、または閲覧できない。
   */
  @Put("posts/:id/reaction")
  @HttpCode(204)
  react(@CurrentUser() _user: UserId, @Param("id") _id: string, @Body() _body: unknown): Promise<null> {
    return todo("FeedController.react");
  }

  /**
   * 閲覧できる投稿から自分のリアクションを外す。
   *
   * HTTP: DELETE /api/posts/:id/reaction → 204
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: @CurrentUser() のセッション利用者 ID と path parameter id。
   * 呼び出し先: RemoveReactionUseCase.execute
   * 主な失敗: NOT_FOUND: 投稿がない、または閲覧できない。
   */
  @Delete("posts/:id/reaction")
  @HttpCode(204)
  unreact(@CurrentUser() _user: UserId, @Param("id") _id: string): Promise<null> {
    return todo("FeedController.unreact");
  }
}
