
import type { ReactNode } from "react";
import Link from "next/link";
import { Sidebar } from "./Sidebar";
import { BottomNavigation } from "./BottomNavigation";
import styles from "./AppLayout.module.css";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  unreadCount?: number;
  showHeader?: boolean;
  headerActions?: ReactNode;
}

export function AppLayout({
  children,
  title,
  unreadCount = 0,
  showHeader = true,
  headerActions,
}: AppLayoutProps) {
  return (
    <div className={styles["layout"]}>
      <Sidebar />

      <div className={styles["contentArea"]}>
        {showHeader && (
          <header className={styles["header"]}>
            <div className={styles["headerInner"]}>
              <h1 className={styles["title"]}>
                {title ?? "Donee"}
              </h1>

              {headerActions ?? (
                <Link
                  href="/notifications"
                  className={styles["notification"]}
                  aria-label={
                    unreadCount > 0
                      ? `通知 ${String(unreadCount)}件未読`
                      : "通知"
                  }
                >
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                    <path d="M10 21h4" />
                  </svg>

                  {unreadCount > 0 && (
                    <span className={styles["notificationBadge"]}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Link>
              )}
            </div>
          </header>
        )}

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
