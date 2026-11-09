import { ProfilePageLayout } from "../../../../components/layout/ProfilePageLayout";
import styles from "./AccountSettings.module.css";

function EmailSettings({ email }: { email: string | null }) {
  return (
    <section className={styles["card"]} aria-labelledby="email-title">
      <h2 id="email-title">メールアドレス</h2>
      <dl className={styles["currentEmail"]}>
        <dt>現在のメールアドレス</dt>
        <dd>{email ?? "現在、メールアドレスを表示できません。"}</dd>
      </dl>
      <button type="button" className={styles["settingItem"]} disabled>
        <span>メールアドレスを変更</span>
        <span className={styles["badge"]}>準備中</span>
      </button>
      <p className={styles["description"]}>メールアドレスの変更機能は準備中です。</p>
    </section>
  );
}

export default function AccountSettingsPage() {
  return (
    <ProfilePageLayout title="アカウント設定" backHref="/mypage">
      {/* 現在のプロフィールAPIにメールアドレスは含まれない。取得APIの追加後に実値を渡す。 */}
      <EmailSettings email={null} />
      <section className={styles["card"]} aria-labelledby="password-title">
        <h2 id="password-title">パスワード</h2>
        <button type="button" className={styles["settingItem"]} disabled>
          <span>パスワードを変更</span>
          <span className={styles["badge"]}>準備中</span>
        </button>
        <p className={styles["description"]}>パスワードの変更機能は準備中です。</p>
        <div className={styles["help"]}>
          <h3>パスワードを忘れた場合</h3>
          <p>パスワード再設定メールの送信機能は準備中です。現在、この画面から再設定はできません。</p>
        </div>
      </section>
    </ProfilePageLayout>
  );
}
