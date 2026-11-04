import type { ReactNode } from "react";
import styles from "./ObjectionCompleteContent.module.css";

interface ObjectionCompleteContentProps {
  children: ReactNode;
}

export function ObjectionCompleteContent({
  children,
}: ObjectionCompleteContentProps) {
  return <main className={styles["content"]}>{children}</main>;
}
