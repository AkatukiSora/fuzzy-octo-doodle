"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppLayout } from "../../../../../components/layout/AppLayout";
import { PageHeader } from "../../../../../components/layout/PageHeader";
import {
  isTaskDraft,
  TASK_COMPLETION_STORAGE_KEY,
  TASK_IDEMPOTENCY_KEY_STORAGE_KEY,
  TASK_DRAFT_STORAGE_KEY,
  type TaskDraft,
} from "../task-draft";
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
  const [skipApi, setSkipApi] = useState(false);

  const finishTaskCreation = (taskId?: string) => {
    window.sessionStorage.setItem(
      TASK_COMPLETION_STORAGE_KEY,
      JSON.stringify({ draft, ...(taskId ? { taskId } : {}) }),
    );
    window.sessionStorage.removeItem(TASK_DRAFT_STORAGE_KEY);
    window.sessionStorage.removeItem(TASK_IDEMPOTENCY_KEY_STORAGE_KEY);
    router.push("/tasks/create/complete");
  };

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

    setDraft(parsedDraft);
  }, []);

  const handleConfirm = async () => {
    if (!draft || isSubmitting) {
      return;
    }

    setSubmitError("");
    if (skipApi) {
      finishTaskCreation();
      return;
    }

    setIsSubmitting(true);

    try {
      let idempotencyKey = window.sessionStorage.getItem(
        TASK_IDEMPOTENCY_KEY_STORAGE_KEY,
      );
      if (
        idempotencyKey === null ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          idempotencyKey,
        )
      ) {
        idempotencyKey = window.crypto.randomUUID();
        window.sessionStorage.setItem(
          TASK_IDEMPOTENCY_KEY_STORAGE_KEY,
          idempotencyKey,
        );
      }

      const response = await fetch("/api/tasks", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          title: draft.title,
          achievementCondition: "写真で判定",
          evidenceMethod: "写真を1枚以上提出",
          deadlineAt: new Date(draft.deadline).toISOString(),
          penaltyAmount: Number(draft.reward),
          isPenaltyPublic: draft.visibility === "public",
          originalTaskId: null,
        }),
      });

      if (!response.ok) {
        const responseText = await response.text();
        let message = `タスクを作成できませんでした（HTTP ${String(response.status)}）。`;
        if (responseText) {
          try {
            const body: unknown = JSON.parse(responseText);
            if (
              typeof body === "object" &&
              body !== null &&
              "error" in body &&
              typeof body.error === "object" &&
              body.error !== null &&
              "message" in body.error &&
              typeof body.error.message === "string"
            ) {
              message = body.error.message;
            }
          } catch {
            // Fall back to the HTTP status when the server response is not JSON.
          }
        }
        setSubmitError(message);
        return;
      }

      const createdTask: unknown = await response.json();
      if (
        typeof createdTask !== "object" ||
        createdTask === null ||
        !("id" in createdTask) ||
        typeof createdTask.id !== "string" ||
        createdTask.id.length === 0
      ) {
        throw new Error("作成したタスクの情報を読み込めませんでした。");
      }

      finishTaskCreation(createdTask.id);
    } catch (requestError) {
      setSubmitError(
        requestError instanceof Error
          ? `タスクの作成に失敗しました: ${requestError.message}`
          : "タスクの作成に失敗しました。通信状況を確認して再度お試しください。",
      );
    } finally {
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
            <dl className={styles["details"]}>
              <div className={styles["detail"]}>
                <dt>タスク名</dt>
                <dd>{draft.title}</dd>
              </div>
              <div className={styles["detail"]}>
                <dt>詳細</dt>
                <dd>{draft.description || "未入力"}</dd>
              </div>
              <div className={styles["detail"]}>
                <dt>期限</dt>
                <dd>{formatDeadline(draft.deadline)}</dd>
              </div>
              <div className={styles["detail"]}>
                <dt>達成条件</dt>
                <dd>写真で判定</dd>
              </div>
              <div className={styles["detail"]}>
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

            <label className={styles["skipApiOption"]}>
              <input
                type="checkbox"
                checked={skipApi}
                onChange={(event) => {
                  setSkipApi(event.target.checked);
                }}
              />
              <span>
                <span className={styles["skipApiLabel"]}>
                  APIにデータを渡さず、動作だけを確認する
                </span>
                <span className={styles["skipApiDescription"]}>
                  チェック時はタスクを保存せず、確定後に一覧画面へ移動します。
                </span>
              </span>
            </label>

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
                onClick={() => {
                  window.sessionStorage.removeItem(
                    TASK_IDEMPOTENCY_KEY_STORAGE_KEY,
                  );
                }}
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
