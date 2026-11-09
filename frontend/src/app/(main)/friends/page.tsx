"use client";

import { useEffect, useRef, useState } from "react";
import { FriendsHeader } from "../../../components/friends/FriendsHeader";
import { FriendCard } from "../../../components/friends/FriendCard";
import { FriendRequestCard } from "../../../components/friends/FriendRequestCard";
import { AppLayout } from "../../../components/layout/AppLayout";
import { ErrorState } from "../../../components/ui/ErrorState";
import { fetchFriends, fetchFriendRequests, respondToFriendRequest, type FriendUser, type FriendRequestItem } from "../../../lib/friendsApi";
import styles from "./page.module.css";

export default function FriendsPage() {
  const [activeTab, setActiveTab] = useState<"list" | "inviting">("list");
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => { setRevision(value => value + 1); };
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("focus", refresh); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void Promise.all([fetchFriends(controller.signal), fetchFriendRequests("incoming", controller.signal), fetchFriendRequests("outgoing", controller.signal)])
      .then(([list, received, sent]) => {
        if (controller.signal.aborted) return;
        setFriends(list); setIncoming(received); setOutgoing(sent);
      }).catch(() => {
        if (!controller.signal.aborted) setError("フレンド情報を取得できませんでした。");
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => { controller.abort(); };
  }, [revision, activeTab]);

  async function respond(id: string, action: "accept" | "reject") {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError("");
    try {
      await respondToFriendRequest(id, action);
      setRevision(value => value + 1);
    } catch {
      setActionError("申請を処理できませんでした。最新の状態を確認し、再度お試しください。");
      setRevision(value => value + 1);
    } finally { busyRef.current = false; setBusy(false); }
  }

  return (
    <AppLayout showHeader={false}>
      <div className={styles["screen"]}>
        <FriendsHeader activeTab={activeTab} onTabChange={setActiveTab} />
        <div className={styles["content"]}>
          {actionError && <p role="alert" className={styles["error"]}>{actionError}</p>}
          {loading ? <p role="status">フレンド情報を読み込んでいます...</p> : error ? (
            <ErrorState description={error} onRetry={() => { setRevision(value => value + 1); }} />
          ) : activeTab === "list" ? (
            friends.length === 0 ? <p>フレンドはまだいません。招待リンクを共有してフレンドを招待しましょう。</p> : friends.map(friend => (
              <FriendCard key={friend.userId} friend={{ id: friend.userId, name: friend.nickname }} href={`/friends/${friend.userId}`} />
            ))
          ) : (
            <>
              <section className={styles["section"]} aria-labelledby="incoming-heading">
                <h2 id="incoming-heading">届いた申請</h2>
                {incoming.length === 0 ? <p>届いているフレンド申請はありません。</p> : incoming.map(item => (
                  <FriendRequestCard key={item.id} request={{ id: item.id, name: item.requester.nickname, requestedAtText: new Date(item.requestedAt).toLocaleDateString("ja-JP"), direction: "received" }} disabled={busy} onAccept={id => { void respond(id, "accept"); }} onReject={id => { void respond(id, "reject"); }} />
                ))}
              </section>
              <section className={styles["section"]} aria-labelledby="outgoing-heading">
                <h2 id="outgoing-heading">送った申請</h2>
                {outgoing.length === 0 ? <p>承認待ちのフレンド申請はありません。</p> : outgoing.map(item => (
                  <FriendRequestCard key={item.id} request={{ id: item.id, name: item.addressee.nickname, requestedAtText: new Date(item.requestedAt).toLocaleDateString("ja-JP"), direction: "sent" }} />
                ))}
              </section>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
