
import type { ReactNode } from "react";
import { BottomNavigation } from "./BottomNavigation";
import styles from "./AppLayout.module.css";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  showHeader?: boolean;
  headerActions?: ReactNode;
}

export function AppLayout({
  children,
  title,
  showHeader = true,
  headerActions,
}: AppLayoutProps) {
  return (
    <div className={styles["layout"]}>
      <div className={styles["contentArea"]}>
        {showHeader && (
          <header className={styles["header"]}>
            <div className={styles["headerInner"]}>
              <h1 className={styles["title"]}>
                {title ?? "Donee"}
              </h1>

              {headerActions}
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
