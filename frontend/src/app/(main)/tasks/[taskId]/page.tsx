"use client";

import { use, useEffect, useState } from "react";
import { AppLayout } from "../../../../components/layout/AppLayout";
import { PageHeader } from "../../../../components/layout/PageHeader";
import { TaskStatusBadge } from "../../../../components/tasks/TaskStatusBadge";
import { ErrorState } from "../../../../components/ui/ErrorState";
import { Loading } from "../../../../components/ui/Loading";
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
  penaltyAmount?: number;
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
    ...(typeof value["penaltyAmount"] === "number"
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

function getProgressIndex(status: TaskStatus): number {
  switch (status) {
    case "active":
      return 1;
    case "reviewing":
    case "disputed":
      return 3;
    case "success":
      return 4;
    case "failed":
    case "indeterminate":
    case "closed":
      return 4;
  }
}

const progressSteps = ["タスク作成", "挑戦中", "証拠提出", "審査中", "完了"];

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = use(params);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
        if (!response.ok) {
          throw new Error(
            `タスク詳細の取得に失敗しました（${String(response.status)}）。`,
          );
        }
        const detail = parseTaskDetail(await response.json());
        if (!cancelled) setTask(detail);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "タスク詳細の取得に失敗しました。",
          );
        }
      }
    }

    void loadTask();
    return () => {
      cancelled = true;
    };
  }, [taskId, reloadKey]);

  const progressIndex = task ? getProgressIndex(task.status) : 0;
  const isActive = task?.status === "active";

  return (
    <AppLayout showHeader={false}>
      <div className={styles["screen"]}>
        <PageHeader title="タスク詳細" backHref="/tasks" />

        {!task && !error ? (
          <Loading message="タスク詳細を読み込んでいます..." />
        ) : error ? (
          <ErrorState
            description={error}
            onRetry={() => {
              setReloadKey((key) => key + 1);
            }}
          />
        ) : task ? (
          <main className={styles["content"]}>
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
              <div className={styles["emptyEvidence"]}>
                <span className={styles["imageIcon"]} aria-hidden="true">▧</span>
                <span>
                  {isActive
                    ? "まだ証拠が提出されていません"
                    : "証拠の提出状況を確認中です"}
                </span>
              </div>
              {isActive && task.viewer === "owner" && (
                <button className={styles["submitButton"]} type="button" disabled>
                  <span aria-hidden="true">▧</span>
                  証拠を提出する
                </button>
              )}
            </section>

            <section className={styles["panel"]}>
              <h3>応援・リアクション</h3>
              <div className={styles["reactions"]} aria-label="リアクション">
                <span><span aria-hidden="true">❤️</span> 0</span>
                <span><span aria-hidden="true">🔥</span> 0</span>
                <span><span aria-hidden="true">🎉</span> 0</span>
                <span><span aria-hidden="true">😀</span> 0</span>
              </div>
            </section>

            <section className={styles["comments"]}>
              <h3>コメント</h3>
              <p>コメントはまだありません。</p>
            </section>
          </main>
        ) : null}
      </div>
    </AppLayout>
  );
}
