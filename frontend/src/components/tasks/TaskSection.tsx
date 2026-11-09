
import type { ReactNode } from "react";
import styles from "./TaskSection.module.css";

type TaskSectionStatus =
  | "active"
  | "reviewing"
  | "success"
  | "failed"
  | "other";

interface TaskSectionProps {
  status: TaskSectionStatus;
  count: number;
  children: ReactNode;
}

const sectionConfig = {
  active: "進行中",
  reviewing: "審査中",
  success: "完了",
  failed: "未達成",
  other: "その他",
};

export function TaskSection({
  status,
  count,
  children,
}: TaskSectionProps) {
  return (
    <section className={styles["section"]}>
      <div className={styles["header"]}>
        <span
          className={`${styles["accent"] ?? ""} ${styles[status] ?? ""}`}
          aria-hidden="true"
        />

        <h2 className={styles["title"]}>
          {sectionConfig[status]}
        </h2>

        <span className={styles["count"]}>
          {count}
        </span>
      </div>

      <div className={styles["taskList"]}>
        {children}
      </div>
    </section>
  );
}
