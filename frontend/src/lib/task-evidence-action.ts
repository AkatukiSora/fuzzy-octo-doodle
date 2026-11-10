import type { TaskEvidence } from "./taskEvidenceApi.ts";
import type { TaskStatus } from "../types/task.ts";

interface EvidenceActionTask {
  id: string;
  status: TaskStatus;
  viewer: "owner" | "friend";
}

interface EvidenceAction {
  label: "証拠を提出" | "追加証拠を提出" | "提出証拠を確認";
  href: string;
}

export function taskEvidenceAction(
  task: EvidenceActionTask,
  evidences: readonly Pick<TaskEvidence, "submissionType">[] | null,
): EvidenceAction | null {
  // 未取得や取得失敗を未提出扱いにせず、既存の取得・再試行表示に任せる。
  if (task.viewer !== "owner" || evidences === null) return null;

  const base = `/tasks/${encodeURIComponent(task.id)}/evidence`;
  const hasInitial = evidences.some((item) => item.submissionType === "initial");
  const hasAdditional = evidences.some((item) => item.submissionType === "additional");

  if (task.status === "active" && !hasInitial && !hasAdditional) {
    return { label: "証拠を提出", href: base };
  }
  if (task.status === "disputed" && !hasAdditional) {
    return { label: "追加証拠を提出", href: `${base}/additional` };
  }

  // 提出済み証拠の更新APIはない。新規提出画面へ送らず、既存の証拠を閲覧する。
  return evidences.length > 0
    ? { label: "提出証拠を確認", href: "#submitted-evidence" }
    : null;
}
