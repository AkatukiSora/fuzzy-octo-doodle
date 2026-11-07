import { z } from "zod";

const AVATAR_STORAGE_KEY = "profile-avatar";
const NICKNAME_STORAGE_KEY = "profile-nickname";

const profileSchema = z.object({
  nickname: z.string(),
});

export type Profile = z.infer<typeof profileSchema>;

export async function fetchProfile(): Promise<Profile> {
  const response = await fetch("/api/me");
  if (!response.ok) throw new Error("プロフィールを取得できませんでした。");

  const result = profileSchema.safeParse(await response.json());
  if (!result.success) throw new Error("プロフィールの形式が不正です。");
  localStorage.setItem(NICKNAME_STORAGE_KEY, result.data.nickname);
  return result.data;
}

export async function updateProfile(nickname: string): Promise<Profile> {
  const response = await fetch("/api/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
  if (!response.ok) throw new Error("プロフィールを保存できませんでした。");

  const result = profileSchema.safeParse(await response.json());
  if (!result.success) throw new Error("保存結果の形式が不正です。");
  localStorage.setItem(NICKNAME_STORAGE_KEY, result.data.nickname);
  return result.data;
}

export function readStoredNickname(): string | null {
  return localStorage.getItem(NICKNAME_STORAGE_KEY);
}

export function readStoredAvatar(): string | null {
  return localStorage.getItem(AVATAR_STORAGE_KEY);
}

export function saveStoredAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("画像を読み込めませんでした。"));
        return;
      }
      try {
        localStorage.setItem(AVATAR_STORAGE_KEY, reader.result);
        resolve(reader.result);
      } catch {
        reject(new Error("画像を保存できませんでした。"));
      }
    };
    reader.onerror = () => {
      reject(new Error("画像を読み込めませんでした。"));
    };
    reader.readAsDataURL(file);
  });
}
