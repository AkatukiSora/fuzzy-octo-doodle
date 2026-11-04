import type { ReactNode } from "react";
import styles from "./ObjectionPageContent.module.css";

interface ObjectionPageContentProps {
  children: ReactNode;
}

export function ObjectionPageContent({
  children,
}: ObjectionPageContentProps) {
  return <main className={styles["content"]}>{children}</main>;
}
