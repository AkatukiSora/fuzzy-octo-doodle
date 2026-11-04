import { z } from "zod";
import type { IdempotentOperation } from "../../../domain/shared/idempotency.ts";
import type { ResponsePayloads } from "../../../domain/shared/response-payloads.ts";
import { TASK_STATUSES } from "../../../domain/task/task-status.ts";
import { REASON_TYPES } from "../../../domain/objection/objection.ts";
import { CorruptRowError } from "./common.ts";
import { friendshipId, objectionId, taskId, userId } from "./ids.ts";

const TABLE = "idempotency_requests";

/** JSON では Date が ISO 文字列になっている。有効な日時文字列だけを Date に戻す */
const dateString = z.iso.datetime().transform((s) => new Date(s));

const userIdString = z.string().transform(userId);
const taskIdString = z.string().transform(taskId);

const ownerTaskView = z.object({
  id: taskIdString,
  ownerId: userIdString,
  title: z.string(),
  achievementCondition: z.string(),
  evidenceMethod: z.string(),
  deadlineAt: dateString,
  status: z.enum(TASK_STATUSES),
  isPenaltyPublic: z.boolean(),
  createdAt: dateString,
  viewer: z.literal("owner"),
  penaltyAmount: z.number(),
});

const objectionSummary = z.object({
  id: z.string().transform(objectionId),
  taskId: taskIdString,
  round: z.union([z.literal(1), z.literal(2)]),
  reasonType: z.enum(REASON_TYPES),
  reasonDetail: z.string().nullable(),
  withdrawn: z.boolean(),
  createdAt: dateString,
});

const userSummary = z.object({ userId: userIdString, nickname: z.string() });

const friendRequestView = z.object({
  id: z.string().transform(friendshipId),
  requester: userSummary,
  addressee: userSummary,
  requestedAt: dateString,
});

/** 出力が ResponsePayloads の型と合わないと、ここでコンパイルエラーになる */
const responseSchemas: { [O in IdempotentOperation]: z.ZodType<ResponsePayloads[O]> } = {
  create_task: ownerTaskView,
    complete_evidence_upload: ownerTaskView,
  create_objection: objectionSummary,
  withdraw_objection: objectionSummary,
  create_friend_request: friendRequestView,
};

/** 保存済みレスポンスの JSON を、操作ごとの型付き値にする。不正なら CorruptRowError */
export function parseResponseBody<O extends IdempotentOperation>(operation: O, raw: unknown): ResponsePayloads[O] {
  const result = responseSchemas[operation].safeParse(raw);
  if (!result.success) throw new CorruptRowError(TABLE, `response_body が不正です (${operation}): ${result.error.message}`);
  return result.data;
}