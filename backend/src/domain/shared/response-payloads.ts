import type { IdempotentOperation } from "./idempotency.ts";
import type { OwnerTaskView } from "../task/task-view.ts";
import type { ObjectionSummary } from "../objection/objection-view.ts";
import type { FriendRequestView } from "../friendship/friend-views.ts";

/** 冪等性の対象の操作ごとに、保存して再送時に返すレスポンスの型。RequestPayloads のレスポンス版 */
export interface ResponsePayloads extends Record<IdempotentOperation, unknown> {
  create_task: OwnerTaskView;
  complete_evidence_upload: OwnerTaskView;
  create_objection: ObjectionSummary;
  withdraw_objection: ObjectionSummary;
  create_friend_request: FriendRequestView;
}
