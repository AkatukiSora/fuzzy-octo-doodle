import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchTaskEvidences } from "./taskEvidenceApi.ts";

const evidence = {
  submissionType: "additional",
  submittedAt: "2026-11-07T03:30:00.000Z",
  photoUrls: [
    "https://storage.googleapis.com/donee/1.png?X-Amz-Signature=abc%2F123&X-Amz-Expires=60",
    "https://storage.googleapis.com/donee/2.png?X-Amz-Signature=def&X-Amz-Expires=60",
  ],
};

test("タスクIDを安全に符号化し、証拠の種別と提出日時を取得する", async (t) => {
  let requestedUrl = "";
  let credentials: RequestCredentials | undefined;
  t.mock.method(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = input instanceof Request ? input.url : input.toString();
    credentials = init?.credentials;
    return Promise.resolve(Response.json({ evidences: [evidence] }));
  });

  const result = await fetchTaskEvidences("task/1");

  assert.equal(requestedUrl, "/api/tasks/task%2F1/evidences");
  assert.equal(credentials, "include");
  assert.deepEqual(result, {
    kind: "loaded",
    evidences: [{
      submissionType: evidence.submissionType,
      submittedAt: evidence.submittedAt,
      photoCount: 2,
      photoUrls: evidence.photoUrls,
    }],
  });
});

test("証拠一覧が空の場合だけ空の一覧として返す", async (t) => {
  t.mock.method(globalThis, "fetch", () => Promise.resolve(Response.json({ evidences: [] })));

  assert.deepEqual(await fetchTaskEvidences("task-1"), { kind: "loaded", evidences: [] });
});

test("403を証拠なしと混同せず権限エラーとして返す", async (t) => {
  t.mock.method(globalThis, "fetch", () => Promise.resolve(new Response(null, { status: 403 })));

  assert.deepEqual(await fetchTaskEvidences("task-1"), { kind: "forbidden" });
});

test("その他のHTTP失敗は取得失敗として返す", async (t) => {
  t.mock.method(globalThis, "fetch", () => Promise.resolve(new Response(null, { status: 500 })));

  assert.deepEqual(await fetchTaskEvidences("task-1"), { kind: "error", status: 500 });
});

test("契約外の証拠データを拒否する", async (t) => {
  t.mock.method(globalThis, "fetch", () =>
    Promise.resolve(Response.json({ evidences: [{ ...evidence, submissionType: "unknown" }] })),
  );

  await assert.rejects(fetchTaskEvidences("task-1"), /証拠一覧の形式が不正/);
});
