
"use client";

import { useState } from "react";
import type { TaskStatus } from "../../types/task";
import { TaskStatusBadge } from "./TaskStatusBadge";
import styles from "./TaskCard.module.css";

interface TaskCardProps {
  title: string;
  description?: string;
  deadline: string;
  status: TaskStatus;
  remainingText?: string;
  onClick?: () => void;
  onMenuClick?: () => void;
}

const statusIcon: Record<TaskStatus, string> = {
  active: "○",
  reviewing: "◷",
  disputed: "!",
  success: "✓",
  failed: "×",
  indeterminate: "?",
  closed: "−",
};

export function TaskCard({
  title,
  description,
  deadline,
  status,
  remainingText,
  onClick,
  onMenuClick,
}: TaskCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <article className={styles["card"]}>
      <span
        className={`${styles["statusIcon"] ?? ""} ${styles[status] ?? ""}`}
        aria-hidden="true"
      >
        {statusIcon[status]}
      </span>

      <div className={styles["content"]}>
        <div className={styles["heading"]}>
          {onClick ? (
            <button
              type="button"
              className={styles["titleButton"]}
              onClick={onClick}
            >
              {title}
            </button>
          ) : (
            <h3 className={styles["title"]}>{title}</h3>
          )}

          <TaskStatusBadge status={status} />
        </div>

        {description && (
          <p className={styles["description"]}>{description}</p>
        )}

        <div className={styles["meta"]}>
          <span className={styles["deadline"]}>
            <span aria-hidden="true">▦</span>
            {deadline}
          </span>

          {remainingText && (
            <span
              className={
                status === "reviewing"
                  ? styles["reviewTime"]
                  : styles["remainingTime"]
              }
            >
              {remainingText}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        className={styles["menuButton"]}
        onClick={() => {
          setMenuOpen((open) => !open);
          onMenuClick?.();
        }}
        aria-label={`${title}のメニューを開く`}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        ⋯
      </button>

      {menuOpen && onClick && (
        <div className={styles["menu"]} role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onClick();
            }}
          >
            詳細を見る
          </button>
        </div>
      )}
    </article>
  );
}
