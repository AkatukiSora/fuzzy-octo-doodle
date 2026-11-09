import type { ReactNode } from "react";
import { AppLayout } from "./AppLayout";
import { PageHeader } from "./PageHeader";
import styles from "./ProfilePageLayout.module.css";

interface Props {
  title: string;
  backHref?: string;
  children: ReactNode;
}

/** マイページとプロフィール編集のヘッダー・外側余白・セクション間隔を統一する。 */
export function ProfilePageLayout({ title, backHref, children }: Props) {
  return (
    <AppLayout showHeader={false}>
      <div className={styles["header"]}>
        <div className={styles["headerInner"]}>
          {backHref ? <PageHeader title={title} backHref={backHref} /> : (
            <header className={styles["rootHeader"]}><h1>{title}</h1></header>
          )}
        </div>
      </div>
      <div className={styles["content"]}>{children}</div>
    </AppLayout>
  );
}
