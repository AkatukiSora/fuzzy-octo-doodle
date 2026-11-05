"use client";

import { useEffect, useState } from "react";
import styles from "./ReviewStatusPanel.module.css";

interface ReviewStatusPanelProps {
  submittedAt: string;
  reviewEndsAt: string;
}

export function ReviewStatusPanel({
  submittedAt,
  reviewEndsAt,
}: ReviewStatusPanelProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const reviewRemaining =
    now === null ? "計算中..." : formatRemainingTime(reviewEndsAt, now);

  return (
    <section className={styles["panel"]} aria-label="提出状況">
      <div className={styles["submittedAt"]}>
        <span className={styles["clockIcon"]} aria-hidden="true">
          ◷
        </span>
        <span className={styles["submittedLabel"]}>提出日時</span>
        <time dateTime={submittedAt}>{submittedAt}</time>
      </div>

      <div className={styles["reviewCard"]}>
        <div className={styles["reviewIcon"]} aria-hidden="true">
          ◷
        </div>
        <div className={styles["reviewContent"]}>
          <p className={styles["reviewLabel"]}>
            確認期限（自動で達成確定）
          </p>
          <p className={styles["remaining"]}>{reviewRemaining}</p>
          <p className={styles["description"]}>
            この時間までに異議がなければ、タスクの達成が確定します。
          </p>
        </div>
      </div>

      <p className={styles["notice"]}>
        ※ 提出内容に問題がある場合のみ、異議申し立てを行ってください。
      </p>
    </section>
  );
}

function formatRemainingTime(reviewEndsAt: string, now: number): string {
  const endTime = Date.parse(reviewEndsAt);
  if (!Number.isFinite(endTime)) return "確認期限を確認できません";

  const difference = endTime - now;
  if (difference <= 0) return "期限切れ";

  const totalMinutes = Math.ceil(difference / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (totalHours === 0) return `あと${String(minutes)}分`;
  if (minutes === 0) return `あと${String(totalHours)}時間`;
  return `あと${String(totalHours)}時間${String(minutes)}分`;
}
