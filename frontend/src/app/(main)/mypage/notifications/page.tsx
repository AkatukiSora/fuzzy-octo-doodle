import { ProfilePageLayout } from "../../../../components/layout/ProfilePageLayout";
import styles from "./NotificationSettings.module.css";

const notificationSettings = [
  {
    id: "web-push",
    title: "Web Push通知",
    description: "タスクの期限やフレンドからのお知らせを、ブラウザの通知で受け取れます。",
    icon: "bell",
  },
  {
    id: "task-reminder",
    title: "24時間タスク未作成リマインド",
    description: "24時間タスクを作成していない場合に、新しいタスクの作成をお知らせします。",
    icon: "check",
  },
] as const;

function SettingIcon({ name }: { name: "bell" | "check" | "moon" }) {
  return (
    <span className={styles["icon"]}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {name === "bell" && <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />}
        {name === "check" && <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="m8 12 3 3 5-6" /></>}
        {name === "moon" && <path d="M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z" />}
      </svg>
    </span>
  );
}

export default function NotificationSettingsPage() {
  return (
    <ProfilePageLayout title="通知設定" backHref="/mypage">
      <p className={styles["notice"]}>通知機能は準備中です。現在、通知は送信されず、設定の変更もできません。</p>
      {notificationSettings.map(setting => (
        <section key={setting.id} className={styles["card"]} aria-labelledby={`${setting.id}-title`}>
          <SettingIcon name={setting.icon} />
          <div className={styles["body"]}>
            <h2 id={`${setting.id}-title`}>{setting.title}</h2>
            <p id={`${setting.id}-description`}>{setting.description}</p>
            <span id={`${setting.id}-status`} className={styles["badge"]}>準備中</span>
          </div>
          <div className={styles["switchControl"]}>
            {/* API接続後に実際の設定値・保存処理を追加する。現在は有効化や保存を行わない。 */}
            <button
              type="button"
              role="switch"
              aria-checked={false}
              aria-labelledby={`${setting.id}-title`}
              aria-describedby={`${setting.id}-description ${setting.id}-status`}
              className={styles["switch"]}
              disabled
            ><span /></button>
            <span className={styles["off"]} aria-hidden="true">OFF</span>
          </div>
        </section>
      ))}
      <section className={styles["card"]} aria-labelledby="quiet-hours-title">
        <SettingIcon name="moon" />
        <div className={styles["body"]}>
          <h2 id="quiet-hours-title">静音時間</h2>
          <p className={styles["time"]}><time dateTime="22:00">22:00</time> ～ <time dateTime="08:00">08:00</time></p>
          <span className={styles["badge"]}>変更不可</span>
          <p>通知機能の提供後は、この時間帯の通知を控えます。現在は通知機能を準備中です。</p>
        </div>
      </section>
    </ProfilePageLayout>
  );
}
