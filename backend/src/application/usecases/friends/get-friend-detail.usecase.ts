import { Inject, Injectable } from "@nestjs/common";
import { FRIENDSHIP_REPOSITORY } from "../../../application/ports/friendship.repository.ts";
import type { FriendshipRepository } from "../../../application/ports/friendship.repository.ts";
import { TASK_REPOSITORY } from "../../../application/ports/task.repository.ts";
import type { TaskRepository } from "../../../application/ports/task.repository.ts";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { USER_REPOSITORY } from "../../../application/ports/user.repository.ts";
import type { UserRepository } from "../../../application/ports/user.repository.ts";
import { DomainError } from "../../../domain/shared/errors.ts";
import { toTaskView } from "../../../domain/task/task-view.ts";
import type { FriendDetailView, GetFriendDetailInput } from "../../ports/usecases/get-friend-detail.port.ts";

/** accepted なフレンドだけにプロフィールと進行中タスクを返す。 */
@Injectable()
export class GetFriendDetailUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(FRIENDSHIP_REPOSITORY) private readonly friendships: FriendshipRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
  ) {}

  execute(input: GetFriendDetailInput): Promise<FriendDetailView> {
    return this.uow.run(async (tx) => {
      if (!(await this.friendships.areFriends(tx, input.userId, input.friendUserId))) {
        throw new DomainError("NOT_FOUND", "フレンドが見つかりません");
      }

      const friend = await this.users.findById(tx, input.friendUserId);
      if (friend === null) {
        throw new DomainError("NOT_FOUND", "フレンドが見つかりません");
      }

      const page = await this.tasks.listByOwner(tx, {
        owner: input.friendUserId,
        view: "active",
        limit: input.limit,
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      });

      return {
        friend: { userId: friend.id, nickname: friend.nickname },
        tasks: {
          items: page.items.map((task) => toTaskView(task, "friend")),
          nextCursor: page.nextCursor,
        },
      };
    });
  }
}
