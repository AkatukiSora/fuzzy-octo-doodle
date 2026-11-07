"use client";

import { useState } from "react";
import { FriendInviteModal } from "./FriendInviteModal";
import styles from "./FriendsHeader.module.css";

interface FriendsHeaderProps {
  activeTab: "list" | "inviting";
  onTabChange: (tab: "list" | "inviting") => void;
}

export function FriendsHeader({ activeTab, onTabChange }: FriendsHeaderProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  return (
    <header className={styles["header"]}>
      <h1 className={styles["title"]}>フレンド</h1>
      <button
        className={styles["requestLink"]}
        type="button"
        onClick={() => { setInviteOpen(true); }}
        aria-label="フレンドを招待"
        aria-haspopup="dialog"
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
      </button>
      {inviteOpen && <FriendInviteModal onClose={() => { setInviteOpen(false); }} />}
      <label className={styles["search"]}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" />
          <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input type="search" placeholder="フレンドを検索" />
      </label>
      <nav className={styles["tabs"]} aria-label="フレンドメニュー">
        <button
          type="button"
          className={[styles["tab"] ?? "", activeTab === "list" ? styles["activeTab"] ?? "" : ""].join(" ")}
          onClick={() => {
            onTabChange("list");
          }}
          aria-pressed={activeTab === "list"}
        >
          フレンド一覧
        </button>
        <button
          type="button"
          className={[styles["tab"] ?? "", activeTab === "inviting" ? styles["activeTab"] ?? "" : ""].join(" ")}
          onClick={() => {
            onTabChange("inviting");
          }}
          aria-pressed={activeTab === "inviting"}
        >
          招待中
        </button>
      </nav>
    </header>
  );
}
