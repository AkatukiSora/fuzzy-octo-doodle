
import assert from "node:assert/strict";
import { test } from "node:test";
import { StartEvidenceUploadSessionUseCase } from "./application/usecases/evidence/start-evidence-upload-session.usecase.ts";
import { DomainError } from "./domain/shared/errors.ts";
import { parseTaskId, parseUserId } from "./domain/shared/id-parsers.ts";
import type { Task } from "./domain/task/task.ts";
import type { UnitOfWork, Tx } from "./application/ports/unit-of-work.port.ts";
import type { Clock } from "./application/ports/clock.port.ts";
import type { IdGenerator } from "./application/ports/id-generator.port.ts";
import type { TaskRepository } from "./application/ports/task.repository.ts";
import type { UploadSessionRepository } from "./application/ports/evidence.repository.ts";
import type { UploadingSession } from "./domain/evidence/upload-session.ts";

const NOW = new Date("2026-10-31T12:00:00.000Z");
const OWNER = parseUserId("11111111-1111-4111-8111-111111111111");
const OTHER = parseUserId("22222222-2222-4222-8222-222222222222");
const TASK_ID = parseTaskId("33333333-3333-4333-8333-333333333333");
const SESSION_ID = "44444444-4444-4444-8444-444444444444";

function makeTask(
  status: "active" | "disputed" = "active",
  deadline = new Date(NOW.getTime() + 60_000),
): Task {
  const base = {
    id: TASK_ID,
    ownerId: OWNER,
    originalTaskId: null,
    title: "テストタスク",
    achievementCondition: "完了する",
    evidenceMethod: "写真",
    deadlineAt: deadline,
    penaltyAmount: 100,
    isPenaltyPublic: false,
    createdAt: NOW,
    updatedAt: NOW,
  };

  // テストデータ用。ドメインで検証済みの値型を簡略化している。
  if (status === "active") {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return { ...base, status, reviewRound: 0 } as unknown as Task;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    ...base,
    status,
    reviewRound: 1,
    additionalEvidenceDeadlineAt: deadline,
  } as unknown as Task;
}

function setup(task: Task | null) {
  const saved: UploadingSession[] = [];

  // テスト用の最小実装。使わないRepositoryメソッドは呼ばれない。
  const uow = {
    run: async <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      return fn({} as Tx);
    },
  } satisfies UnitOfWork;

  const clock = {
    now: () => NOW,
  } satisfies Clock;

  const ids = {
    uuid: () => SESSION_ID,
    inviteToken: () => "unused",
  } satisfies IdGenerator;

const tasks = {
  findById: (_tx: Tx, id: typeof TASK_ID) => {
    assert.equal(id, TASK_ID);
    return Promise.resolve(task);
  },
};

const uploadSessions = {
  insert: (_tx: Tx, session: UploadingSession) => {
    saved.push(session);
    return Promise.resolve();
  },
};
  const useCase = new StartEvidenceUploadSessionUseCase(
    uow,
    clock,
    ids,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    tasks as TaskRepository,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    uploadSessions as UploadSessionRepository,
  );

  return { useCase, saved };
}

function expectError(code: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, code);
    return true;
  };
}

test("初回提出: activeタスクならセッションを保存して返す", async () => {
  const { useCase, saved } = setup(makeTask());

  const result = await useCase.execute({
    userId: OWNER,
    taskId: TASK_ID,
    submissionType: "initial",
  });

  assert.equal(result.status, "uploading");
  assert.equal(result.submissionType, "initial");
  assert.equal(result.taskId, TASK_ID);
  assert.equal(result.userId, OWNER);
  assert.equal(result.id, SESSION_ID);
  assert.equal(saved.length, 1);
  assert.equal(saved[0], result);
  assert.equal(result.uploadExpiresAt.getTime(), NOW.getTime() + 60_000 + 300_000);
});

test("追加提出: disputedタスクならセッションを保存する", async () => {
  const { useCase, saved } = setup(makeTask("disputed"));

  const result = await useCase.execute({
    userId: OWNER,
    taskId: TASK_ID,
    submissionType: "additional",
  });

  assert.equal(result.submissionType, "additional");
  assert.equal(saved.length, 1);
});

test("存在しないタスクはNOT_FOUND", async () => {
  const { useCase, saved } = setup(null);

  await assert.rejects(
    useCase.execute({ userId: OWNER, taskId: TASK_ID, submissionType: "initial" }),
    expectError("NOT_FOUND"),
  );
  assert.equal(saved.length, 0);
});

test("初回提出でdisputedならSTATE_CONFLICT", async () => {
  const { useCase, saved } = setup(makeTask("disputed"));

  await assert.rejects(
    useCase.execute({ userId: OWNER, taskId: TASK_ID, submissionType: "initial" }),
    expectError("STATE_CONFLICT"),
  );
  assert.equal(saved.length, 0);
});

test("追加提出でactiveならSTATE_CONFLICT", async () => {
  const { useCase, saved } = setup(makeTask());

  await assert.rejects(
    useCase.execute({ userId: OWNER, taskId: TASK_ID, submissionType: "additional" }),
    expectError("STATE_CONFLICT"),
  );
  assert.equal(saved.length, 0);
});

test("タスク所有者以外はFORBIDDEN", async () => {
  const { useCase, saved } = setup(makeTask());

  await assert.rejects(
    useCase.execute({ userId: OTHER, taskId: TASK_ID, submissionType: "initial" }),
    expectError("FORBIDDEN"),
  );
  assert.equal(saved.length, 0);
});

test("初回提出期限切れはDEADLINE_EXPIRED", async () => {
  const { useCase, saved } = setup(makeTask("active", new Date(NOW.getTime() - 1)));

  await assert.rejects(
    useCase.execute({ userId: OWNER, taskId: TASK_ID, submissionType: "initial" }),
    expectError("DEADLINE_EXPIRED"),
  );
  assert.equal(saved.length, 0);
});

test("追加提出期限切れはDEADLINE_EXPIRED", async () => {
  const { useCase, saved } = setup(makeTask("disputed", new Date(NOW.getTime() - 1)));

  await assert.rejects(
    useCase.execute({ userId: OWNER, taskId: TASK_ID, submissionType: "additional" }),
    expectError("DEADLINE_EXPIRED"),
  );
  assert.equal(saved.length, 0);
});

test("期限ちょうどならアップロード開始可能", async () => {
  const { useCase, saved } = setup(makeTask("active", NOW));

  const result = await useCase.execute({
    userId: OWNER,
    taskId: TASK_ID,
    submissionType: "initial",
  });

  assert.equal(result.status, "uploading");
  assert.equal(saved.length, 1);
});
