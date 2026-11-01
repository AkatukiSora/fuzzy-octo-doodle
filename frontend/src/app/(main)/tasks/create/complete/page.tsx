"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  isTaskDraft,
  TASK_COMPLETION_STORAGE_KEY,
  type TaskDraft,
} from "../task-draft";
import { AppLayout } from "../../../../../components/layout/AppLayout";
import styles from "./page.module.css";

interface TaskCompletion {
  draft: TaskDraft;
  taskId?: string;
}

type DetailIconName =
  | "description"
  | "details"
  | "deadline"
  | "evidence"
  | "reward"
  | "visibility";

function isTaskCompletion(value: unknown): value is TaskCompletion {
  return (
    typeof value === "object" &&
    value !== null &&
    "draft" in value &&
    isTaskDraft(value.draft) &&
    (!("taskId" in value) || typeof value.taskId === "string")
  );
}

function DetailIcon({ name }: { name: DetailIconName }) {
  switch (name) {
    case "description":
      return (
        <>
          <path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M14 3v5h5M9 13h6m-6 4h6" />
        </>
      );
    case "details":
      return (
        <>
          <path d="M5 4h14v12H9l-4 4V4Z" />
          <path d="M8 8h8m-8 4h5" />
        </>
      );
    case "deadline":
      return (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4m10-4v4M3 10h18m-12 4h2m4 0h2" />
        </>
      );
    case "evidence":
      return (
        <>
          <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v11H3V8a1 1 0 0 1 1-1Z" />
          <circle cx="12" cy="13" r="4" />
        </>
      );
    case "reward":
      return (
        <>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v5c0 1.7 3.6 3 8 3s8-1.3 8-3V5m-16 5v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5m-16 5v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4" />
        </>
      );
    case "visibility":
      return (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20v-2a6 6 0 0 1 12 0v2H3Zm14-14a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v1h-3" />
        </>
      );
  }
}

function CompletionDetail({
  icon,
  label,
  value,
  description,
}: {
  icon: DetailIconName;
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className={styles["detail"]}>
      <span className={styles["detailIcon"]} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <DetailIcon name={icon} />
        </svg>
      </span>
      <dl>
        <dt>{label}</dt>
        <dd>
          <span>{value}</span>
          {description && (
            <span className={styles["detailDescription"]}>{description}</span>
          )}
        </dd>
      </dl>
    </div>
  );
}

function formatDeadline(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export default function CreateTaskCompletePage() {
  const [completion, setCompletion] = useState<TaskCompletion | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedCompletion = window.sessionStorage.getItem(
      TASK_COMPLETION_STORAGE_KEY,
    );
    if (!storedCompletion) {
      setError("作成したタスクの情報がありません。タスク一覧からご確認ください。");
      return;
    }

    let parsedCompletion: unknown;
    try {
      parsedCompletion = JSON.parse(storedCompletion);
    } catch {
      setError("作成したタスクの情報を読み込めませんでした。");
      return;
    }

    if (!isTaskCompletion(parsedCompletion)) {
      setError("作成したタスクの情報を読み込めませんでした。");
      return;
    }

    setCompletion(parsedCompletion);
  }, []);

  const task = completion?.draft;
  const taskDetails: {
    icon: DetailIconName;
    label: string;
    value: string;
    description?: string;
  }[] = task
    ? [
          {
            icon: "details",
            label: "詳細",
            value: task.description || "詳細はありません",
          },
          {
            icon: "deadline",
            label: "期限",
            value: formatDeadline(task.deadline),
          },
          {
            icon: "evidence",
            label: "達成条件",
            value: "写真で判定",
            description: "アプリの画面のスクリーンショットを1枚以上提出する",
          },
          {
            icon: "reward",
            label: "未達成時の支払額",
            value: `${Number(task.reward).toLocaleString("ja-JP")}円`,
          },
          {
            icon: "visibility",
            label: "支払額の公開設定",
            value: task.visibility === "private" ? "公開しない" : "公開する",
            description:
              task.visibility === "private"
                ? "自分のみに表示されます"
                : "招待したフレンドに表示されます",
          },
      ]
    : [];
  const detailHref = completion?.taskId
    ? `/tasks/${encodeURIComponent(completion.taskId)}`
    : "/tasks";

  return (
    <AppLayout showHeader={false}>
      <div className={styles["screen"]}>
        <header className={styles["header"]}>
          <h1>タスク作成完了</h1>
        </header>

        {error ? (
          <p className={styles["error"]}>
            {error} <Link href="/tasks">タスク一覧へ</Link>
          </p>
        ) : task ? (
          <main className={styles["content"]}>
            <div className={styles["successIcon"]} aria-hidden="true">
              <span className={styles["sparkleTop"]} />
              <span className={styles["sparkleLeft"]} />
              <span className={styles["sparkleRight"]} />
              <span className={styles["sparkleBottomLeft"]} />
              <span className={styles["sparkleBottomRight"]} />
              <svg viewBox="0 0 64 64">
                <path d="m16 33 11 11 22-24" />
              </svg>
            </div>

            <section className={styles["message"]}>
              <h2>タスクを作成しました！</h2>
              <p>フレンドと一緒に達成を目指しましょう！</p>
            </section>

            <section
              className={styles["details"]}
              aria-label="作成したタスクの内容"
            >
              <div className={styles["taskTitle"]}>
                <span className={styles["detailIcon"]} aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <DetailIcon name="description" />
                  </svg>
                </span>
                <dl>
                  <dt>タスク名</dt>
                  <dd>{task.title}</dd>
                </dl>
              </div>
              {taskDetails.map((detail) => (
                <CompletionDetail key={detail.label} {...detail} />
              ))}
            </section>

            <div className={styles["actions"]}>
              <Link className={styles["detailButton"]} href={detailHref}>
                タスクの詳細を見る
              </Link>
              <Link className={styles["homeButton"]} href="/">
                ホームに戻る
              </Link>
            </div>
          </main>
        ) : null}
      </div>
    </AppLayout>
  );
}
