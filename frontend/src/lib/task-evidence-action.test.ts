import assert from "node:assert/strict";
import { test } from "node:test";
import { taskEvidenceAction } from "./task-evidence-action.ts";
import type { TaskStatus } from "../types/task.ts";

const task = { id: "task/1", viewer: "owner" as const, status: "active" as TaskStatus };
const initial = { submissionType: "initial" as const };
const additional = { submissionType: "additional" as const };

test("未提出の初回証拠だけを既存の初回提出画面へ案内する", () => {
  assert.deepEqual(taskEvidenceAction(task, []), {
    label: "証拠を提出", href: "/tasks/task%2F1/evidence",
  });
  // タスク状態と証拠取得のタイミングがずれても、提出済みを新規提出扱いにしない。
  assert.deepEqual(taskEvidenceAction(task, [initial]), {
    label: "提出証拠を確認", href: "#submitted-evidence",
  });
  assert.equal(taskEvidenceAction(task, [additional])?.label, "提出証拠を確認");
});

test("追加証拠待ちでは初回証拠があっても追加未提出なら既存の追加提出画面へ案内する", () => {
  assert.deepEqual(taskEvidenceAction({ ...task, status: "disputed" }, [initial]), {
    label: "追加証拠を提出", href: "/tasks/task%2F1/evidence/additional",
  });
  assert.deepEqual(taskEvidenceAction({ ...task, status: "disputed" }, [initial, additional]), {
    label: "提出証拠を確認", href: "#submitted-evidence",
  });
});

test("審査中・確定済みの初回／追加証拠は更新APIがないため閲覧のみとする", () => {
  for (const status of ["reviewing", "success", "failed", "indeterminate", "closed"] as const) {
    for (const evidences of [[initial], [initial, additional]]) {
      assert.deepEqual(taskEvidenceAction({ ...task, status }, evidences), {
        label: "提出証拠を確認", href: "#submitted-evidence",
      });
    }
    assert.equal(taskEvidenceAction({ ...task, status }, []), null);
  }
});

test("証拠が未取得・取得失敗の場合や他人のタスクには提出操作を表示しない", () => {
  for (const status of ["active", "disputed", "reviewing"] as const) {
    assert.equal(taskEvidenceAction({ ...task, status }, null), null);
    for (const evidences of [[], [initial], [initial, additional]]) {
      assert.equal(taskEvidenceAction({ ...task, status, viewer: "friend" }, evidences), null);
    }
  }
});
