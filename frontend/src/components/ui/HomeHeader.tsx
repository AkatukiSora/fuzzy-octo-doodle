"use client";

import { useState } from "react";
import styles from "./HomeHeader.module.css";

const tabItems = [
  { label: "すべて", value: "all" },
  { label: "異議を出したタスク", value: "objected" },
] as const;

export type HomeTaskTab = (typeof tabItems)[number]["value"];

type HomeHeaderProps = {
  onTabChange?: (tab: HomeTaskTab) => void;
};

export function HomeHeader({ onTabChange }: HomeHeaderProps) {
  const [selectedTab, setSelectedTab] = useState<HomeTaskTab>("all");

  function handleTabChange(tab: HomeTaskTab) {
    setSelectedTab(tab);
    onTabChange?.(tab);
  }

  return (
    <div className={styles["tabs"]} role="group" aria-label="タスクの表示切り替え">
      {tabItems.map((tab) => (
        <button
          key={tab.value}
          type="button"
          className={`${styles["tab"]} ${
            selectedTab === tab.value ? styles["active"] : ""
          }`}
          aria-pressed={selectedTab === tab.value}
          onClick={() => handleTabChange(tab.value)}
        >
          {tab.label}
        </button>
        
      ))}
    </div>
  );
}
