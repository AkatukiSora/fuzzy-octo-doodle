import assert from "node:assert/strict";
import { test } from "node:test";
import type { Clock } from "./application/ports/clock.port.ts";
import type { IdempotencyRecord, IdempotencyRepository } from "./application/ports/idempotency.repository.ts";
import type { ObjectionRepository } from "./application/ports/objection.repository.ts";
import type { PostRepository } from "./application/ports/feed.repository.ts";
import type { TaskRepository, Page } from "./application/ports/task.repository.ts";
import type { UnitOfWork, Tx } from "./application/ports/unit-of-work.port.ts";
import type { IdGenerator } from "./application/ports/id-generator.port.ts";
import type { WithdrawObjectionInput } from "./application/ports/usecases/withdraw-objection.port.ts";
import { TaskEventPublisher } from "./application/shared/task-event-publisher.ts";
import { WithdrawObjectionUseCase } from "./application/usecases/objections/withdraw-objection.usecase.ts";
import type { Objection } from "./domain/objection/objection.ts";
import { createObjection, withdrawObjection } from "./domain/objection/objection.ts";
import type { ObjectionSummary } from "./domain/objection/objection-view.ts";
import type { ResponsePayloads } from "./domain/shared/response-payloads.ts";
import { parseIdempotencyKey, type IdempotencyKey, type IdempotentOperation, type IdempotentResponseStatus, type RequestHash } from "./domain/shared/idempotency.ts";
import { DomainError } from "./domain/shared/errors.ts";
import { parseObjectionId, parseTaskId, parseUserId } from "./domain/shared/id-parsers.ts";
import type { ObjectionId, TaskId, UserId } from "./domain/shared/ids.ts";
import { parseTaskDeadline, authorizeTaskCreation } from "./domain/task/task-policy.ts";
import { createTask, submitInitialEvidence, acceptFirstObjection, submitAdditionalEvidence, withdrawFirstObjection } from "./domain/task/task.ts";
import type { Task, ActiveTask, ReviewingTask, DisputedTask } from "./domain/task/task.ts";
import { authorizeObjection } from "./domain/task/visibility-policy.ts";
import type { TaskEvent } from "./domain/task/task-events.ts";
import { parseResponseBody } from "./infrastructure/db/mappers/idempotency-response.mapper.ts";

const baseNow = new Date("2026-11-03T00:00:00.000Z");
const userId = parseUserId("11111111-1111-4111-8111-111111111111");
const otherUserId = parseUserId("22222222-2222-4222-8222-222222222222");
const taskId = parseTaskId("33333333-3333-4333-8333-333333333333");
const objectionId = parseObjectionId("44444444-4444-4444-8444-444444444444");
const otherObjectionId = parseObjectionId("55555555-5555-4555-8555-555555555555");
const idempotencyKey = parseIdempotencyKey("66666666-6666-4666-8666-666666666666");

// Tx は実装（infrastructure）だけが作れる不透明な型で、テストでは中身を使わない。
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;
const uow: UnitOfWork = { run: (fn) => fn(tx) };

function unused<T>(): Promise<T> {
  return Promise.reject(new Error("この port メソッドはテストで使わない"));
}

function makeDomainFixture(now: Date = baseNow): { task: DisputedTask; objection: Objection<1, "open"> } {
  const active = createTask({
    id: taskId,
    ownerId: otherUserId,
    originalTaskId: null,
    title: "目標",
    achievementCondition: "達成する",
    evidenceMethod: "証拠を提出する",
    deadlineAt: parseTaskDeadline(new Date(now.getTime() + 60 * 60 * 1000), now),
    penaltyAmount: 100,
    isPenaltyPublic: false,
    permit: authorizeTaskCreation(0),
  }, now).next;
  const initial = submitInitialEvidence(active, 1, now).next;
  if (initial.status !== "reviewing") throw new Error("初回審査状態を作れませんでした");
  const task = acceptFirstObjection(initial, now).next;
  const authorized = authorizeObjection(initial, "friend", userId);
  if (authorized?.task.reviewRound !== 1) throw new Error("異議を作成できませんでした");
  const objection = createObjection({
    id: objectionId,
    task: authorized.task,
    right: authorized.right,
    reasonType: "other",
    reasonDetail: "理由",
  }, now);
  return { task, objection };
}

