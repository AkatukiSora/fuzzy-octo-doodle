import type { ReactNode } from "react";
import styles from "./ObjectionConfirmContent.module.css";

interface ObjectionConfirmContentProps {
  children: ReactNode;
}

export function ObjectionConfirmContent({
  children,
}: ObjectionConfirmContentProps) {
  return <main className={styles["content"]}>{children}</main>;
}
