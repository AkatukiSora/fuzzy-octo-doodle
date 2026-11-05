import type { Page } from "../../../application/ports/task.repository.ts";
import type { ObjectionSummary } from "../../../domain/objection/objection-view.ts";
import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.ts";
import type { UserId } from "../../../domain/shared/ids.ts";
import { CreateObjectionUseCase } from "../../../application/usecases/objections/create-objection.usecase.ts";
import { ListMyObjectionsUseCase } from "../../../application/usecases/objections/list-my-objections.usecase.ts";
import { WithdrawObjectionUseCase } from "../../../application/usecases/objections/withdraw-objection.usecase.ts";
import { z } from "zod";
import { REASON_TYPES } from "../../../domain/objection/objection.ts";
import { parseIdempotencyKey } from "../../../domain/shared/idempotency.ts";
import { parseObjectionId, parseTaskId } from "../../../domain/shared/id-parsers.ts";

const createObjectionBodySchema = z.object({
  reasonType: z.enum(REASON_TYPES),
  reasonDetail: z.string(),
});

/**
 * 責務: 異議に関する HTTP ルートを受け、セッション利用者・path・header・query・body を検証して対応する use case に渡す。業務上の権限判定や状態遷移は行わない。
 *
 * 全体の流れ:
 *   HTTP リクエスト → 全体のガード（Origin、セッション）→ このコントローラ → ユースケース → レスポンス
 *   API 全体の /api prefix の下にルートを公開する。OriginGuard と SessionAuthGuard が先に適用され、認証済み ID は @CurrentUser() から受け取る。各 handler は application/usecases/objections の use case だけを呼び、DomainError の HTTP 変換は共通例外 filter に委ねる。
 *
 * 各ハンドラの実装（presentation 層の仕事はここまで）:
 *   1. Zod で、パス・クエリ・ヘッダ・本文を検証する（形式の誤りは ZodError → 400）。
 *   2. parse*Id などで、文字列を名目型に変換する。
 *   3. ユースケースの execute を呼び、戻り値をそのまま返す。
 * 業務のルール（権限、状態の遷移、排他）は、ここに書かない。ユースケースと domain の責務である。
 */
const listMyObjectionsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
@Controller("")
export class ObjectionsController {
  constructor(
    @Inject(CreateObjectionUseCase) protected readonly createObjection: CreateObjectionUseCase,
    @Inject(ListMyObjectionsUseCase) protected readonly listMyObjections: ListMyObjectionsUseCase,
    @Inject(WithdrawObjectionUseCase) protected readonly withdrawObjection: WithdrawObjectionUseCase,
  ) {}

  /**
   * 審査中タスクに理由付きの異議を申し立てる。
   *
   * HTTP: POST /api/tasks/:id/objections → 201
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: CurrentUser の userId、Idempotency-Key ヘッダ、path の :id、body の reasonType と reasonDetail。各形式を Zod で検証し、ID を名目型にして use case に渡す。
   * 呼び出し先: CreateObjectionUseCase.execute
   * 主な失敗: NOT_FOUND / VALIDATION_ERROR / FORBIDDEN / IDEMPOTENCY_KEY_REUSED / STATE_CONFLICT / DEADLINE_EXPIRED
   */
  @Post("tasks/:id/objections")
  @HttpCode(201)
  create(@CurrentUser() user: UserId, @Headers("idempotency-key") key: string | undefined, @Param("id") id: string, @Body() body: unknown): Promise<ObjectionSummary> {
    const parsedBody = createObjectionBodySchema.parse(body);
    return this.createObjection.execute({
      userId: user,
      idempotencyKey: parseIdempotencyKey(z.string().parse(key)),
      taskId: parseTaskId(id),
      reasonType: parsedBody.reasonType,
      reasonDetail: parsedBody.reasonDetail,
    });
  }

  /**
   * 自分が申し立てた初回異議を取り下げる。
   *
   * HTTP: POST /api/objections/:objectionId/withdraw → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: CurrentUser の userId、Idempotency-Key ヘッダ、path の :objectionId。ヘッダと ID の形式を検証して use case に渡す。
   * 呼び出し先: WithdrawObjectionUseCase.execute
   * 主な失敗: NOT_FOUND / FORBIDDEN / IDEMPOTENCY_KEY_REUSED / STATE_CONFLICT / DEADLINE_EXPIRED
   */
  @Post("objections/:objectionId/withdraw")
  @HttpCode(200)
  withdraw(@CurrentUser() user: UserId, @Headers("idempotency-key") key: string | undefined, @Param("objectionId") objectionId: string): Promise<ObjectionSummary> {
    return this.withdrawObjection.execute({
      userId: user,
      idempotencyKey: parseIdempotencyKey(z.string().parse(key)),
      objectionId: parseObjectionId(objectionId),
    });
  }

  /**
   * 自分が申し立てた異議をカーソルページで返す。
   *
   * HTTP: GET /api/me/objections → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: CurrentUser の userId、query の cursor（省略可）と limit（整数・許容範囲を検証）。
   * 呼び出し先: ListMyObjectionsUseCase.execute
   */
  @Get("me/objections")
  @HttpCode(200)
  listMine(
    @CurrentUser() user: UserId,
    @Query() query: Record<string, string | undefined>,
  ): Promise<Page<ObjectionSummary>> {
    const { cursor, limit } =
      listMyObjectionsQuerySchema.parse(query);

    return this.listMyObjections.execute({
      userId: user,
      limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
  }
}