class FakeTasks implements TaskRepository {
  readonly saved: Task[] = [];
  private readonly task: Task | null;
  constructor(task: Task | null) { this.task = task; }
  insert(): Promise<void> { return unused(); }
  findById(): Promise<Task | null> { return unused(); }
  findByIds(): Promise<Task[]> { return unused(); }
  findByIdForUpdate(_tx: Tx, _id: TaskId): Promise<Task | null> { return Promise.resolve(this.task); }
  save(_tx: Tx, task: Task): Promise<void> { this.saved.push(task); return Promise.resolve(); }
  countActiveInitial(): Promise<number> { return unused(); }
  lockUserForCreation(): Promise<void> { return unused(); }
  listByOwner(): Promise<Page<Task>> { return unused(); }
  lockExpiredInitial(): Promise<ActiveTask[]> { return unused(); }
  lockReviewEnded(): Promise<ReviewingTask[]> { return unused(); }
  lockExpiredAdditional(): Promise<DisputedTask[]> { return unused(); }
}

class FakeObjections implements ObjectionRepository {
  readonly saved: Objection<1, "withdrawn">[] = [];
  private readonly objection: Objection | null;
  constructor(objection: Objection | null) { this.objection = objection; }
  tryInsert(): Promise<boolean> { return unused(); }
  findById(): Promise<Objection | null> { return Promise.resolve(this.objection); }
  findByTaskAndRound(): Promise<Objection | null> { return unused(); }
  save(_tx: Tx, objection: Objection<1, "withdrawn">): Promise<void> { this.saved.push(objection); return Promise.resolve(); }
  listByObjector(): Promise<Page<Objection>> { return unused(); }
}

class FakeIdempotency implements IdempotencyRepository {
  private storedUser: UserId | null = null;
  private storedOperation: IdempotentOperation | null = null;
  private storedKey: IdempotencyKey | null = null;
  private requestHash: RequestHash | null = null;
  private responseStatus: IdempotentResponseStatus | null = null;
  completedStatus: IdempotentResponseStatus | null = null;
  private responseBody: unknown = null;

  reserve<O extends IdempotentOperation>(
    _tx: Tx,
    user: UserId,
    operation: O,
    key: IdempotencyKey,
    requestHash: RequestHash,
    _now: Date,
  ): Promise<IdempotencyRecord<O> | null> {
    if (this.storedUser !== user || this.storedOperation !== operation || this.storedKey !== key) {
      this.storedUser = user;
      this.storedOperation = operation;
      this.storedKey = key;
      this.requestHash = requestHash;
      this.responseStatus = null;
      this.responseBody = null;
      return Promise.resolve(null);
    }
    if (this.requestHash === null) throw new Error("冪等性レコードにハッシュがありません");
    return Promise.resolve({
      requestHash: this.requestHash,
      responseStatus: this.responseStatus,
      responseBody: this.responseBody === null ? null : parseResponseBody(operation, this.responseBody),
    });
  }

  complete<O extends IdempotentOperation>(
    _tx: Tx,
    _user: UserId,
    _operation: O,
    _key: IdempotencyKey,
    status: IdempotentResponseStatus,
    body: ResponsePayloads[O],
  ): Promise<void> {
    this.responseStatus = status;
    this.completedStatus = status;
    this.responseBody = JSON.parse(JSON.stringify(body));
    return Promise.resolve();
  }
}

class RecordingEvents extends TaskEventPublisher {
  readonly published: TaskEvent[][] = [];
  constructor(now: Date) {
    const posts: PostRepository = {
      insertIfAbsent: () => Promise.resolve(),
      findById: () => unused(),
      listFeed: () => unused(),
      findFeedItem: () => unused(),
      hasPost: () => unused(),
    };
    const ids: IdGenerator = { uuid: () => "77777777-7777-4777-8777-777777777777", inviteToken: () => "unused" };
    const clock: Clock = { now: () => now };
    super(posts, ids, clock);
  }
  override publish(_tx: Tx, events: readonly TaskEvent[]): Promise<void> {
    this.published.push([...events]);
    return Promise.resolve();
  }
}

function makeUseCase(task: Task | null, objection: Objection | null, now: Date = baseNow) {
  const tasks = new FakeTasks(task);
  const objections = new FakeObjections(objection);
  const idempotency = new FakeIdempotency();
  const events = new RecordingEvents(now);
  const clock: Clock = { now: () => now };
  return {
    useCase: new WithdrawObjectionUseCase(uow, clock, idempotency, tasks, objections, events),
    tasks,
    objections,
    idempotency,
    events,
  };
}

function input(id: ObjectionId = objectionId, user: UserId = userId): WithdrawObjectionInput {
  return { userId: user, idempotencyKey, objectionId: id };
}

function summary(objection: Objection<1, "withdrawn">): ObjectionSummary {
  return {
    id: objection.id,
    taskId: objection.taskId,
    round: objection.reviewRound,
    reasonType: objection.reasonType,
    reasonDetail: objection.reasonDetail,
    withdrawn: true,
    createdAt: objection.createdAt,
  };
}

async function assertDomainError(promise: Promise<unknown>, code: DomainError["code"]): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, code);
    return true;
  });
}

