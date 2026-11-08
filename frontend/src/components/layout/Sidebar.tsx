
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";

const items = [
  { label: "ホーム", href: "/", icon: "home" },
  { label: "マイタスク", href: "/tasks", icon: "tasks" },
  { label: "タスクを作成", href: "/tasks/create", icon: "plus" },
  { label: "フレンド", href: "/friends", icon: "friends" },
  { label: "マイページ", href: "/mypage", icon: "user" },
] as const;

type IconName = (typeof items)[number]["icon"];

interface NavIconProps {
  name: IconName;
}

function NavIcon({ name }: NavIconProps) {
  switch (name) {
    case "home":
      return (
        <path d="M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3z" />
      );

    case "tasks":
      return (
        <>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4V2h6v2M8 12l2 2 5-5M8 18h8" />
        </>
      );

    case "plus":
      return <path d="M12 4v16M4 12h16" />;

    case "friends":
      return (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20v-2a6 6 0 0 1 12 0v2" />
          <path d="M17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1" />
        </>
      );

    case "user":
      return (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </>
      );
  }
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles["sidebar"]}>
      <div className={styles["brand"]}>Donee</div>

      <nav
        className={styles["navigation"]}
        aria-label="メインナビゲーション"
      >
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/" || pathname.startsWith("/home/tasks/")
              : item.href === "/tasks"
                ? pathname === "/tasks" ||
                  (pathname.startsWith("/tasks/") &&
                    !pathname.startsWith("/tasks/create"))
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={`${styles["item"] ?? ""} ${
                active ? (styles["active"] ?? "") : ""
              }`}
              aria-current={active ? "page" : undefined}
            >
              <svg
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <NavIcon name={item.icon} />
              </svg>

              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
