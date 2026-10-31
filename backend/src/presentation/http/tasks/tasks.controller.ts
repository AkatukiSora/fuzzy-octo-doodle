
import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";

import type { TaskView, OwnerTaskView } from "../../../domain/task/task-view.ts";
import type { RetryTemplate } from "../../../application/ports/usecases/get-retry-template.port.ts";
import type { Page } from "../../../application/ports/task.repository.ts";
import { todo } from "../../../application/shared/todo.ts";
import { TASK_STATUSES } from "../../../domain/task/task-status.ts";
import { parseIdempotencyKey } from "../../../domain/shared/idempotency.ts";
import { parseTaskId } from "../../../domain/shared/id-parsers.ts";
import { CurrentUser } from "../auth/current-user.decorator.ts";
import type { UserId } from "../../../domain/shared/ids.ts";
import { CreateTaskUseCase } from "../../../application/usecases/tasks/create-task.usecase.ts";
import { GetRetryTemplateUseCase } from "../../../application/usecases/tasks/get-retry-template.usecase.ts";
import { GetTaskUseCase } from "../../../application/usecases/tasks/get-task.usecase.ts";
import { ListMyTasksUseCase } from "../../../application/usecases/tasks/list-my-tasks.usecase.ts";

/**
 * 責務: /api/tasks のタスク作成・本人一覧・詳細・再挑戦テンプレートについて、
 * HTTP 入力の検証と対応するユースケースの呼び出しを担う。
 * 業務ルールや永続化は担わない。
 */

const DEFAULT_TASK_PAGE_SIZE = 20;

const listQuerySchema = z.object({
  view: z.enum(["active", "history"]).default("active"),
  status: z.enum(TASK_STATUSES).optional(),
  search: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(DEFAULT_TASK_PAGE_SIZE),
});

const createTaskBodySchema = z.object({
  title: z.string(),
  achievementCondition: z.string(),
  evidenceMethod: z.string(),
  deadlineAt: z.iso.datetime(),
  penaltyAmount: z.number(),
  isPenaltyPublic: z.boolean(),
  originalTaskId: z.uuid().nullable(),
});

@Controller("tasks")
export class TasksController {
  constructor(
    @Inject(CreateTaskUseCase)
    protected readonly createTask: CreateTaskUseCase,
    @Inject(GetRetryTemplateUseCase)
    protected readonly getRetryTemplate: GetRetryTemplateUseCase,
    @Inject(GetTaskUseCase)
    protected readonly getTask: GetTaskUseCase,
    @Inject(ListMyTasksUseCase)
    protected readonly listMyTasks: ListMyTasksUseCase,
  ) {}

  /**
   * タスクを作成し、本人向け表示データを返す。
   * HTTP: POST /api/tasks → 201
   */
  @Post("")
  @HttpCode(201)
  create(
    @CurrentUser() user: UserId,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ): Promise<OwnerTaskView> {
    const idempotencyKey = parseIdempotencyKey(z.uuid().parse(key));
    const data = createTaskBodySchema.parse(body);

    const deadlineAt = new Date(data.deadlineAt);
    const originalTaskId =
      data.originalTaskId === null
        ? null
        : parseTaskId(data.originalTaskId);

    return this.createTask.execute({
      userId: user,
      idempotencyKey,
      title: data.title,
      achievementCondition: data.achievementCondition,
      evidenceMethod: data.evidenceMethod,
      deadlineAt,
      penaltyAmount: data.penaltyAmount,
      isPenaltyPublic: data.isPenaltyPublic,
      originalTaskId,
    });
  }

  /**
   * 認証利用者のタスクを条件付きでカーソルページ取得する。
   * HTTP: GET /api/tasks → 200
   */
  @Get("")
  @HttpCode(200)
  list(
    @CurrentUser() user: UserId,
    @Query() query: Record<string, string | undefined>,
  ): Promise<Page<OwnerTaskView>> {
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
   * HTTP: GET /api/tasks/:id/retry-template → 200
   */
  @Get(":id/retry-template")
  @HttpCode(200)
  retryTemplate(
    @CurrentUser() _user: UserId,
    @Param("id") _id: string,
  ): Promise<RetryTemplate> {
    return todo("TasksController.retryTemplate");
  }

  /**
   * 本人またはフレンドとして閲覧できるタスクの詳細を返す。
   * HTTP: GET /api/tasks/:id → 200
   */
  @Get(":id")
  @HttpCode(200)
  get(
    @CurrentUser() _user: UserId,
    @Param("id") _id: string,
  ): Promise<TaskView> {
    return todo("TasksController.get");
  }
}