test("取り下げは初回異議を withdrawn にし、達成への遷移・イベント・200 の応答を確定する", async () => {
  const fixture = makeDomainFixture();
  const dependencies = makeUseCase(fixture.task, fixture.objection);
  const result = await dependencies.useCase.execute(input());

  assert.deepEqual(result, summary(withdrawObjection(fixture.objection, userId, baseNow)));
  assert.equal(dependencies.objections.saved.length, 1);
  assert.equal(dependencies.idempotency.completedStatus, 200);
  assert.equal(dependencies.objections.saved[0]?.withdrawnAt.getTime(), baseNow.getTime());
  assert.equal(dependencies.tasks.saved[0]?.status, "success");
  assert.equal(dependencies.events.published.length, 1);
  assert.deepEqual(dependencies.events.published[0]?.map((event) => event.type), ["ObjectionWithdrawn", "TaskFinalized"]);
});

test("同じキー・同じ要求の再送は保存済み結果を返し、再度状態変更しない", async () => {
  const fixture = makeDomainFixture();
  const dependencies = makeUseCase(fixture.task, fixture.objection);
  const first = await dependencies.useCase.execute(input());
  const second = await dependencies.useCase.execute(input());

  assert.deepEqual(second, first);
  assert.equal(dependencies.objections.saved.length, 1);
  assert.equal(dependencies.tasks.saved.length, 1);
  assert.equal(dependencies.events.published.length, 1);
});

test("同じキーを別の異議 ID に再利用すると IDEMPOTENCY_KEY_REUSED になる", async () => {
  const fixture = makeDomainFixture();
  const dependencies = makeUseCase(fixture.task, fixture.objection);
  await dependencies.useCase.execute(input());

  await assertDomainError(dependencies.useCase.execute(input(otherObjectionId)), "IDEMPOTENCY_KEY_REUSED");
});

test("異議が存在しなければ NOT_FOUND になる", async () => {
  const fixture = makeDomainFixture();
  const dependencies = makeUseCase(fixture.task, null);
  await assertDomainError(dependencies.useCase.execute(input()), "NOT_FOUND");
});

test("関連タスクが存在しなければ NOT_FOUND になる", async () => {
  const fixture = makeDomainFixture();
  const dependencies = makeUseCase(null, fixture.objection);
  await assertDomainError(dependencies.useCase.execute(input()), "NOT_FOUND");
});

test("別の利用者が取り下げると FORBIDDEN になる", async () => {
  const fixture = makeDomainFixture();
  const dependencies = makeUseCase(fixture.task, fixture.objection);
  await assertDomainError(dependencies.useCase.execute(input(objectionId, otherUserId)), "FORBIDDEN");
});

test("再審査の異議は STATE_CONFLICT になる", async () => {
  const fixture = makeDomainFixture();
  const reviewing = submitAdditionalEvidence(fixture.task, baseNow).next;
  const authorized = authorizeObjection(reviewing, "friend", userId);
  if (authorized?.task.reviewRound !== 2) throw new Error("再審査異議を作成できませんでした");
  const secondRound = createObjection({
    id: otherObjectionId,
    task: authorized.task,
    right: authorized.right,
    reasonType: "other",
    reasonDetail: "再審査理由",
  }, baseNow);
  const dependencies = makeUseCase(fixture.task, secondRound);
  await assertDomainError(dependencies.useCase.execute(input(otherObjectionId)), "STATE_CONFLICT");
});

test("取り下げ済み異議は STATE_CONFLICT になる", async () => {
  const fixture = makeDomainFixture();
  const withdrawn = withdrawObjection(fixture.objection, userId, baseNow);
  const dependencies = makeUseCase(fixture.task, withdrawn);
  await assertDomainError(dependencies.useCase.execute(input()), "STATE_CONFLICT");
});

test("タスクが追加証拠待ちでなければ STATE_CONFLICT になる", async () => {
  const fixture = makeDomainFixture();
  const completed = withdrawFirstObjection(fixture.task, fixture.objection, baseNow).next;
  const dependencies = makeUseCase(completed, fixture.objection);
  await assertDomainError(dependencies.useCase.execute(input()), "STATE_CONFLICT");
});

test("追加証拠の期限後は DEADLINE_EXPIRED になる", async () => {
  const fixture = makeDomainFixture();
  const expiredAt = new Date(fixture.task.additionalEvidenceDeadlineAt.getTime() + 1);
  const dependencies = makeUseCase(fixture.task, fixture.objection, expiredAt);
  await assertDomainError(dependencies.useCase.execute(input()), "DEADLINE_EXPIRED");
});

test("不正な冪等性キーは VALIDATION_ERROR になる", () => {
  assert.throws(() => parseIdempotencyKey("not-a-uuid"), (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, "VALIDATION_ERROR");
    return true;
  });
});
