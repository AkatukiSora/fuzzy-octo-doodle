import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator.ts";
import type { UserId } from "../../../domain/shared/ids.ts";
import { parseUserId } from "../../../domain/shared/id-parsers.ts";
import { parseIdempotencyKey } from "../../../domain/shared/idempotency.ts";
import { USER_REPORT_REASONS } from "../../../domain/friendship/user-report.ts";
import { GetFriendActivityUseCase } from "../../../application/usecases/friends/get-friend-activity.usecase.ts";
import { ReportUserUseCase } from "../../../application/usecases/friends/report-user.usecase.ts";

const querySchema = z.object({ sort: z.enum(["soonest", "latest"]).default("soonest"), limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().min(1).optional() });
const reportSchema = z.object({ reason: z.enum(USER_REPORT_REASONS), detail: z.string().max(1000).default("") });

/** 既存のフレンド詳細APIを保持したまま、統計・期限切れ一覧と通報を追加する。 */
@Controller("friends/:userId")
export class FriendActivityController {
  constructor(
    @Inject(GetFriendActivityUseCase) private readonly activity: GetFriendActivityUseCase,
    @Inject(ReportUserUseCase) private readonly report: ReportUserUseCase,
  ) {}

  @Get("activity")
  activityFor(@CurrentUser() userId: UserId, @Param("userId") rawId: string, @Query() query: unknown) {
    const parsed = querySchema.parse(query);
    return this.activity.execute({ userId, friendUserId: parseUserId(rawId), sort: parsed.sort, limit: parsed.limit,
      ...(parsed.cursor === undefined ? {} : { cursor: parsed.cursor }),
    });
  }

  @Post("report")
  @HttpCode(201)
  reportUser(@CurrentUser() userId: UserId, @Param("userId") rawId: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    return this.report.execute({ userId, targetUserId: parseUserId(rawId), idempotencyKey: parseIdempotencyKey(z.string().parse(key)), ...reportSchema.parse(body) });
  }
}
