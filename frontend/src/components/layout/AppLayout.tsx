
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { BottomNavigation } from "./BottomNavigation";
import { AppHeader } from "./AppHeader";
import styles from "./AppLayout.module.css";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  showHeader?: boolean;
  headerActions?: ReactNode;
  customHeader?: ReactNode;
}

export function AppLayout({
  children,
  title,
  showHeader = true,
  headerActions,
  customHeader,
}: AppLayoutProps) {
  return (
    <div className={styles["layout"]}>
      <Sidebar />

      <div className={styles["contentArea"]}>
        {customHeader ?? (showHeader && (
          <AppHeader title={title ?? "Donee"} actions={headerActions} />
        ))}

        <main
          className={[
            styles["main"],
            !showHeader ? styles["mainFullWidth"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </main>
      </div>

      <BottomNavigation />
    </div>
  );
}
