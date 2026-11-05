"use client";

import Link from "next/link";
import styles from "./FriendsHeader.module.css";

export function FriendsHeader() {
  return (
    <header className={styles["header"]}>
      <h1 className={styles["title"]}>フレンド</h1>
      <Link
        className={styles["requestLink"]}
        href="/friends/requests"
        aria-label="フレンド申請を見る"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6m-3-3h6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      <label className={styles["search"]}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" />
          <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input type="search" placeholder="フレンドを検索" />
      </label>
      <nav className={styles["tabs"]} aria-label="フレンドメニュー">
        <Link
          className={[styles["tab"] ?? "", styles["activeTab"] ?? ""].join(" ")}
          href="/friends"
          aria-current="page"
        >
          フレンド一覧
        </Link>
        <Link className={styles["tab"]} href="/friends/invite">
          招待中
        </Link>
      </nav>
    </header>
  );
}
