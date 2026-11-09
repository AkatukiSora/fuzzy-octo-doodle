"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppLayout } from "../../../../../components/layout/AppLayout";
import { PageHeader } from "../../../../../components/layout/PageHeader";
import {
  isTaskDraft,
  TASK_DRAFT_STORAGE_KEY,
  submitTaskDraft,
  validateTaskDraft,
  type TaskDraft,
} from "../../../../../lib/taskDraft";
import styles from "./page.module.css";

function formatDeadline(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ConfirmTaskPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    const storedDraft = window.sessionStorage.getItem(TASK_DRAFT_STORAGE_KEY);
    if (!storedDraft) {
      setError("確認する入力内容がありません。入力画面からやり直してください。");
      return;
    }

    let parsedDraft: unknown;
    try {
      parsedDraft = JSON.parse(storedDraft);
    } catch {
      setError("入力内容を読み込めませんでした。入力画面からやり直してください。");
      return;
    }

    if (!isTaskDraft(parsedDraft)) {
      setError("入力内容を読み込めませんでした。入力画面からやり直してください。");
      return;
    }

    const validationError = validateTaskDraft(parsedDraft);
    if (validationError !== null) {
      setError(`${validationError} 入力画面で修正してください。`);
      return;
    }

    setDraft(parsedDraft);
  }, []);

  const handleConfirm = async () => {
    if (!draft || isSubmittingRef.current) {
      return;
    }

    setSubmitError("");
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const result = await submitTaskDraft(draft, {
        storage: window.sessionStorage,
        createUUID: () => window.crypto.randomUUID(),
        send: (payload, idempotencyKey) => fetch("/api/tasks", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(payload),
        }),
      });

      if (result.kind === "invalid") {
        setDraft(null);
        setError(`${result.message} 入力画面で修正してください。`);
        return;
      }
      if (result.kind === "failed") {
        setSubmitError(result.message);
        return;
      }
      router.push("/tasks");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <AppLayout showHeader={false}>
      <div className={styles["screen"]}>
        <PageHeader title="入力内容の確認" backHref="/tasks/create" />

        {error ? (
          <p className={styles["error"]}>
            {error} <Link href="/tasks/create">入力画面へ</Link>
          </p>
        ) : draft ? (
          <div className={styles["confirmationCard"]}>
            <section className={styles["summaryGroup"]} aria-labelledby="task-summary-heading">
              <h2 id="task-summary-heading" className={styles["groupTitle"]}>タスク内容</h2>
              <dl className={styles["details"]}>
                <div className={[styles["detail"], styles["taskTitle"]].join(" ")}>
                  <dt>タスク名</dt>
                  <dd>{draft.title}</dd>
                </div>
                <div className={styles["detail"]}>
                  <dt>達成条件</dt>
                  <dd>{draft.description || "未入力"}</dd>
                </div>
              </dl>
            </section>
            <section className={styles["detailGroup"]} aria-labelledby="task-method-heading">
              <h2 id="task-method-heading" className={styles["groupTitle"]}>期限・提出方法</h2>
              <dl className={[styles["details"], styles["detailGrid"]].join(" ")}>
                <div className={styles["detail"]}>
                  <dt>期限</dt>
                  <dd>{formatDeadline(draft.deadline)}</dd>
                </div>
                <div className={styles["detail"]}>
                  <dt>証拠提出方法</dt>
                  <dd>写真で判定</dd>
                </div>
              </dl>
            </section>
            <section className={styles["detailGroup"]} aria-labelledby="task-reward-heading">
              <h2 id="task-reward-heading" className={styles["groupTitle"]}>金額・公開設定</h2>
              <dl className={styles["details"]}>
                <div className={[styles["detail"], styles["reward"]].join(" ")}>
                  <dt>金額設定</dt>
                  <dd>{draft.reward}円</dd>
                </div>
                <div className={styles["detail"]}>
                  <dt>金額の公開設定</dt>
                  <dd>
                    {draft.visibility === "private"
                      ? "公開しない（自分のみに表示）"
                      : "公開する（招待したフレンドに表示）"}
                  </dd>
                </div>
              </dl>
            </section>

            <div className={styles["actions"]}>
              <button
                type="button"
                className={styles["confirmButton"]}
                onClick={() => {
                  void handleConfirm();
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? "送信中..." : "確定"}
              </button>
              <Link
                href="/tasks/create"
                className={styles["editButton"]}
              >
                変更
              </Link>
            </div>
            {submitError && (
              <p className={styles["error"]} role="alert">
                {submitError}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
