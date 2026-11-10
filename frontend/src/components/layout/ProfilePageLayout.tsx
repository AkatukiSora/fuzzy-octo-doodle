import type { ReactNode } from "react";
import { AppLayout } from "./AppLayout";
import { PageHeader } from "./PageHeader";
import { AppHeader } from "./AppHeader";
import styles from "./ProfilePageLayout.module.css";

interface Props {
  title: string;
  backHref?: string;
  children: ReactNode;
}

/** マイページとプロフィール編集のヘッダー・外側余白・セクション間隔を統一する。 */
export function ProfilePageLayout({ title, backHref, children }: Props) {
  return (
    <AppLayout
      showHeader={false}
      customHeader={!backHref ? <AppHeader title={title} /> : undefined}
    >
      {backHref && (
        <div className={styles["header"]}>
          <div className={styles["headerInner"]}>
            <PageHeader title={title} backHref={backHref} />
          </div>
        </div>
      )}
      <div className={styles["content"]}>{children}</div>
    </AppLayout>
  );
}
