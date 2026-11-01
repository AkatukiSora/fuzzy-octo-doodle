"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "../../../../../components/layout/AppLayout";
import { PageHeader } from "../../../../../components/layout/PageHeader";
import { AdditionalEvidenceNotice } from "../../../../../components/tasks/AdditionalEvidenceNotice";
import { ImageUploader } from "../../../../../components/ui/ImageUploader";
import { ErrorState } from "../../../../../components/ui/ErrorState";
import { Loading } from "../../../../../components/ui/Loading";
import type { TaskStatus } from "../../../../../types/task";
import styles from "./page.module.css";

interface EvidenceTask {
  id: string;
  title: string;
  deadlineAt: string;
  status: TaskStatus;
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

function isTaskStatus(value: string): value is TaskStatus {
  return taskStatuses.some((status) => status === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEvidenceTask(value: unknown): EvidenceTask {
  if (
    !isRecord(value) ||
    typeof value["id"] !== "string" ||
    typeof value["title"] !== "string" ||
    typeof value["deadlineAt"] !== "string" ||
    typeof value["status"] !== "string" ||
    !isTaskStatus(value["status"]) ||
    Number.isNaN(Date.parse(value["deadlineAt"]))
  ) {
    throw new Error("タスク詳細の形式が正しくありません。");
  }

  return {
    id: value["id"],
    title: value["title"],
    deadlineAt: value["deadlineAt"],
    status: value["status"],
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

export default function EvidenceSubmissionPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = use(params);
  const router = useRouter();
  const [task, setTask] = useState<EvidenceTask | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const isAdditionalEvidence = task?.status === "disputed";

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
        const detail = parseEvidenceTask(await response.json());
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

  function submitEvidence() {
    if (images.length === 0) return;
    router.push(`/tasks/${encodeURIComponent(taskId)}/evidence/complete`);
  }

  return (
    <AppLayout showHeader={false}>
      <div className={styles["screen"]}>
        <PageHeader
          title={isAdditionalEvidence ? "追加証拠の提出" : "証拠提出"}
          backHref={`/tasks/${encodeURIComponent(taskId)}`}
        />

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
            <section className={styles["taskSummary"]} aria-label="提出するタスク">
              <span className={styles["taskLabel"]}>タスク名</span>
              <h2 className={styles["taskTitle"]}>{task.title}</h2>
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
                <span>期限 {formatDeadline(task.deadlineAt)}</span>
              </p>
            </section>

            {isAdditionalEvidence && <AdditionalEvidenceNotice />}

            <div className={styles["form"]}>
              <ImageUploader
                images={images}
                onChange={setImages}
                maxImages={3}
                required
                label="証拠写真"
                description="タスクを実施したことがわかる写真を1〜3枚まで選択してください。"
              />

              <div className={styles["memoField"]}>
                <label className={styles["memoLabel"]} htmlFor="evidence-memo">
                  メモ <span>（任意）</span>
                </label>
                <div className={styles["memoInputWrap"]}>
                  <textarea
                    id="evidence-memo"
                    className={styles["memoInput"]}
                    value={memo}
                    maxLength={200}
                    onChange={(event) => {
                      setMemo(event.target.value);
                    }}
                    placeholder="補足があれば入力してください"
                  />
                  <span className={styles["memoCount"]} aria-live="polite">
                    {memo.length} / 200
                  </span>
                </div>
              </div>

              <button
                className={styles["submitButton"]}
                type="button"
                disabled={images.length === 0}
                onClick={submitEvidence}
              >
                {isAdditionalEvidence ? "追加の証拠を提出" : "提出する"}
              </button>
            </div>
          </main>
        ) : null}
      </div>
    </AppLayout>
  );
}
