"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, SubmitEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ProfilePageLayout } from "../../../../../components/layout/ProfilePageLayout";
import {
  fetchProfile,
  readStoredAvatar,
  readStoredNickname,
  saveStoredAvatar,
  updateProfile,
} from "../../../../../lib/profileApi";
import styles from "./ProfileEdit.module.css";

const MAX_NAME_LENGTH = 20;

export default function ProfileEditPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("/images/donee-login-brand.png");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setName(readStoredNickname() ?? "");
    setAvatarUrl(readStoredAvatar() ?? "/images/donee-login-brand.png");
    fetchProfile()
      .then((profile) => {
        setName(profile.nickname);
      })
      .catch(() => {
        setSaveError("プロフィールを取得できませんでした。");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    saveStoredAvatar(file)
      .then(setAvatarUrl)
      .catch((error: unknown) => {
        setSaveError(error instanceof Error ? error.message : "画像を保存できませんでした。");
      });
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setSaveError(null);

    try {
      await updateProfile(name);
      router.push("/mypage");
      router.refresh();
    } catch {
      setSaveError("プロフィールを保存できませんでした。もう一度お試しください。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ProfilePageLayout title="プロフィール編集" backHref="/mypage">
        <section className={styles["avatarCard"]} aria-label="プロフィール画像">
          <div className={styles["avatar"]}>
            <Image src={avatarUrl} alt="プロフィール画像" width={150} height={150} />
          </div>
          <label className={styles["avatarButton"]}>
            <svg className={styles["imageIcon"]} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            アイコンを変更
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className={styles["fileInput"]}
            />
          </label>
        </section>

        <form
          className={styles["form"]}
          onSubmit={(event) => { void handleSubmit(event); }}
        >
          <div className={styles["nameField"]}>
            <label htmlFor="profile-name">ユーザー名</label>
            <div className={styles["inputWrap"]}>
              <input
                id="profile-name"
                name="name"
                value={name}
                maxLength={MAX_NAME_LENGTH}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                autoComplete="nickname"
              />
              <span>{name.length} / {MAX_NAME_LENGTH}</span>
            </div>
          </div>

          {saveError && <p role="alert">{saveError}</p>}
          <button type="submit" className={styles["saveButton"]} disabled={isLoading || isSaving}>
            {isLoading ? "読み込み中..." : isSaving ? "保存中..." : "保存する"}
          </button>
        </form>
    </ProfilePageLayout>
  );
}
