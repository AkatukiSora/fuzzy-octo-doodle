"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppLayout } from "../../../components/layout/AppLayout";
import { fetchProfile, readStoredAvatar } from "../../../lib/profileApi";
import styles from "./MyPage.module.css";

const settings = [
  {
    label: "アカウント設定",
    description: "メールアドレス・パスワードなどの設定ができます。",
    href: "/mypage/settings",
    icon: "account",
  },
  {
    label: "通知設定",
    description: "通知の受け取り方を設定できます。",
    href: "/mypage/settings/notifications",
    icon: "bell",
  },
  {
    label: "決済履歴",
    description: "準備中",
    href: null,
    icon: "payment",
  },
  {
    label: "ヘルプ・お問い合わせ",
    description: "使い方や不具合について確認できます。",
    href: "/help",
    icon: "help",
  },
  {
    label: "利用規約",
    description: "",
    href: "/terms",
    icon: "document",
  },
  {
    label: "プライバシーポリシー",
    description: "",
    href: "/privacy",
    icon: "shield",
  },
] as const;

function SettingIcon({ name }: { name: (typeof settings)[number]["icon"] }) {
  const paths = {
    payment: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h4" />
      </>
    ),
    account: (
      <>
        <rect x="6" y="4" width="12" height="17" rx="2" />
        <path d="M9 2h6M9 9h6M9 13h4M9 17h3" />
      </>
    ),
    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.7 9a2.4 2.4 0 1 1 3.8 1.9c-1 .7-1.5 1.1-1.5 2.6M12 17h.01" />
      </>
    ),
    document: (
      <>
        <path d="M6 3h8l4 4v14H6zM14 3v5h4M9 13h6M9 17h6" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 7 3v5c0 4.5-2.8 8.2-7 10-4.2-1.8-7-5.5-7-10V6z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export default function MyPage() {
  const [nickname, setNickname] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    setAvatarUrl(readStoredAvatar());
    fetchProfile()
      .then((profile) => {
        setNickname(profile.nickname);
      })
      .catch(() => {
        setProfileError("プロフィールを取得できませんでした。");
      });
  }, []);

  return (
    <AppLayout showHeader={false}>
      <div className={styles["page"]}>
        <header className={styles["pageHeader"]}>
          <h1>マイページ</h1>
        </header>

        <section className={styles["profileCard"]} aria-label="プロフィール">
          <div className={styles["avatar"]} aria-hidden="true">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" />
            ) : (
              "🐱"
            )}
          </div>
          <div className={styles["profileName"]}>
            <strong>{nickname ?? "読み込み中..."}</strong>
            <span>@riku_123</span>
          </div>
          {profileError && <p role="alert">{profileError}</p>}
          <Link href="/mypage/profile/edit" className={styles["editLink"]}>
            プロフィールを編集 <span aria-hidden="true">›</span>
          </Link>
        </section>

        <section className={styles["statsCard"]} aria-labelledby="stats-title">
          <h2 id="stats-title">今までのタスク状況</h2>
          <div className={styles["stats"]}>
            <div className={styles["achievement"]}>
              <span className={styles["statLabel"]}>達成率</span>
              <div className={styles["progress"]}>
                <span>70%</span>
                <small>14 / 20</small>
              </div>
            </div>
            <div className={styles["stat"]}>
              <span className={styles["statLabel"]}>達成件数</span>
              <strong>14 <small>件</small></strong>
              <span className={styles["statSub"]}>/ 20 件</span>
            </div>
            <div className={[styles["stat"], styles["overdue"]].join(" ")}>
              <span className={styles["statLabel"]}>期限切れ件数</span>
              <strong>3 <small>件</small></strong>
            </div>
          </div>
        </section>

        <nav className={styles["settingsList"]} aria-label="マイページ設定">
          {settings.map((setting) => {
            const content = <>
              <span className={styles["settingIcon"]}>
                <SettingIcon name={setting.icon} />
              </span>
              <span className={styles["settingText"]}>
                <strong>{setting.label}</strong>
                {setting.description && <small>{setting.description}</small>}
              </span>
            </>;
            return setting.href === null ? (
              <div key={setting.label} className={styles["settingItem"]} aria-disabled="true">
                {content}
              </div>
            ) : (
              <Link key={setting.label} href={setting.href} className={styles["settingItem"]}>
                {content}
                <span className={styles["chevron"]} aria-hidden="true">›</span>
              </Link>
            );
          })}
          <Link
            href="/login"
            className={[styles["settingItem"], styles["logout"]].filter(Boolean).join(" ")}
          >
            <span className={styles["settingIcon"]}>↪</span>
            <span className={styles["settingText"]}>
              <strong>ログアウト</strong>
            </span>
            <span className={styles["chevron"]} aria-hidden="true">›</span>
          </Link>
        </nav>
      </div>
    </AppLayout>
  );
}
