"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "../../../../components/layout/AppLayout";
import { PageHeader } from "../../../../components/layout/PageHeader";
import { TaskStatusBadge } from "../../../../components/tasks/TaskStatusBadge";
import { ErrorState } from "../../../../components/ui/ErrorState";
import { Loading } from "../../../../components/ui/Loading";
import { fetchTaskEvidences, type TaskEvidence } from "../../../../lib/taskEvidenceApi.ts";
import type { TaskStatus } from "../../../../types/task";
import styles from "./page.module.css";

interface TaskDetail {
  id: string;
  title: string;
  achievementCondition: string;
  evidenceMethod: string;
  deadlineAt: string;
  createdAt: string;
  status: TaskStatus;
  viewer: "owner" | "friend";
  isPenaltyPublic: boolean;
  penaltyAmount?: number;
}

type TaskLoadError =
  | { kind: "notFound"; message: string }
  | { kind: "request"; message: string };

type EvidenceViewState =
  | { kind: "loading" }
  | { kind: "loaded"; evidences: readonly TaskEvidence[] }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

interface TaskEvidenceState {
  taskId: string;
  state: EvidenceViewState;
}

const taskStatuses: readonly TaskStatus[] = [
  "active",
  "reviewing",
  "disputed",
  "success",
  "failed",
  "indeterminate",
  "closed",
];

function isTaskStatus(status: string): status is TaskStatus {
  return taskStatuses.some((taskStatus) => taskStatus === status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTaskDetail(value: unknown): TaskDetail {
  if (
    !isRecord(value) ||
    typeof value["id"] !== "string" ||
    typeof value["title"] !== "string" ||
    typeof value["achievementCondition"] !== "string" ||
    typeof value["evidenceMethod"] !== "string" ||
    typeof value["deadlineAt"] !== "string" ||
    typeof value["createdAt"] !== "string" ||
    typeof value["status"] !== "string" ||
    !isTaskStatus(value["status"]) ||
    (value["viewer"] !== "owner" && value["viewer"] !== "friend") ||
    typeof value["isPenaltyPublic"] !== "boolean" ||
    Number.isNaN(Date.parse(value["deadlineAt"])) ||
    Number.isNaN(Date.parse(value["createdAt"])) ||
    (value["penaltyAmount"] !== undefined &&
      (typeof value["penaltyAmount"] !== "number" ||
        !Number.isFinite(value["penaltyAmount"])))
  ) {
    throw new Error("タスク詳細の形式が正しくありません。");
  }

  return {
    id: value["id"],
    title: value["title"],
    achievementCondition: value["achievementCondition"],
    evidenceMethod: value["evidenceMethod"],
    deadlineAt: value["deadlineAt"],
    createdAt: value["createdAt"],
    status: value["status"],
    viewer: value["viewer"],
    isPenaltyPublic: value["isPenaltyPublic"],
    ...(typeof value["penaltyAmount"] === "number" &&
    (value["viewer"] === "owner" || value["isPenaltyPublic"])
      ? { penaltyAmount: value["penaltyAmount"] }
      : {}),
  };
}

function formatDate(value: string, includeTime = false): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime
      ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const }
      : {}),
  }).format(new Date(value));
}

function getRemainingText(deadlineAt: string): string {
  const remainingMilliseconds = Date.parse(deadlineAt) - Date.now();
  if (remainingMilliseconds <= 0) return "期限を過ぎています";
  const hours = Math.ceil(remainingMilliseconds / (60 * 60 * 1000));
  if (hours < 24) return "あと" + String(hours) + "時間";
  return "あと" + String(Math.ceil(hours / 24)) + "日";
}

const standardSteps = ["タスク作成", "挑戦中", "証拠提出", "審査中", "完了"];

