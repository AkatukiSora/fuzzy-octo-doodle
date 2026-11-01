"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "../../../../../../components/layout/AppLayout";
import { PageHeader } from "../../../../../../components/layout/PageHeader";
import { TaskStatusBadge } from "../../../../../../components/tasks/TaskStatusBadge";
import { ErrorState } from "../../../../../../components/ui/ErrorState";
import { Loading } from "../../../../../../components/ui/Loading";
import type { TaskStatus } from "../../../../../../types/task";
import styles from "./page.module.css";

interface SubmittedEvidence {
  task: {
    id: string;
    title: string;
    deadlineAt: string;
    status: TaskStatus;
  };
  evidences: {
    submissionType: "initial" | "additional";
    submittedAt: string;
    photoUrls: string[];
  }[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTaskStatus(value: string): value is TaskStatus {
  return taskStatuses.some((status) => status === value);
}

function parsePhotoUrls(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((url: unknown): url is string => typeof url === "string")
  ) {
    throw new Error("提出結果の形式が正しくありません。");
  }
  return value;
}

function parseSubmittedEvidence(
  taskValue: unknown,
  evidenceValue: unknown,
): SubmittedEvidence {
  if (
    !isRecord(taskValue) ||
    !isRecord(evidenceValue) ||
    !Array.isArray(evidenceValue["evidences"])
  ) {
    throw new Error("提出結果の形式が正しくありません。");
  }

  const task = taskValue;
  if (
    typeof task["id"] !== "string" ||
    typeof task["title"] !== "string" ||
    typeof task["deadlineAt"] !== "string" ||
    typeof task["status"] !== "string" ||
    !isTaskStatus(task["status"]) ||
    Number.isNaN(Date.parse(task["deadlineAt"]))
  ) {
    throw new Error("提出結果の形式が正しくありません。");
  }

  return {
    task: {
      id: task["id"],
      title: task["title"],
      deadlineAt: task["deadlineAt"],
      status: task["status"],
    },
    evidences: evidenceValue["evidences"].map((item: unknown) => {
      if (
        !isRecord(item) ||
        (item["submissionType"] !== "initial" &&
          item["submissionType"] !== "additional") ||
        typeof item["submittedAt"] !== "string" ||
        Number.isNaN(Date.parse(item["submittedAt"]))
      ) {
        throw new Error("提出結果の形式が正しくありません。");
      }

      return {
        submissionType: item["submissionType"],
        submittedAt: item["submittedAt"],
        photoUrls: parsePhotoUrls(item["photoUrls"]),
      };
    }),
  };
}

function formatDeadline(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function getStatusDescription(status: TaskStatus): string {
  switch (status) {
    case "active":
      return "タスクの進行状況を確認してください。";
    case "reviewing":
      return "フレンドが証拠を確認すると、タスクの達成が確定します。";
    case "disputed":
      return "タスクに異議が申し立てられています。";
    case "success":
      return "タスクの達成が確定しました。";
    case "failed":
      return "タスクは失敗となりました。";
    case "indeterminate":
      return "タスクの達成を判定できませんでした。";
    case "closed":
      return "タスクは終了しました。";
  }
}

export default function EvidenceSubmittedPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = use(params);
  const [result, setResult] = useState<SubmittedEvidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(null);

    async function loadResult() {
      try {
        const [taskResponse, evidenceResponse] = await Promise.all([
          fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
            credentials: "include",
          }),
          fetch(`/api/tasks/${encodeURIComponent(taskId)}/evidences`, {
            credentials: "include",
          }),
        ]);
        if (!taskResponse.ok || !evidenceResponse.ok) {
          throw new Error(
            `提出結果を取得できませんでした（${String(
              !taskResponse.ok ? taskResponse.status : evidenceResponse.status,
            )}）。`,
          );
        }
        const task: unknown = await taskResponse.json();
        const evidences: unknown = await evidenceResponse.json();
        const submittedEvidence = parseSubmittedEvidence(task, evidences);
        if (!cancelled) setResult(submittedEvidence);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "提出結果を取得できませんでした。",
          );
        }
      }
    }

    void loadResult();
    return () => {
      cancelled = true;
    };
  }, [taskId, reloadKey]);

  return (
    <AppLayout showHeader={false}>
      <div className={styles["screen"]}>
        <PageHeader
          title="証拠提出完了"
          backHref={`/tasks/${encodeURIComponent(taskId)}`}
        />

        {!result && !error ? (
          <Loading message="提出結果を読み込んでいます..." />
        ) : error ? (
          <ErrorState
            description={error}
            onRetry={() => {
              setReloadKey((key) => key + 1);
            }}
          />
        ) : result ? (
          <main className={styles["content"]}>
            <section className={styles["successMessage"]} aria-live="polite">
              <svg
                className={styles["successIcon"]}
                viewBox="0 0 96 96"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="48" cy="48" r="36" />
                <path d="m31 49 12 12 23-25" />
                <path d="m14 22-6-6m74 6 6-6M13 68l-7 5m77-5 7 5M48 5v-4" />
              </svg>
              <h2>証拠を提出しました！</h2>
              <p>フレンドの確認を待っています。</p>
            </section>

            <section className={styles["taskSummary"]} aria-label="提出したタスク">
              <span className={styles["taskLabel"]}>タスク名</span>
              <h3 className={styles["taskTitle"]}>{result.task.title}</h3>
              <p className={styles["deadline"]}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M7 3v4m10-4v4M3 10h18" />
                </svg>
                <span>期限 {formatDeadline(result.task.deadlineAt)}</span>
              </p>
            </section>

            <section className={styles["evidenceCard"]}>
              <div className={styles["evidenceHeading"]}>
                <h3>提出した証拠写真</h3>
                <span>
                  {result.evidences.reduce(
                    (count, evidence) => count + evidence.photoUrls.length,
                    0,
                  )}枚
                </span>
              </div>
              <div className={styles["photoGrid"]}>
                {result.evidences
                  .flatMap((evidence) => evidence.photoUrls)
                  .map((photoUrl, index) => (
                    <img
                      key={`${photoUrl}-${String(index)}`}
                      src={photoUrl}
                      alt={`提出した証拠写真 ${String(index + 1)}`}
                      className={styles["photo"]}
                    />
                  ))}
              </div>
            </section>

            <section className={styles["statusCard"]}>
              <span className={styles["statusIcon"]} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </span>
              <div className={styles["statusDetails"]}>
                <span className={styles["statusLabel"]}>現在のステータス</span>
                <TaskStatusBadge status={result.task.status} />
                <p>{getStatusDescription(result.task.status)}</p>
              </div>
            </section>

            <Link
              className={styles["backLink"]}
              href={`/tasks/${encodeURIComponent(result.task.id)}`}
            >
              タスク詳細に戻る
            </Link>
          </main>
        ) : null}
      </div>
    </AppLayout>
  );
}
