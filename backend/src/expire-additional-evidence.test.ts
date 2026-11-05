import assert from "node:assert/strict";
import { test } from "node:test";
import type { Clock } from "./application/ports/clock.port.ts";
import type { PostRepository } from "./application/ports/feed.repository.ts";
import type { IdGenerator } from "./application/ports/id-generator.port.ts";
import type { TaskRepository } from "./application/ports/task.repository.ts";
import type { UploadSessionRepository } from "./application/ports/evidence.repository.ts";
import type { UnitOfWork, Tx } from "./application/ports/unit-of-work.port.ts";
import { ExpireAdditionalEvidenceUseCase } from "./application/usecases/jobs/expire-additional-evidence.usecase.ts";
import { authorizeTaskCreation, parseTaskDeadline } from "./domain/task/task-policy.ts";
import {
  acceptFirstObjection,
  createTask,
  submitInitialEvidence,
} from "./domain/task/task.ts";
import type { DisputedTask, Task } from "./domain/task/task.ts";
import { parseTaskId, parseUserId } from "./domain/shared/id-parsers.ts";
import type { TaskEvent } from "./domain/task/task-events.ts";
import { TaskEventPublisher } from "./application/shared/task-event-publisher.ts";

const jobNow = new Date("2026-02-01T00:00:00.000Z");
const expiredCreatedAt = new Date(jobNow.getTime() - 25 * 60 * 60 * 1000);
const notExpiredCreatedAt = new Date(jobNow.getTime() - 23 * 60 * 60 * 1000);
const ownerId = parseUserId("11111111-1111-4111-8111-111111111111");

// Tx is opaque and unused by these fakes.
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;

function makeDisputedTask(id: string, createdAt: Date): DisputedTask {
  const active = createTask(
    {
      id: parseTaskId(id),
      ownerId,
      originalTaskId: null,
      title: "追加証拠の期限確認",
      achievementCondition: "条件を達成する",
      evidenceMethod: "写真を提出する",
      deadlineAt: parseTaskDeadline(new Date(createdAt.getTime() + 60 * 60 * 1000), createdAt),
      penaltyAmount: 100,
      isPenaltyPublic: false,
      permit: authorizeTaskCreation(0),
    },
    createdAt,
  ).next;
  const submission = submitInitialEvidence(active, 1, createdAt);
  if (submission.next.status !== "reviewing") {
    throw new Error("フレンドがいるタスクは審査中になる必要があります");
  }
  return acceptFirstObjection(submission.next, createdAt).next;
}

function makeActiveTask(id: string, createdAt: Date): Task {
  return createTask(
    {
      id: parseTaskId(id),
      ownerId,
      originalTaskId: null,
      title: "追加証拠の期限確認",
      achievementCondition: "条件を達成する",
      evidenceMethod: "写真を提出する",
      deadlineAt: parseTaskDeadline(new Date(createdAt.getTime() + 60 * 60 * 1000), createdAt),
      penaltyAmount: 100,
      isPenaltyPublic: false,
      permit: authorizeTaskCreation(0),
    },
    createdAt,
  ).next;
}

class RecordingTaskEventPublisher extends TaskEventPublisher {
  readonly published: TaskEvent[][] = [];

  constructor(clock: Clock) {
    const posts: PostRepository = {
      insertIfAbsent: () => Promise.resolve(),
      findById: () => Promise.resolve(null),
      listFeed: () => Promise.resolve({ items: [], nextCursor: null }),
      findFeedItem: () => Promise.resolve(null),
      hasPost: () => Promise.resolve(false),
    };
    const ids: IdGenerator = {
      uuid: () => "22222222-2222-4222-8222-222222222222",
      inviteToken: () => "unused",
    };
    super(posts, ids, clock);
  }

  override publish(_tx: Tx, events: readonly TaskEvent[]): Promise<void> {
    this.published.push([...events]);
    return Promise.resolve();
  }
}

