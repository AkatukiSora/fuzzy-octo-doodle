
import assert from "node:assert/strict";
import { test } from "node:test";
import { ExpireStaleUploadSessionsUseCase } from "./application/usecases/jobs/expire-stale-upload-sessions.usecase.ts";
import type { UnitOfWork, Tx } from "./application/ports/unit-of-work.port.ts";
import type { Clock } from "./application/ports/clock.port.ts";
import type { UploadSessionRepository } from "./application/ports/evidence.repository.ts";

const now = new Date("2026-10-31T12:00:00.000Z");

// 既存テストと同じく、トランザクションを簡易的に再現する
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;

const uow: UnitOfWork = {
  run: (fn) => fn(tx),
};

const clock: Clock = {
  now: () => now,
};

class FakeUploadSessions implements UploadSessionRepository {
  receivedNow: Date | null = null;

  constructor(
    private readonly count: number,
    private readonly error?: Error,
  ) {}

  expireStale(_tx: Tx, date: Date): Promise<number> {
    this.receivedNow = date;

    if (this.error) {
      return Promise.reject(this.error);
    }

    return Promise.resolve(this.count);
  }

  insert(): never {
    throw new Error("未使用");
  }

  findByIdForUpdate(): never {
    throw new Error("未使用");
  }

  save(): never {
    throw new Error("未使用");
  }

  hasLiveSession(): never {
    throw new Error("未使用");
  }
}

test("期限切れ3件なら処理件数3を返す", async () => {
  const repository = new FakeUploadSessions(3);
  const useCase = new ExpireStaleUploadSessionsUseCase(
    uow,
    clock,
    repository,
  );

  const result = await useCase.execute({ batchSize: 100 });

  assert.deepEqual(result, { processed: 3 });
  assert.equal(repository.receivedNow, now);
});

test("期限切れ0件なら処理件数0を返す", async () => {
  const repository = new FakeUploadSessions(0);
  const useCase = new ExpireStaleUploadSessionsUseCase(
    uow,
    clock,
    repository,
  );

  const result = await useCase.execute({ batchSize: 100 });

  assert.deepEqual(result, { processed: 0 });
});

test("Repositoryのエラーを伝える", async () => {
  const error = new Error("DB error");
  const repository = new FakeUploadSessions(0, error);
  const useCase = new ExpireStaleUploadSessionsUseCase(
    uow,
    clock,
    repository,
  );

  await assert.rejects(useCase.execute({ batchSize: 100 }), error);
});
