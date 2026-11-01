
import { Badge } from "../ui/Badge";
import type { TaskStatus } from "../../types/task";
import styles from "./TaskStatusBadge.module.css";

interface TaskStatusBadgeProps {
  status: TaskStatus;
}

const statusConfig = {
  active: {
    label: "挑戦中",
    variant: "primary",
  },
  reviewing: {
    label: "審査中",
    variant: "review",
  },
  disputed: {
    label: "異議あり",
    variant: "warning",
  },
  success: {
    label: "達成済み",
    variant: "success",
  },
  failed: {
    label: "失敗",
    variant: "danger",
  },
  indeterminate: {
    label: "判定不能",
    variant: "neutral",
  },
  closed: {
    label: "終了",
    variant: "neutral",
  },
} as const;

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className={styles["badge"]}>
      {config.label}
    </Badge>
  );
}
