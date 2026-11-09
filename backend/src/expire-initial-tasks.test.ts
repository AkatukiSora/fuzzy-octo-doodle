import assert from "node:assert/strict";
import { test } from "node:test";
import { ExpireInitialTasksUseCase } from "./application/usecases/jobs/expire-initial-tasks.usecase.ts";
import { TaskEventPublisher } from "./application/shared/task-event-publisher.ts";
import type { Tx, UnitOfWork } from "./application/ports/unit-of-work.port.ts";
import { KyselyTaskRepository } from "./infrastructure/db/repositories/task.repository.ts";
import { KyselyUploadSessionRepository } from "./infrastructure/db/repositories/evidence.repository.ts";
import { KyselyPostRepository } from "./infrastructure/db/repositories/feed.repository.ts";
import { MockPaymentGateway } from "./infrastructure/payment/mock-payment-gateway.ts";
import { createTask } from "./domain/task/task.ts";
import type { Task } from "./domain/task/task.ts";
import { authorizeTaskCreation, parseTaskDeadline } from "./domain/task/task-policy.ts";
import { parseTaskId, parseUserId } from "./domain/shared/id-parsers.ts";

// 不透明なTxはport間の受け渡しだけに使う。
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;
const now = new Date("2026-11-09T00:00:00Z");
const clock = { now: () => now };
const ids = { uuid: () => "33333333-3333-4333-8333-333333333333", inviteToken: () => "unused" };
function taskAt(deadline: Date) {
  const created = new Date(now.getTime() - 7200000);
  return createTask({ id: parseTaskId("11111111-1111-4111-8111-111111111111"), ownerId: parseUserId("22222222-2222-4222-8222-222222222222"), originalTaskId: null, title: "期限整合確認", achievementCondition: "提出する", evidenceMethod: "photo", deadlineAt: parseTaskDeadline(deadline, created), penaltyAmount: 100, isPenaltyPublic: false, permit: authorizeTaskCreation(0) }, created).next;
}

test("expired initial task is finalized and published once; charge runs after commit", async t => {
  const initial = taskAt(new Date(now.getTime() - 60000));
  let current: Task = initial;
  let inTransaction = false;
  const uow: UnitOfWork = { run: async fn => { inTransaction = true; try { return await fn(tx); } finally { inTransaction = false; } } };
  const tasks = new KyselyTaskRepository();
  t.mock.method(tasks, "lockExpiredInitial", () => Promise.resolve([initial]));
  t.mock.method(tasks, "findByIdForUpdate", () => Promise.resolve(current));
  const save = t.mock.method(tasks, "save", (_tx: Tx, value: Task) => { current = value; return Promise.resolve(); });
  const sessions = new KyselyUploadSessionRepository();
  t.mock.method(sessions, "hasLiveSession", () => Promise.resolve(false));
  const posts = new KyselyPostRepository();
  const publish = t.mock.method(posts, "insertIfAbsent", () => { assert.equal(inTransaction, true); return Promise.resolve(); });
  const payment = new MockPaymentGateway();
  const charge = t.mock.method(payment, "requestCharge", () => { assert.equal(inTransaction, false); assert.equal(current.status, "failed"); return Promise.resolve(); });
  const useCase = new ExpireInitialTasksUseCase(uow, clock, tasks, sessions, new TaskEventPublisher(posts, ids, clock), payment);
  assert.deepEqual(await useCase.execute({ batchSize: 100 }), { processed: 1 });
  assert.deepEqual(await useCase.execute({ batchSize: 100 }), { processed: 0 });
  assert.equal(save.mock.callCount(), 1); assert.equal(publish.mock.callCount(), 1); assert.equal(charge.mock.callCount(), 1);
});

test("deadline boundary and live upload grace do not finalize or charge prematurely", async t => {
  for (const [offset, live] of [[0, false], [60000, false], [-60000, true]] as const) {
    const initial = taskAt(new Date(now.getTime() + offset));
    const uow: UnitOfWork = { run: fn => fn(tx) };
    const tasks = new KyselyTaskRepository();
    t.mock.method(tasks, "lockExpiredInitial", () => Promise.resolve([initial]));
    t.mock.method(tasks, "findByIdForUpdate", () => Promise.resolve(initial));
    const save = t.mock.method(tasks, "save", () => Promise.resolve());
    const sessions = new KyselyUploadSessionRepository();
    t.mock.method(sessions, "hasLiveSession", () => Promise.resolve(live));
    const posts = new KyselyPostRepository();
    const publish = t.mock.method(posts, "insertIfAbsent", () => Promise.resolve());
    const payment = new MockPaymentGateway();
    const charge = t.mock.method(payment, "requestCharge", () => Promise.resolve());
    const useCase = new ExpireInitialTasksUseCase(uow, clock, tasks, sessions, new TaskEventPublisher(posts, ids, clock), payment);
    assert.deepEqual(await useCase.execute({ batchSize: 100 }), { processed: 0 });
    assert.equal(save.mock.callCount(), 0); assert.equal(publish.mock.callCount(), 0); assert.equal(charge.mock.callCount(), 0);
  }
});
