
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Clock } from "./application/ports/clock.port.ts";
import type { TaskRepository } from "./application/ports/task.repository.ts";
import type { UploadSessionRepository } from "./application/ports/evidence.repository.ts";
import type { UnitOfWork, Tx } from "./application/ports/unit-of-work.port.ts";
import { IssueUploadUrlsUseCase } from "./application/usecases/evidence/issue-upload-urls.usecase.ts";
import { DomainError } from "./domain/shared/errors.ts";
import {
  parseTaskId,
  parseUploadSessionId,
  parseUserId,
} from "./domain/shared/id-parsers.ts";
import type { UploadSession } from "./domain/evidence/upload-session.ts";
import type { Task } from "./domain/task/task.ts";
import {
  parseNonEmptyText,
  parsePenaltyAmount,
  parseTaskTitle,
} from "./domain/task/task-values.ts";
import { MockObjectStorage } from "./infrastructure/storage/mock-object-storage.ts";

const userId = parseUserId("11111111-1111-4111-8111-111111111111");
const otherUserId = parseUserId("44444444-4444-4444-8444-444444444444");
const taskId = parseTaskId("22222222-2222-4222-8222-222222222222");
const otherTaskId = parseTaskId("55555555-5555-4555-8555-555555555555");
const sessionId = parseUploadSessionId("33333333-3333-4333-8333-333333333333");
const now = new Date("2026-10-31T12:00:00Z");

// Tx はテスト内で参照しないため、ダミーを使用する。
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;

const uow: UnitOfWork = { run: (fn) => fn(tx) };
const clock: Clock = { now: () => now };

const task: Task = {
  id: taskId,
  ownerId: userId,
  originalTaskId: null,
  title: parseTaskTitle("テストタスク"),
  achievementCondition: parseNonEmptyText("完了する", "達成条件"),
  evidenceMethod: parseNonEmptyText("写真を提出する", "証拠提出方法"),
  deadlineAt: new Date("2026-11-01T12:00:00Z"),
  penaltyAmount: parsePenaltyAmount(100),
  isPenaltyPublic: true,
  createdAt: now,
  updatedAt: now,
  status: "active",
  reviewRound: 0,
};

const session: UploadSession = {
  id: sessionId,
  taskId,
  userId,
  submissionType: "initial",
  startedAt: now,
  uploadExpiresAt: new Date("2026-10-31T12:05:00Z"),
  status: "uploading",
};

class FakeTasks implements TaskRepository {
  constructor(private readonly task: Task | null) {}

  findByIdForUpdate(): Promise<Task | null> {
    return Promise.resolve(this.task);
  }

  insert(): never { throw new Error("使わない"); }
  findById(): never { throw new Error("使わない"); }
  findByIds(): never { throw new Error("使わない"); }
  save(): never { throw new Error("使わない"); }
  countActiveInitial(): never { throw new Error("使わない"); }
  lockUserForCreation(): never { throw new Error("使わない"); }
  listByOwner(): never { throw new Error("使わない"); }
  lockExpiredInitial(): never { throw new Error("使わない"); }
  lockReviewEnded(): never { throw new Error("使わない"); }
  lockExpiredAdditional(): never { throw new Error("使わない"); }
}

class FakeSessions implements UploadSessionRepository {
  constructor(private readonly session: UploadSession | null) {}

  findByIdForUpdate(): Promise<UploadSession | null> {
    return Promise.resolve(this.session);
  }

  insert(): never { throw new Error("使わない"); }
  save(): never { throw new Error("使わない"); }
  hasLiveSession(): never { throw new Error("使わない"); }
  expireStale(): never { throw new Error("使わない"); }
}

function setup(
  currentTask: Task | null = task,
  currentSession: UploadSession | null = session,
): IssueUploadUrlsUseCase {
  return new IssueUploadUrlsUseCase(
    uow,
    clock,
    new FakeTasks(currentTask),
    new FakeSessions(currentSession),
    new MockObjectStorage(),
  );
}

function execute(
  useCase: IssueUploadUrlsUseCase,
  currentUserId = userId,
) {
  return useCase.execute({
    userId: currentUserId,
    taskId,
    sessionId,
    photos: [{ slot: 1, extension: "jpg" }],
  });
}

async function expectError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, code);
    return true;
  });
}
test("有効なセッションなら写真の署名URLを発行する", async () => {
  const result = await execute(setup());

  assert.equal(result.uploads.length, 1);

  const upload = result.uploads[0];
  assert.ok(upload);

  assert.equal(
    upload.path,
    `evidence/${taskId}/${sessionId}/1.jpg`,
  );
  assert.match(upload.uploadUrl, /expires=300/);
});

test("タスクが存在しなければ NOT_FOUND", async () => {
  await expectError(execute(setup(null)), "NOT_FOUND");
});

test("セッションが存在しなければ NOT_FOUND", async () => {
  await expectError(execute(setup(task, null)), "NOT_FOUND");
});

test("他人のタスクなら FORBIDDEN", async () => {
  await expectError(
    execute(setup({ ...task, ownerId: otherUserId })),
    "FORBIDDEN",
  );
});

test("他人のセッションなら FORBIDDEN", async () => {
  await expectError(
    execute(setup(task, { ...session, userId: otherUserId })),
    "FORBIDDEN",
  );
});

test("別タスクのセッションなら NOT_FOUND", async () => {
  await expectError(
    execute(setup(task, { ...session, taskId: otherTaskId })),
    "NOT_FOUND",
  );
});

test("期限切れのセッションなら DEADLINE_EXPIRED", async () => {
  await expectError(
    execute(
      setup(task, {
        ...session,
        uploadExpiresAt: new Date("2026-10-31T11:59:00Z"),
      }),
    ),
    "DEADLINE_EXPIRED",
  );
});

test("完了済みセッションなら STATE_CONFLICT", async () => {
  await expectError(
    execute(
      setup(task, {
        ...session,
        status: "completed",
        completedAt: now,
      }),
    ),
    "STATE_CONFLICT",
  );
});
