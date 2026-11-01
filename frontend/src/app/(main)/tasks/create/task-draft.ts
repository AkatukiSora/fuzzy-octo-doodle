export type TaskVisibility = "private" | "public";

export interface TaskDraft {
  title: string;
  description: string;
  deadline: string;
  reward: string;
  visibility: TaskVisibility;
}

export const TASK_DRAFT_STORAGE_KEY = "task-create-draft";
export const TASK_IDEMPOTENCY_KEY_STORAGE_KEY = "task-create-idempotency-key";

export function isTaskDraft(value: unknown): value is TaskDraft {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const draft = value as Record<string, unknown>;
  return (
    typeof draft["title"] === "string" &&
    typeof draft["description"] === "string" &&
    typeof draft["deadline"] === "string" &&
    typeof draft["reward"] === "string" &&
    (draft["visibility"] === "private" || draft["visibility"] === "public")
  );
}
