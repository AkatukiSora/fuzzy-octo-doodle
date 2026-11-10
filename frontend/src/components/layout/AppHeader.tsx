import type { ReactNode } from "react";
import styles from "./AppHeader.module.css";

interface AppHeaderProps {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function AppHeader({ title, actions, children }: AppHeaderProps) {
  return (
    <header className={styles["header"]}>
      <div className={styles["inner"]}>
        <h1 className={styles["title"]}>{title}</h1>
        {actions && <div className={styles["actions"]}>{actions}</div>}
      </div>
      {children}
    </header>
  );
}
