"use client";

import { useState } from "react";
import { AppLayout } from "../../../../components/layout/AppLayout";
import { PageHeader } from "../../../../components/layout/PageHeader";
import styles from "./page.module.css";

type Visibility = "private" | "public";

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4m10-4v4M3 10h18m-12 4h2m4 0h2m-8 4h2" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
    </svg>
  );
}

function FriendsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20v-1.5a6.5 6.5 0 0 1 13 0V20Zm14-14a3.5 3.5 0 0 1 0 6.8m2 2.2a5 5 0 0 1 3 4.5V20h-3" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v5c0 1.7 3.6 3 8 3s8-1.3 8-3V5m-16 5v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5m-16 5v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4" />
    </svg>
  );
}

function RequiredBadge() {
  return <span className={styles["requiredBadge"]}>必須</span>;
}

export default function CreateTaskPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("2025-04-20T23:59");
  const [reward, setReward] = useState("500");
  const [visibility, setVisibility] = useState<Visibility>("private");

  return (
    <AppLayout showHeader={false}>
      <div className={styles["screen"]}>
        <PageHeader title="タスク作成" backHref="/tasks" />

        <div className={styles["formCard"]}>
          <div className={styles["field"]}>
            <label className={styles["labelRow"]} htmlFor="task-title">
              <span className={styles["label"]}>タスク名</span>
              <RequiredBadge />
            </label>
            <input
              id="task-title"
              className={styles["textInput"]}
              type="text"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
              placeholder="タスク名を入力してください"
              maxLength={100}
              required
            />
            <p className={styles["counter"]}>{title.length}/100</p>
          </div>

          <div className={styles["field"]}>
            <label className={styles["labelRow"]} htmlFor="task-description">
              <span className={styles["label"]}>詳細</span>
              <span className={styles["optionalBadge"]}>任意</span>
            </label>
            <textarea
              id="task-description"
              className={[
                styles["textInput"] ?? "",
                styles["textarea"] ?? "",
              ].join(" ")}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
              placeholder="タスクの詳細を入力してください"
              maxLength={200}
            />
            <p className={styles["counter"]}>{description.length}/200</p>
          </div>

          <div className={styles["field"]}>
            <label className={styles["labelRow"]} htmlFor="task-deadline">
              <span className={styles["label"]}>期限</span>
              <RequiredBadge />
            </label>
            <div className={styles["inputWithIcon"]}>
              <span className={styles["fieldIcon"]}>
                <CalendarIcon />
              </span>
              <input
                id="task-deadline"
                className={styles["dateInput"]}
                type="datetime-local"
                value={deadline}
                onChange={(event) => {
                  setDeadline(event.target.value);
                }}
                required
              />
            </div>
          </div>

          <fieldset
            className={[styles["field"] ?? "", styles["fieldset"] ?? ""].join(
              " ",
            )}
          >
            <legend className={styles["labelRow"]}>
              <span className={styles["label"]}>達成条件</span>
              <RequiredBadge />
            </legend>
            <label className={styles["evidenceOption"]}>
              <input type="radio" name="evidence" value="photo" defaultChecked />
              <span className={styles["evidenceIcon"]}>
                <CameraIcon />
              </span>
              <span className={styles["optionText"]}>
                <span className={styles["optionTitle"]}>写真で判定</span>
                <span className={styles["optionDescription"]}>
                  達成時にスクリーンショットや写真を1枚以上提出します
                </span>
              </span>
            </label>
          </fieldset>

          <div className={styles["field"]}>
            <label className={styles["labelRow"]} htmlFor="task-reward">
              <span className={styles["label"]}>金額設定</span>
              <RequiredBadge />
            </label>
            <div className={styles["inputWithIcon"]}>
              <span className={styles["fieldIcon"]}>
                <CoinIcon />
              </span>
              <input
                id="task-reward"
                className={styles["numberInput"]}
                type="number"
                min="1"
                value={reward}
                onChange={(event) => {
                  setReward(event.target.value);
                }}
                required
              />
              <span className={styles["currency"]}>円</span>
            </div>
            <p className={styles["hint"]}>
              ※ タスクを達成できなかった場合、この金額を支払います。
            </p>
          </div>

          <fieldset
            className={[styles["field"] ?? "", styles["fieldset"] ?? ""].join(
              " ",
            )}
          >
            <legend className={styles["labelRow"]}>
              <span className={styles["label"]}>金額の公開設定</span>
              <RequiredBadge />
            </legend>
            <div className={styles["visibilityOptions"]}>
              <label
                className={[
                  styles["visibilityOption"] ?? "",
                  visibility === "private" ? styles["selected"] ?? "" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={visibility === "private"}
                  onChange={() => {
                    setVisibility("private");
                  }}
                />
                <span className={styles["visibilityIcon"]}>
                  <LockIcon />
                </span>
                <span className={styles["visibilityText"]}>
                  <span className={styles["optionTitle"]}>公開しない</span>
                  <span className={styles["optionDescription"]}>
                    自分のみに表示します
                  </span>
                </span>
                <span className={styles["radioMark"]} aria-hidden="true" />
              </label>
              <label
                className={[
                  styles["visibilityOption"] ?? "",
                  visibility === "public" ? styles["selected"] ?? "" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={visibility === "public"}
                  onChange={() => {
                    setVisibility("public");
                  }}
                />
                <span className={styles["visibilityIcon"]}>
                  <FriendsIcon />
                </span>
                <span className={styles["visibilityText"]}>
                  <span className={styles["optionTitle"]}>公開する</span>
                  <span className={styles["optionDescription"]}>
                    招待したフレンドに金額を表示します
                  </span>
                </span>
                <span className={styles["radioMark"]} aria-hidden="true" />
              </label>
            </div>
          </fieldset>

          <button type="button" className={styles["submitButton"]}>
            確認画面へ
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