function getProgress(status: TaskStatus) {
  switch (status) {
    case "active":
      return { steps: standardSteps, current: 1 };
    case "reviewing":
      return { steps: standardSteps, current: 3 };
    case "disputed":
      return { steps: ["タスク作成", "挑戦中", "証拠提出", "審査中", "追加証拠待ち"], current: 4 };
    case "failed":
      return { steps: ["タスク作成", "挑戦中", "期限切れ"], current: 2 };
    case "success":
      return { steps: ["タスク作成", "挑戦中", "証拠提出", "達成"], current: 3 };
    case "indeterminate":
      return { steps: ["タスク作成", "証拠提出", "審査中", "判定不能"], current: 3 };
    case "closed":
      return { steps: ["タスク作成", "終了"], current: 1 };
  }
}

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = use(params);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<TaskLoadError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [evidenceState, setEvidenceState] = useState<TaskEvidenceState>({
    taskId,
    state: { kind: "loading" },
  });
  const [evidenceReloadKey, setEvidenceReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setTask(null);
    setError(null);

    async function loadTask() {
      try {
        const response = await fetch(
          `/api/tasks/${encodeURIComponent(taskId)}`,
          { credentials: "include" },
        );
        if (response.status === 404) {
          if (!cancelled) {
            setError({
              kind: "notFound",
              message: "該当するタスクがないか、閲覧権限がありません。",
            });
          }
          return;
        }
        if (!response.ok) {
          throw new Error(
            `タスク詳細の取得に失敗しました（${String(response.status)}）。`,
          );
        }
        const detail = parseTaskDetail(await response.json());
        if (!cancelled) setTask(detail);
      } catch (loadError) {
        if (!cancelled) {
          setError({
            kind: "request",
            message:
              loadError instanceof Error
                ? loadError.message
                : "タスク詳細の取得に失敗しました。",
          });
        }
      }
    }

    void loadTask();
    return () => {
      cancelled = true;
    };
  }, [taskId, reloadKey]);

  useEffect(() => {
    if (task?.id !== taskId) return;
    const controller = new AbortController();
    setEvidenceState({ taskId, state: { kind: "loading" } });

    async function loadEvidences() {
      try {
        const result = await fetchTaskEvidences(taskId, controller.signal);
        if (controller.signal.aborted) return;
        if (result.kind === "error") {
          setEvidenceState({
            taskId,
            state: {
              kind: "error",
              message: `証拠を取得できませんでした（HTTP ${String(result.status)}）。`,
            },
          });
          return;
        }
        setEvidenceState({ taskId, state: result });
      } catch {
        if (!controller.signal.aborted) {
          setEvidenceState({
            taskId,
            state: { kind: "error", message: "証拠を取得できませんでした。" },
          });
        }
      }
    }

    void loadEvidences();
    return () => {
      controller.abort();
    };
  }, [task?.id, taskId, evidenceReloadKey]);

  const visibleEvidenceState = evidenceState.taskId === taskId
    ? evidenceState.state
    : { kind: "loading" as const };
  const { steps: progressSteps, current: progressIndex } = getProgress(task?.status ?? "active");
  const isActive = task?.status === "active";

  return (
    <AppLayout showHeader={false}>
      <div className={styles["screen"]}>
        <PageHeader title="タスク詳細" backHref="/tasks" />

        {!task && !error ? (
          <Loading message="タスク詳細を読み込んでいます..." />
        ) : error ? (
          error.kind === "notFound" ? (
            <ErrorState
              title="タスクが見つかりません"
              description={error.message}
            />
          ) : (
            <ErrorState
              description={error.message}
              onRetry={() => {
                setReloadKey((key) => key + 1);
              }}
            />
          )
        ) : task ? (
          <div className={styles["content"]}>
            <section className={styles["taskCard"]}>
              <div className={styles["ownerRow"]}>
                <div className={styles["avatar"]} aria-hidden="true">
                  {task.viewer === "owner" ? "あ" : "友"}
                </div>
                <div className={styles["ownerDetails"]}>
                  <strong>{task.viewer === "owner" ? "あなた" : "フレンド"}</strong>
                  <span>{formatDate(task.createdAt, true)} に作成</span>
                </div>
                <TaskStatusBadge status={task.status} />
              </div>

              <h2 className={styles["taskTitle"]}>{task.title}</h2>
              <p className={styles["condition"]}>{task.achievementCondition}</p>

              <div className={styles["metaGrid"]}>
                <div className={styles["metaItem"]}>
                  <span className={styles["metaIcon"]} aria-hidden="true">▦</span>
                  <span className={styles["metaLabel"]}>期限</span>
                  <strong>{formatDate(task.deadlineAt, true)}</strong>
                </div>
                <div className={styles["metaItem"]}>
                  <span className={styles["metaIcon"]} aria-hidden="true">◷</span>
                  <span className={styles["metaLabel"]}>残り時間</span>
                  <strong className={isActive ? styles["accent"] : ""}>
                    {isActive ? getRemainingText(task.deadlineAt) : "—"}
                  </strong>
                </div>
                {task.penaltyAmount !== undefined && (
                  <div className={styles["metaItem"]}>
                    <span className={styles["metaIcon"]} aria-hidden="true">◎</span>
                    <span className={styles["metaLabel"]}>賭け金</span>
                    <strong>{task.penaltyAmount.toLocaleString("ja-JP")}円</strong>
                  </div>
                )}
              </div>
            </section>

            <section className={styles["conditionCard"]}>
              <div className={styles["sectionIcon"]} aria-hidden="true">◎</div>
              <div>
                <h3>達成判定方法</h3>
                <p>{task.evidenceMethod}</p>
              </div>
            </section>

            <section className={styles["panel"]}>
              <h3>進捗状況</h3>
              <ol className={styles["progress"]}>
                {progressSteps.map((step, index) => (
                  <li
                    key={step}
                    className={[
                      index < progressIndex ? styles["completed"] : "",
                      index === progressIndex ? styles["current"] : "",
                    ].filter(Boolean).join(" ")}
                    aria-current={index === progressIndex ? "step" : undefined}
                  >
                    <span className={styles["stepMarker"]}>
                      {index < progressIndex ? "✓" : index + 1}
                    </span>
                    <span className={styles["stepLabel"]}>{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className={styles["panel"]}>
              <h3>提出された証拠</h3>
              {visibleEvidenceState.kind === "loading" && (
                <div className={styles["emptyEvidence"]} role="status" aria-live="polite">
                  証拠を読み込んでいます...
                </div>
              )}
              {visibleEvidenceState.kind === "loaded" && visibleEvidenceState.evidences.length === 0 && (
                <div className={styles["emptyEvidence"]} role="status">
                  提出された証拠はありません。
                </div>
              )}
              {visibleEvidenceState.kind === "loaded" && visibleEvidenceState.evidences.length > 0 && (
                <>
                <ol className={styles["evidenceList"]}>
                  {visibleEvidenceState.evidences.map((evidence, index) => (
                    <li
                      className={styles["evidenceItem"]}
                      key={`${evidence.submittedAt}:${evidence.submissionType}:${String(index)}`}
                    >
                      <div className={styles["evidenceHeader"]}>
                        <strong>{evidence.submissionType === "initial" ? "初回提出" : "追加提出"}</strong>
                        <time dateTime={evidence.submittedAt}>{formatDate(evidence.submittedAt, true)}</time>
                      </div>
                      {evidence.photoUrls.length > 0 ? (
                        <div className={styles["evidencePhotos"]}>
                          {evidence.photoUrls.map((url, photoIndex) => (
                            <a href={url} target="_blank" rel="noopener noreferrer" key={photoIndex}>
                              {/* Signed URLs are loaded directly without image optimization. */}
                              <img src={url} alt={`${evidence.submissionType === "initial" ? "初回提出" : "追加提出"}の証拠写真${String(photoIndex + 1)}`} />
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className={styles["evidencePreviewUnavailable"]}>写真は登録されていません。</p>
                      )}
                    </li>
                  ))}
                </ol>
                <button
                  className={styles["evidenceRefresh"]}
                  type="button"
                  onClick={() => {
                    setEvidenceReloadKey((key) => key + 1);
                  }}
                >
                  画像を再読み込み
                </button>
                </>
              )}
              {visibleEvidenceState.kind === "forbidden" && (
                <div className={styles["evidenceError"]} role="alert">
                  この証拠を閲覧する権限がありません。
                </div>
              )}
              {visibleEvidenceState.kind === "error" && (
                <div className={styles["evidenceError"]} role="alert">
                  <span>{visibleEvidenceState.message}</span>
                  <button
                    className={styles["evidenceRetry"]}
                    type="button"
                    onClick={() => {
                      setEvidenceReloadKey((key) => key + 1);
                    }}
                  >
                    再試行
                  </button>
                </div>
              )}
              {task.viewer === "owner" && (isActive || task.status === "disputed") && (
                <Link
                  className={styles["submitButton"]}
                  href={`/tasks/${encodeURIComponent(task.id)}/evidence${task.status === "disputed" ? "/additional" : ""}`}
                >
                  <span aria-hidden="true">▧</span>
                  {task.status === "disputed" ? "追加証拠を提出する" : "証拠を提出する"}
                </Link>
              )}
            </section>

          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