function makeUseCase(
  candidates: DisputedTask[],
  currentTasks: ReadonlyMap<string, Task> = new Map(),
  liveSessionIds: ReadonlySet<string> = new Set(),
  failedSessionIds: ReadonlySet<string> = new Set(),
) {
  let transactionCount = 0;
  let lockLimit = 0;
  const saved: Task[] = [];
  const sessionChecks: string[] = [];
  const tasks: TaskRepository = {
    insert: () => Promise.resolve(),
    findById: () => Promise.resolve(null),
    findByIds: () => Promise.resolve([]),
    findByIdForUpdate: (_tx, id) =>
      Promise.resolve(currentTasks.get(id) ?? candidates.find((candidate) => candidate.id === id) ?? null),
    save: (_tx, task) => {
      saved.push(task);
      return Promise.resolve();
    },
    countActiveInitial: () => Promise.resolve(0),
    lockUserForCreation: () => Promise.resolve(),
    listByOwner: () => Promise.resolve({ items: [], nextCursor: null }),
    lockExpiredInitial: () => Promise.resolve([]),
    lockReviewEnded: () => Promise.resolve([]),
    lockExpiredAdditional: (_tx, _now, limit) => {
      lockLimit = limit;
      return Promise.resolve(candidates.slice(0, limit));
    },
  };
  const uploadSessions: UploadSessionRepository = {
    insert: () => Promise.resolve(),
    findByIdForUpdate: () => Promise.resolve(null),
    save: () => Promise.resolve(),
    hasLiveSession: (_tx, taskId) => {
      sessionChecks.push(taskId);
      if (failedSessionIds.has(taskId)) return Promise.reject(new Error("session lookup failed"));
      return Promise.resolve(liveSessionIds.has(taskId));
    },
    expireStale: () => Promise.resolve(0),
  };
  const clock: Clock = { now: () => jobNow };
  const uow: UnitOfWork = {
    run: (operation) => {
      transactionCount += 1;
      return operation(tx);
    },
  };
  const events = new RecordingTaskEventPublisher(clock);
  const useCase = new ExpireAdditionalEvidenceUseCase(
    uow,
    clock,
    tasks,
    uploadSessions,
    events,
  );
  return {
    useCase,
    saved,
    events,
    sessionChecks,
    transactionCount: () => transactionCount,
    lockLimit: () => lockLimit,
  };
}

test("期限切れで有効な追加アップロードがないタスクだけを判定不能にする", async () => {
  const expired = makeDisputedTask("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expiredCreatedAt);
  const live = makeDisputedTask("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", expiredCreatedAt);
  const notExpired = makeDisputedTask("cccccccc-cccc-4ccc-8ccc-cccccccccccc", notExpiredCreatedAt);
  const staleCandidate = makeDisputedTask("dddddddd-dddd-4ddd-8ddd-dddddddddddd", expiredCreatedAt);
  const changedStatus = makeActiveTask(staleCandidate.id, expiredCreatedAt);
  const currentTasks = new Map<string, Task>([[staleCandidate.id, changedStatus]]);
  const fakes = makeUseCase(
    [expired, live, notExpired, staleCandidate],
    currentTasks,
    new Set([live.id]),
  );

  const result = await fakes.useCase.execute({ batchSize: 4 });

  assert.deepEqual(result, { processed: 1 });
  assert.equal(fakes.lockLimit(), 4);
  assert.equal(fakes.transactionCount(), 5);
  assert.deepEqual(fakes.sessionChecks, [expired.id, live.id, notExpired.id]);
  assert.deepEqual(fakes.saved.map((task) => [task.id, task.status]), [
    [expired.id, "indeterminate"],
  ]);
  assert.deepEqual(fakes.events.published, [[{
    type: "TaskFinalized",
    taskId: expired.id,
    ownerId: expired.ownerId,
    result: "indeterminate",
  }]]);
});

test("1件のセッション確認が失敗しても別トランザクションで次のタスクを処理する", async () => {
  const failed = makeDisputedTask("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", expiredCreatedAt);
  const succeeds = makeDisputedTask("ffffffff-ffff-4fff-8fff-ffffffffffff", expiredCreatedAt);
  const fakes = makeUseCase(
    [failed, succeeds],
    new Map(),
    new Set(),
    new Set([failed.id]),
  );
  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...values: unknown[]) => {
    errors.push(values);
  };

  let result;
  try {
    result = await fakes.useCase.execute({ batchSize: 2 });
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(result, { processed: 1 });
  assert.equal(fakes.transactionCount(), 3);
  assert.deepEqual(fakes.saved.map((task) => task.id), [succeeds.id]);
  assert.equal(errors.length, 1);
  assert.deepEqual(JSON.parse(String(errors[0]?.[0])), {
    msg: "expire-additional-evidence: task failed",
    taskId: failed.id,
    error: "Error: session lookup failed",
  });
});
