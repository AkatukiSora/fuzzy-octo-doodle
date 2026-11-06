import type { FriendTaskView } from "../../../domain/task/task-view.ts";
import type { UserSummary } from "../../../domain/friendship/friend-views.ts";
import type { UserId } from "../../../domain/shared/ids.ts";
import type { Page } from "../task.repository.ts";

/** GET /api/friends/:userId の検証済み application 入力。 */
export interface GetFriendDetailInput {
  userId: UserId;
  friendUserId: UserId;
  cursor?: string;
  limit: number;
}

/** フレンド詳細と、フレンド向けに秘匿済みの進行中タスクページ。 */
export interface FriendDetailView {
  friend: UserSummary;
  tasks: Page<FriendTaskView>;
}
