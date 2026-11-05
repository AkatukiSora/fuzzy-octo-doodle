import assert from "node:assert/strict";
import { test } from "node:test";
import type { Clock } from "./application/ports/clock.port.ts";
import type { FriendshipRepository } from "./application/ports/friendship.repository.ts";
import type { IdempotencyRecord, IdempotencyRepository } from "./application/ports/idempotency.repository.ts";
import type { ObjectionRepository } from "./application/ports/objection.repository.ts";
import type { PostRepository } from "./application/ports/feed.repository.ts";
import type { TaskRepository } from "./application/ports/task.repository.ts";
import type { IdGenerator } from "./application/ports/id-generator.port.ts";
import type { Tx, UnitOfWork } from "./application/ports/unit-of-work.port.ts";
import type { IdempotentOperation, IdempotentResponseStatus, RequestHash } from "./domain/shared/idempotency.ts";
import type { ResponsePayloads } from "./domain/shared/response-payloads.ts";
import { parseIdempotencyKey } from "./domain/shared/idempotency.ts";
import { parseObjectionId, parseTaskId, parseUserId } from "./domain/shared/id-parsers.ts";
import { DomainError, type ErrorCode } from "./domain/shared/errors.ts";
import type { Objection } from "./domain/objection/objection.ts";
import type { ActiveTask, DisputedTask, ReviewingTask, Task } from "./domain/task/task.ts";
import { acceptFirstObjection, createTask, submitAdditionalEvidence, submitInitialEvidence } from "./domain/task/task.ts";
import { authorizeTaskCreation, parseTaskDeadline } from "./domain/task/task-policy.ts";
import { TaskEventPublisher } from "./application/shared/task-event-publisher.ts";
import { CreateObjectionUseCase } from "./application/usecases/objections/create-objection.usecase.ts";
import type { CreateObjectionInput } from "./application/ports/usecases/create-objection.port.ts";

const now = new Date("2026-11-04T12:00:00.000Z");
const ownerId = parseUserId("11111111-1111-4111-8111-111111111111");
const friendId = parseUserId("22222222-2222-4222-8222-222222222222");
const taskId = parseTaskId("33333333-3333-4333-8333-333333333333");
const objectionId = parseObjectionId("44444444-4444-4444-8444-444444444444");
const idempotencyKey = parseIdempotencyKey("55555555-5555-4555-8555-555555555555");

// Tx is opaque; this fake only passes it through to the use case's ports.
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;
const uow: UnitOfWork = { run: (fn) => fn(tx) };
const clock: Clock = { now: () => new Date(now) };
const ids: IdGenerator = { uuid: () => objectionId, inviteToken: () => "unused" };

function makeActiveTask(): ActiveTask {
  return createTask(
    {
      id: taskId,
      ownerId,
      originalTaskId: null,
      title: "Test task",
      achievementCondition: "Complete the task",
      evidenceMethod: "Upload evidence",
      deadlineAt: parseTaskDeadline(new Date(now.getTime() + 60 * 60 * 1000), now),
      penaltyAmount: 100,
      isPenaltyPublic: true,
      permit: authorizeTaskCreation(0),
    },
    now,
  ).next;
}

function makeReviewingTask(): ReviewingTask<1> {
  const submitted = submitInitialEvidence(makeActiveTask(), 1, now).next;
  if (submitted.status !== "reviewing") throw new Error("Expected a reviewing task");
  return submitted;
}

function makeSecondReviewTask(): ReviewingTask<2> {
  const disputed: DisputedTask = acceptFirstObjection(makeReviewingTask(), now).next;
  return submitAdditionalEvidence(disputed, now).next;
}

