import type { TaskView } from "../../../domain/task/task-view.ts";
import type { RetryTemplate } from "../../../application/ports/usecases/get-retry-template.port.ts";
import type { Page } from "../../../application/ports/task.repository.ts";
import type { OwnerTaskView } from "../../../domain/task/task-view.ts";
import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { todo } from "../../../application/shared/todo.ts";
import { z } from "zod";
import { TASK_STATUSES } from "../../../domain/task/task-status.ts";
import { CurrentUser } from "../auth/current-user.decorator.ts";
import type { UserId } from "../../../domain/shared/ids.ts";
import { CreateTaskUseCase } from "../../../application/usecases/tasks/create-task.usecase.ts";
import { GetRetryTemplateUseCase } from "../../../application/usecases/tasks/get-retry-template.usecase.ts";
import { GetTaskUseCase } from "../../../application/usecases/tasks/get-task.usecase.ts";
import { ListMyTasksUseCase } from "../../../application/usecases/tasks/list-my-tasks.usecase.ts";
import { parseTaskId } from "../../../domain/shared/id-parsers.ts";

/**
 * 責務: /api/tasks のタスク作成・本人一覧・詳細・再挑戦テンプレートについて、HTTP 入力の検証と対応するユースケースの呼び出しを担う。業務ルールや永続化は担わない。
 *
 * 全体の流れ:
 *   HTTP リクエスト → 全体のガード（Origin、セッション）→ このコントローラ → ユースケース → レスポンス
 *   AppModule から読み込まれる TasksModule の presentation 層に置く。
 *   認証ガードがセッションを確認し、@CurrentUser() が利用者 ID を渡す。
 *   各ハンドラが Zod で path / query / header / body を検証し、対応する use case の execute を呼ぶ。
 *   タスク状態・権限・保存は application / domain / ports の側で決める。
 *
 * 各ハンドラの実装（presentation 層の仕事はここまで）:
 *   1. Zod で、パス・クエリ・ヘッダ・本文を検証する（形式の誤りは ZodError → 400）。
 *   2. parse*Id などで、文字列を名目型に変換する。
 *   3. ユースケースの execute を呼び、戻り値をそのまま返す。
 * 業務のルール（権限、状態の遷移、排他）は、ここに書かない。ユースケースと domain の責務である。
 */

const DEFAULT_TASK_PAGE_SIZE = 20;

const listQuerySchema = z.object({
  view: z.enum(["active", "history"]).default("active"),
  status: z.enum(TASK_STATUSES).optional(),
  search: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(DEFAULT_TASK_PAGE_SIZE),
});

@Controller("tasks")
export class TasksController {
  constructor(
    @Inject(CreateTaskUseCase) protected readonly createTask: CreateTaskUseCase,
    @Inject(GetRetryTemplateUseCase) protected readonly getRetryTemplate: GetRetryTemplateUseCase,
    @Inject(GetTaskUseCase) protected readonly getTask: GetTaskUseCase,
    @Inject(ListMyTasksUseCase) protected readonly listMyTasks: ListMyTasksUseCase,
  ) {}

  /**
   * タスクを作成し、本人向け表示データを返す。
   *
   * HTTP: POST /api/tasks → 201
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: 利用元: @CurrentUser() の認証利用者 ID、Idempotency-Key ヘッダ、JSON body の title・achievementCondition・evidenceMethod・deadlineAt・penaltyAmount・isPenaltyPublic・originalTaskId。
   * 呼び出し先: CreateTaskUseCase.execute
   * 主な失敗: VALIDATION_ERROR、IDEMPOTENCY_KEY_REUSED、PAYMENT_REQUIRED、TOO_MANY_ACTIVE_TASKS
   */
  @Post("")
  @HttpCode(201)
  create(@CurrentUser() _user: UserId, @Headers("idempotency-key") _key: string | undefined, @Body() _body: unknown): Promise<OwnerTaskView> {
    return todo("TasksController.create");
  }

  /**
   * 認証利用者のタスクを条件付きでカーソルページ取得する。
   *
   * HTTP: GET /api/tasks → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: 利用元: @CurrentUser() の認証利用者 ID、query の view・status・search・cursor・limit。未指定の任意条件は Input に含めない。
   * 呼び出し先: ListMyTasksUseCase.execute
   */
  @Get("")
  @HttpCode(200)
    list(@CurrentUser() user: UserId, @Query() query: Record<string, string | undefined>): Promise<Page<OwnerTaskView>> {
    const { view, status, search, cursor, limit } = listQuerySchema.parse(query);
    return this.listMyTasks.execute({
      userId: user,
      view,
      limit,
      ...(status === undefined ? {} : { status }),
      ...(search === undefined ? {} : { search }),
      ...(cursor === undefined ? {} : { cursor }),
    });
  }

  /**
   * 本人が所有するタスクから再挑戦フォームの初期値を返す。
   *
   * HTTP: GET /api/tasks/:id/retry-template → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: 利用元: @CurrentUser() の認証利用者 ID、path の :id（元タスク ID）。
   * 呼び出し先: GetRetryTemplateUseCase.execute
   * 主な失敗: NOT_FOUND
   */
  @Get(":id/retry-template")
  @HttpCode(200)
  retryTemplate(@CurrentUser() _user: UserId, @Param("id") _id: string): Promise<RetryTemplate> {
    return todo("TasksController.retryTemplate");
  }

  /**
   * 本人またはフレンドとして閲覧できるタスクの詳細を返す。
   *
   * HTTP: GET /api/tasks/:id → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: 利用元: @CurrentUser() の閲覧者 ID、path の :id（タスク ID）。
   * 呼び出し先: GetTaskUseCase.execute
   * 主な失敗: NOT_FOUND
   */
  @Get(":id")
  @HttpCode(200)
  get(
    @CurrentUser() user: UserId,
    @Param("id") id: string,
  ): Promise<TaskView> {
    return this.getTask.execute({
      viewerId: user,
      taskId: parseTaskId(id),
    });
  }
}
