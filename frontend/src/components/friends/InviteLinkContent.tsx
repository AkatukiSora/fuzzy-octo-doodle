
"use client";

import { useState } from "react";
import styles from "./InviteLinkContent.module.css";

interface InviteLinkContentProps {
  inviteUrl: string | null;
}

export function InviteLinkContent({
  inviteUrl,
}: InviteLinkContentProps) {
  const [message, setMessage] = useState("");

  const isAvailable =
    inviteUrl !== null && inviteUrl !== "";

  const copyLink = async (): Promise<void> => {
    if (!inviteUrl) return;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setMessage("リンクをコピーしました");
    } catch {
      setMessage("コピーできませんでした");
    }
  };

  const shareLink = async (): Promise<void> => {
    if (!inviteUrl) return;

    // Web Share APIに対応しているか確認
    const share = Reflect.get(navigator, "share") as
      | typeof navigator.share
      | undefined;

    if (typeof share !== "function") {
      await copyLink();
      return;
    }

    try {
      await share.call(navigator, {
        title: "Donee フレンド招待",
        text: "Doneeでフレンドになろう！",
        url: inviteUrl,
      });

      setMessage("");
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }

      setMessage("共有できませんでした");
    }
  };

  return (
    <div className={styles["container"]}>
      <p className={styles["description"]}>
        招待リンクを友達に送って、
        フレンド申請してもらいましょう。
      </p>

      <div className={styles["linkBox"]}>
        <input
          className={styles["linkInput"]}
          type="text"
          value={inviteUrl ?? "招待リンクを準備中です"}
          aria-label="招待リンク"
          readOnly
          onFocus={(event) => {
            if (inviteUrl) {
              event.currentTarget.select();
            }
          }}
        />
        <button
          type="button"
          className={styles["inlineCopy"]}
          aria-label="招待URLをコピー"
          disabled={!isAvailable}
          onClick={() => { void copyLink(); }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
      </div>

      <div className={styles["actions"]}>
        <button
          type="button"
          className={styles["copyButton"]}
          onClick={() => {
            void copyLink();
          }}
          disabled={!isAvailable}
        >
          コピー
        </button>

        <button
          type="button"
          className={styles["shareButton"]}
          onClick={() => {
            void shareLink();
          }}
          disabled={!isAvailable}
        >
          共有する
        </button>
      </div>

      {message && (
        <p className={styles["feedback"]} role="status">
          {message}
        </p>
      )}
    </div>
  );
}
