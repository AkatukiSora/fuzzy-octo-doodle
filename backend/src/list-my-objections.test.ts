
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ObjectionRepository } from "./application/ports/objection.repository.ts";
import type { UnitOfWork, Tx } from "./application/ports/unit-of-work.port.ts";
import type { Objection } from "./domain/objection/objection.ts";
import { ListMyObjectionsUseCase } from "./application/usecases/objections/list-my-objections.usecase.ts";
import { parseObjectionId, parseTaskId, parseUserId } from "./domain/shared/id-parsers.ts";

const userId = parseUserId("11111111-1111-4111-8111-111111111111");
const taskId = parseTaskId("22222222-2222-4222-8222-222222222222");
const objectionId = parseObjectionId("33333333-3333-4333-8333-333333333333");

// テスト用のダミートランザクション
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;
const uow: UnitOfWork = { run: (fn) => fn(tx) };

const objection: Objection<1, "open"> = {
  id: objectionId,
  taskId,
  objectorId: userId,
  reviewRound: 1,
  reasonType: "insufficient_evidence",
  reasonDetail: "写真が不鮮明です",
  createdAt: new Date("2026-11-01T00:00:00Z"),
  withdrawnAt: null,
};

class FakeObjections implements ObjectionRepository {
  readonly calls: {
    objector: typeof userId;
    cursor: string | undefined;
    limit: number;
  }[] = [];

  listByObjector(
    _tx: Tx,
    objector: typeof userId,
    cursor: string | undefined,
    limit: number,
  ) {
    this.calls.push({ objector, cursor, limit });
    return Promise.resolve({
      items: [objection],
      nextCursor: "next-page",
    });
  }

  tryInsert(): Promise<boolean> {
    throw new Error("使わない");
  }

  findById(): Promise<Objection | null> {
    throw new Error("使わない");
  }

  findByTaskAndRound(): Promise<Objection | null> {
    throw new Error("使わない");
  }

  save(): Promise<void> {
    throw new Error("使わない");
  }
}

test("自分の異議を表示用データに変換して返す", async () => {
  const repo = new FakeObjections();
  const useCase = new ListMyObjectionsUseCase(uow, repo);

  const result = await useCase.execute({
    userId,
    cursor: "previous-page",
    limit: 10,
  });

  assert.deepEqual(repo.calls, [
    { objector: userId, cursor: "previous-page", limit: 10 },
  ]);

  assert.deepEqual(result, {
    items: [{
      id: objectionId,
      taskId,
      round: 1,
      reasonType: "insufficient_evidence",
      reasonDetail: "写真が不鮮明です",
      withdrawn: false,
      createdAt: objection.createdAt,
    }],
    nextCursor: "next-page",
  });

 const firstItem = result.items[0];
    assert.ok(firstItem);

    assert.equal("objectorId" in firstItem, false);
    assert.equal("photoUrls" in firstItem, false);
});
