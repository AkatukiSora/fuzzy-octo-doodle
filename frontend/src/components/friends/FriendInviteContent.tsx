"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppLayout } from "../layout/AppLayout";
import { PageHeader } from "../layout/PageHeader";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { FriendCard } from "./FriendCard";
import { fetchInviter, fetchInviteStatus, FriendsApiError, sendFriendRequest, type FriendUser, type InviteStatus } from "../../lib/friendsApi";
import styles from "./FriendInviteContent.module.css";

const messages: Record<InviteStatus, string> = {
  ready: "相手が承認すると、フレンド一覧に表示されます。",
  self: "これはあなたの招待リンクです。フレンドになりたい相手に共有してください。",
  outgoing: "フレンド申請済みです。相手の承認をお待ちください。",
  incoming: "この相手からフレンド申請が届いています。フレンド画面で承認してください。",
  friends: "すでにフレンドになっています。",
  login: "フレンド申請にはログインが必要です。ログイン後、もう一度このリンクを開いてください。",
};

export function FriendInviteContent({ token }: { token: string }) {
  const [inviter, setInviter] = useState<FriendUser | null>(null);
  const [status, setStatus] = useState<InviteStatus | null>(null);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = useRef<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const refresh = () => { if (!busy.current) setAttempt(value => value + 1); };
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("focus", refresh); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      setInvalid(false);
      setInviter(null);
      setStatus(null);
      try {
        let user: FriendUser;
        try {
          user = await fetchInviter(token, controller.signal);
        } catch (cause) {
          if (cause instanceof FriendsApiError && cause.status === 404) {
            if (!controller.signal.aborted) setInvalid(true);
            return;
          }
          throw cause;
        }
        const nextStatus = await fetchInviteStatus(user.userId, controller.signal);
        if (!controller.signal.aborted) { setInviter(user); setStatus(nextStatus); }
      } catch {
        if (!controller.signal.aborted) setError("招待情報を読み込めませんでした。再度お試しください。");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => { controller.abort(); };
  }, [token, attempt]);

  async function submit() {
    if (busy.current || status !== "ready" || !inviter) return;
    busy.current = true;
    setSending(true);
    setError("");
    try {
      key.current ??= crypto.randomUUID();
      await sendFriendRequest(token, key.current);
      key.current = null;
      setStatus("outgoing");
    } catch (cause) {
      if (cause instanceof FriendsApiError && cause.status === 404) setInvalid(true);
      else if (cause instanceof FriendsApiError && cause.status === 401) setStatus("login");
      else if (cause instanceof FriendsApiError && cause.status === 409) {
        try {
          const current = await fetchInviteStatus(inviter.userId);
          setStatus(current);
          if (current === "ready") setError("申請の状態が変わりました。画面を再読み込みしてお試しください。");
        } catch { setError("申請の状態を確認できませんでした。再度お試しください。"); }
      } else if (cause instanceof FriendsApiError && cause.status === 403) setError("この相手にはフレンド申請できません。");
      else setError("フレンド申請を送信できませんでした。再度お試しください。");
    } finally { busy.current = false; setSending(false); }
  }

  return (
    <AppLayout showHeader={false}>
      <div className={styles["screen"]}>
        <PageHeader title="フレンド招待" backHref="/friends" />
        <div className={styles["card"]}>
          {loading ? <p role="status">招待情報を読み込んでいます...</p> : invalid ? (
            <><h2>この招待リンクは無効です</h2><p>リンクを確認するか、招待元のユーザーに招待リンクを再度共有してもらってください。</p></>
          ) : inviter && status ? (
            <>
              <FriendCard friend={{ id: inviter.userId, name: inviter.nickname }} />
              <h2>{status === "ready" ? `${inviter.nickname}さんにフレンド申請しますか？` : "フレンド申請の確認"}</h2>
              <p role="status">{messages[status]}</p>
              {error && <p className={styles["error"]} role="alert">{error}</p>}
              {status === "ready" && <Button size="lg" fullWidth disabled={sending} onClick={() => { void submit(); }}>{sending ? "申請中..." : "フレンド申請する"}</Button>}
            </>
          ) : <ErrorState description={error} onRetry={() => { setAttempt(value => value + 1); }} />}
          <Link className={styles["back"]} href="/friends">{status === "ready" ? "キャンセル" : "フレンド画面へ"}</Link>
        </div>
      </div>
    </AppLayout>
  );
}