class FakeTasks implements TaskRepository {
  task: Task | null;
  saved: Task[] = [];
  constructor(task: Task | null) { this.task = task; }
  insert(_tx: Tx, _task: ActiveTask): Promise<void> { return Promise.reject(new Error("unused")); }
  findById(_tx: Tx, _id: ReturnType<typeof parseTaskId>): Promise<Task | null> { return Promise.resolve(this.task); }
  findByIds(_tx: Tx, _ids: readonly ReturnType<typeof parseTaskId>[]): Promise<Task[]> { return Promise.reject(new Error("unused")); }
  findByIdForUpdate(_tx: Tx, _id: ReturnType<typeof parseTaskId>): Promise<Task | null> { return Promise.resolve(this.task); }
  save(_tx: Tx, task: Task): Promise<void> { this.saved.push(task); return Promise.resolve(); }
  countActiveInitial(_tx: Tx, _owner: ReturnType<typeof parseUserId>): Promise<number> { return Promise.reject(new Error("unused")); }
  lockUserForCreation(_tx: Tx, _owner: ReturnType<typeof parseUserId>): Promise<void> { return Promise.reject(new Error("unused")); }
  listByOwner(): Promise<{ items: Task[]; nextCursor: string | null }> { return Promise.reject(new Error("unused")); }
  lockExpiredInitial(): Promise<ActiveTask[]> { return Promise.reject(new Error("unused")); }
  lockReviewEnded(): Promise<ReviewingTask[]> { return Promise.reject(new Error("unused")); }
  lockExpiredAdditional(): Promise<DisputedTask[]> { return Promise.reject(new Error("unused")); }
}

class FakeFriendships implements FriendshipRepository {
  constructor(private readonly friends: boolean) {}
  findById(): Promise<null> { return Promise.resolve(null); }
  findByPair(): Promise<null> { return Promise.resolve(null); }
  save(): Promise<void> { return Promise.reject(new Error("unused")); }
  areFriends(): Promise<boolean> { return Promise.resolve(this.friends); }
  countFriends(): Promise<number> { return Promise.reject(new Error("unused")); }
  listFriendIds(): Promise<ReturnType<typeof parseUserId>[]> { return Promise.reject(new Error("unused")); }
  listIncomingPending(): Promise<[]> { return Promise.reject(new Error("unused")); }
  listOutgoingPending(): Promise<[]> { return Promise.reject(new Error("unused")); }
  listBlockedBy(): Promise<[]> { return Promise.reject(new Error("unused")); }
}

class FakeObjections implements ObjectionRepository {
  inserted: Objection[] = [];
  constructor(private readonly shouldInsert = true) {}
  tryInsert(_tx: Tx, objection: Objection<1 | 2, "open">): Promise<boolean> {
    if (this.shouldInsert) this.inserted.push(objection);
    return Promise.resolve(this.shouldInsert);
  }
  findById(): Promise<null> { return Promise.resolve(null); }
  findByTaskAndRound(): Promise<null> { return Promise.resolve(null); }
  save(): Promise<void> { return Promise.reject(new Error("unused")); }
  listByObjector(): Promise<{ items: Objection[]; nextCursor: string | null }> { return Promise.reject(new Error("unused")); }
}

class FakeIdempotency implements IdempotencyRepository {
  private readonly records: {
    [O in IdempotentOperation]: {
      requestHash: RequestHash | null;
      responseStatus: IdempotentResponseStatus | null;
      responseBody: ResponsePayloads[O] | null;
    };
  } = {
    create_task: { requestHash: null, responseStatus: null, responseBody: null },
    complete_evidence_upload: { requestHash: null, responseStatus: null, responseBody: null },
    create_objection: { requestHash: null, responseStatus: null, responseBody: null },
    withdraw_objection: { requestHash: null, responseStatus: null, responseBody: null },
    create_friend_request: { requestHash: null, responseStatus: null, responseBody: null },
  };
  reservations = 0;

  reserve<O extends IdempotentOperation>(
    _tx: Tx,
    _user: ReturnType<typeof parseUserId>,
    operation: O,
    _key: ReturnType<typeof parseIdempotencyKey>,
    requestHash: RequestHash,
  ): Promise<IdempotencyRecord<O> | null> {
    this.reservations += 1;
    const record = this.records[operation];
    if (record.requestHash === null) {
      record.requestHash = requestHash;
      return Promise.resolve(null);
    }
    return Promise.resolve({
      requestHash: record.requestHash,
      responseStatus: record.responseStatus,
      responseBody: record.responseBody,
    });
  }

  complete<O extends IdempotentOperation>(
    _tx: Tx,
    _user: ReturnType<typeof parseUserId>,
    operation: O,
    _key: ReturnType<typeof parseIdempotencyKey>,
    status: IdempotentResponseStatus,
    body: ResponsePayloads[O],
  ): Promise<void> {
    const record = this.records[operation];
    record.responseStatus = status;
    record.responseBody = body;
    return Promise.resolve();
  }
}

