
import Link from "next/link";
import styles from "./FriendCard.module.css";
import type { Friend } from "./friend.types";

export type { Friend } from "./friend.types";

interface FriendCardProps {
  friend: Friend;
  href?: string;
  onClick?: () => void;
}

export function FriendCard({
  friend,
  href,
  onClick,
}: FriendCardProps) {
  const content = (
    <>
      <div className={styles["avatar"]}>
        {friend.avatarUrl ? (
          <img
            src={friend.avatarUrl}
            alt=""
            className={styles["avatarImage"]}
          />
        ) : (
          <span aria-hidden="true">
            {friend.name.charAt(0)}
          </span>
        )}
      </div>

      <div className={styles["info"]}>
        <p className={styles["name"]}>{friend.name}</p>
      </div>

      {(href ?? onClick) && (
        <svg
          className={styles["chevron"]}
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={styles["card"]}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={styles["card"]}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return <div className={styles["card"]}>{content}</div>;
}
