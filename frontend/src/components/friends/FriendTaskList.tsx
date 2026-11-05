"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./FriendTaskList.module.css";
import type { FriendTask } from "./friend.types";

export type { FriendTask } from "./friend.types";

interface FriendTaskListProps {
  tasks: FriendTask[];
}

export function FriendTaskList({ tasks }: FriendTaskListProps) {
  const [sortOrder, setSortOrder] = useState<"soonest" | "latest">("soonest");
  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const difference = Date.parse(a.deadline) - Date.parse(b.deadline);
        return sortOrder === "soonest" ? difference : -difference;
      }),
    [tasks, sortOrder],
  );

  return (
    <section className={styles["section"]} aria-labelledby="friend-tasks-title">
      <div className={styles["heading"]}>
        <h2 id="friend-tasks-title" className={styles["title"]}>進行中のタスク</h2>
        <label className={styles["sort"]}>
          <span className={styles["visuallyHidden"]}>並び順</span>
          <select
            value={sortOrder}
            onChange={(event) => {
              setSortOrder(event.target.value as "soonest" | "latest");
            }}
          >
            <option value="soonest">期限が近い順</option>
            <option value="latest">期限が遠い順</option>
          </select>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m3 6 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </label>
      </div>

      <ul className={styles["list"]}>
        {sortedTasks.map((task) => (
          <li key={task.id}>
            {task.href ? (
              <Link className={styles["task"]} href={task.href}>
                <TaskContent title={task.title} deadline={task.deadline} />
              </Link>
            ) : (
              <article className={styles["task"]}>
                <TaskContent title={task.title} deadline={task.deadline} />
              </article>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TaskContent({ title, deadline }: Pick<FriendTask, "title" | "deadline">) {
  return (
    <>
      <div className={styles["taskInfo"]}>
        <h3 className={styles["taskTitle"]}>{title}</h3>
        <p className={styles["deadline"]}>
          <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect x="2.5" y="4" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5.5 2.5v3M12.5 2.5v3M3 7h12M5.5 9.5h2M9 9.5h2M5.5 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {formatDeadline(deadline)}
        </p>
      </div>
    </>
  );
}

function formatDeadline(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const dateText = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const timeText = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);

  return `${dateText} ${timeText}`;
}
