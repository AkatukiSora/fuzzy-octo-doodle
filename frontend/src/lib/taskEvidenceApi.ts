import { z } from "zod";

const evidenceListSchema = z.object({
  evidences: z.array(z.object({
    submissionType: z.enum(["initial", "additional"]),
    submittedAt: z.iso.datetime(),
    photoUrls: z.array(z.string()),
  })),
});

export interface TaskEvidence {
  submissionType: "initial" | "additional";
  submittedAt: string;
  photoCount: number;
  photoUrls: string[];
}

export type TaskEvidencesResult =
  | { kind: "loaded"; evidences: TaskEvidence[] }
  | { kind: "forbidden" }
  | { kind: "error"; status: number };

export async function fetchTaskEvidences(
  taskId: string,
  signal?: AbortSignal,
): Promise<TaskEvidencesResult> {
  // API側で証拠ごとに権限を判定する。状態による制限や非公開証拠の補完はしない。
  const response = await fetch(
    `/api/tasks/${encodeURIComponent(taskId)}/evidences`,
    { credentials: "include", ...(signal ? { signal } : {}) },
  );
  if (response.status === 403) return { kind: "forbidden" };
  if (!response.ok) return { kind: "error", status: response.status };

  const result = evidenceListSchema.safeParse(await response.json());
  if (!result.success) throw new Error("証拠一覧の形式が不正です。");
  return {
    kind: "loaded",
    evidences: result.data.evidences.map(({ submissionType, submittedAt, photoUrls }) => ({
      submissionType,
      submittedAt,
      photoCount: photoUrls.length,
      photoUrls,
    })),
  };
}
