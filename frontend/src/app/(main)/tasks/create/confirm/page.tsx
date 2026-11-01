"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "../../../../../components/layout/AppLayout";
import { PageHeader } from "../../../../../components/layout/PageHeader";
import {
  isTaskDraft,
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
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [error, setError] = useState("");

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

            <div className={styles["actions"]}>
              <button type="button" className={styles["confirmButton"]}>
                確定
              </button>
              <Link href="/tasks/create" className={styles["editButton"]}>
                変更
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