const posts: PostRepository = {
  insertIfAbsent: () => Promise.resolve(),
  findById: () => Promise.resolve(null),
  listFeed: () => Promise.reject(new Error("unused")),
  findFeedItem: () => Promise.resolve(null),
  hasPost: () => Promise.resolve(false),
};
const events = new TaskEventPublisher(posts, ids, clock);

function makeUseCase(task: Task | null, areFriends: boolean, shouldInsert = true) {
  const tasks = new FakeTasks(task);
  const objections = new FakeObjections(shouldInsert);
  const idempotency = new FakeIdempotency();
  const usecase = new CreateObjectionUseCase(
    uow,
    clock,
    ids,
    idempotency,
    tasks,
    objections,
    new FakeFriendships(areFriends),
    events,
  );
  return { usecase, tasks, objections, idempotency };
}

function input(reasonDetail = "Evidence is insufficient"): CreateObjectionInput {
  return {
    userId: friendId,
    idempotencyKey,
    taskId,
    reasonType: "insufficient_evidence",
    reasonDetail,
  };
}

async function assertDomainCode(promise: Promise<unknown>, code: ErrorCode): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, code);
    return true;
  });
}

test("CreateObjection stores a first-round objection and moves the task to disputed", async () => {
  const { usecase, tasks, objections } = makeUseCase(makeReviewingTask(), true);
  const result = await usecase.execute(input());
  assert.equal(result.round, 1);
  assert.equal(result.reasonDetail, "Evidence is insufficient");
  assert.equal(result.withdrawn, false);
  assert.equal(objections.inserted.length, 1);
  assert.equal(tasks.saved[0]?.status, "disputed");
});

test("CreateObjection stores a second-round objection and moves the task to indeterminate", async () => {
  const { usecase, tasks, objections } = makeUseCase(makeSecondReviewTask(), true);
  const result = await usecase.execute(input());
  assert.equal(result.round, 2);
  assert.equal(objections.inserted.length, 1);
  assert.equal(tasks.saved[0]?.status, "indeterminate");
});

test("CreateObjection replays the saved result for the same key and request", async () => {
  const { usecase, objections, idempotency } = makeUseCase(makeReviewingTask(), true);
  const created = await usecase.execute(input());
  const replayed = await usecase.execute(input());
  assert.deepEqual(replayed, created);
  assert.equal(objections.inserted.length, 1);
  assert.equal(idempotency.reservations, 2);
});

test("CreateObjection rejects reuse of a key with different request content", async () => {
  const { usecase } = makeUseCase(makeReviewingTask(), true);
  await usecase.execute(input());
  await assertDomainCode(usecase.execute(input("A different reason")), "IDEMPOTENCY_KEY_REUSED");
});

test("CreateObjection returns NOT_FOUND for a missing task", async () => {
  const { usecase } = makeUseCase(null, true);
  await assertDomainCode(usecase.execute(input()), "NOT_FOUND");
});

test("CreateObjection hides a non-friend target as NOT_FOUND", async () => {
  const { usecase } = makeUseCase(makeReviewingTask(), false);
  await assertDomainCode(usecase.execute(input()), "NOT_FOUND");
});

test("CreateObjection returns FORBIDDEN when the task owner tries to object", async () => {
  const { usecase } = makeUseCase(makeReviewingTask(), false);
  await assertDomainCode(usecase.execute({ ...input(), userId: ownerId }), "FORBIDDEN");
});

test("CreateObjection returns STATE_CONFLICT for a friend when the task is not reviewing", async () => {
  const { usecase } = makeUseCase(makeActiveTask(), true);
  await assertDomainCode(usecase.execute(input()), "STATE_CONFLICT");
});

test("CreateObjection returns STATE_CONFLICT when the unique objection slot is occupied", async () => {
  const { usecase, objections } = makeUseCase(makeReviewingTask(), true, false);
  await assertDomainCode(usecase.execute(input()), "STATE_CONFLICT");
  assert.equal(objections.inserted.length, 0);
});

test("CreateObjection rejects a whitespace-only reason", async () => {
  const { usecase } = makeUseCase(makeReviewingTask(), true);
  await assertDomainCode(usecase.execute(input("   ")), "VALIDATION_ERROR");
});

test("CreateObjection returns DEADLINE_EXPIRED when review is closed", async () => {
  const task = { ...makeReviewingTask(), reviewDeadlineAt: new Date(now) };
  const { usecase } = makeUseCase(task, true);
  await assertDomainCode(usecase.execute(input()), "DEADLINE_EXPIRED");
});
