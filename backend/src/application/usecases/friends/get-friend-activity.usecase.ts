import { Inject, Injectable } from "@nestjs/common";
import { FRIEND_ACTIVITY_REPOSITORY } from "../../ports/friend-activity.repository.ts";
import type { FriendActivityRepository } from "../../ports/friend-activity.repository.ts";
import { FRIENDSHIP_REPOSITORY } from "../../ports/friendship.repository.ts";
import type { FriendshipRepository } from "../../ports/friendship.repository.ts";
import { UNIT_OF_WORK } from "../../ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../ports/unit-of-work.port.ts";
import { USER_REPOSITORY } from "../../ports/user.repository.ts";
import type { UserRepository } from "../../ports/user.repository.ts";
import { CLOCK } from "../../ports/clock.port.ts";
import type { Clock } from "../../ports/clock.port.ts";
import { DomainError } from "../../../domain/shared/errors.ts";
import { successRate } from "../../../domain/user/user.ts";
import { toTaskView } from "../../../domain/task/task-view.ts";
import type { FriendActivityView, GetFriendActivityInput } from "../../ports/usecases/get-friend-activity.port.ts";

/** 既存の詳細APIを変更せず、成立済みフレンドにだけ統計と期限順のタスクを返す。 */
@Injectable()
export class GetFriendActivityUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(FRIENDSHIP_REPOSITORY) private readonly friendships: FriendshipRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(FRIEND_ACTIVITY_REPOSITORY) private readonly activity: FriendActivityRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(input: GetFriendActivityInput): Promise<FriendActivityView> {
    return this.uow.run(async tx => {
      if (!(await this.friendships.areFriends(tx, input.userId, input.friendUserId))) {
        throw new DomainError("NOT_FOUND", "フレンドが見つかりません");
      }
      const user = await this.users.findById(tx, input.friendUserId);
      if (user === null) throw new DomainError("NOT_FOUND", "フレンドが見つかりません");
      const now = this.clock.now();
      const counts = await this.activity.counts(tx, input.friendUserId, now);
      const page = await this.activity.list(tx, {
        owner: input.friendUserId, sort: input.sort, limit: input.limit, now,
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      });
      return {
        friend: { userId: user.id, nickname: user.nickname },
        stats: { ...counts, successRate: successRate(counts) },
        tasks: {
          nextCursor: page.nextCursor,
          items: page.items.map(task => ({
            ...toTaskView(task, "friend"),
            dueAt: task.status === "reviewing" ? task.reviewDeadlineAt
              : task.status === "disputed" ? task.additionalEvidenceDeadlineAt : task.deadlineAt,
          })),
        },
      };
    });
  }
}
