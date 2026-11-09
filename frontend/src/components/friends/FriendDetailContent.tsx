"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppLayout } from "../layout/AppLayout";
import { PageHeader } from "../layout/PageHeader";
import { FriendProfile } from "./FriendProfile";
import { TaskStatsCard } from "../tasks/TaskStatsCard";
import { FriendActivityList } from "./FriendActivityList";
import { ErrorState } from "../ui/ErrorState";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { fetchFriendActivity, FriendDetailError, isFriendTaskOngoing, isTaskOverdue, isUserBlocked, reportFriend, setUserBlocked, type FriendActivity, type ReportBody, type ReportReason, type TaskSort } from "../../lib/friendDetailApi";
import styles from "./FriendDetailContent.module.css";

export function FriendDetailContent({ friendId }: { friendId: string }) {
  const [data, setData] = useState<FriendActivity | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<TaskSort>("soonest");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState<"report" | "block" | "unblock" | null>(null);
  const [reason, setReason] = useState<ReportReason>("harassment");
  const [detail, setDetail] = useState("");
  const [modalError, setModalError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const lock = useRef(false);
  const requestKey = useRef<{ body: string; key: string } | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const generation = useRef(0);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const clock = window.setInterval(() => { setNow(Date.now()); }, 1000);
    const refresh = window.setInterval(() => { if (!lock.current) setRevision(value => value + 1); }, 60_000);
    return () => { window.clearInterval(clock); window.clearInterval(refresh); };
  }, []);

  useEffect(() => {
    const refresh = () => { if (!lock.current) setRevision(value => value + 1); };
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("focus", refresh); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const canceled = () => controller.signal.aborted;
    generation.current++;
    setLoading(true); setData(null); setError(""); setUnavailable(false); setBlocked(false);
    async function load() {
      try {
        const result = await fetchFriendActivity(friendId, sort, controller.signal);
        if (!canceled()) setData(result);
      } catch (cause) {
        if (canceled()) return;
        if (cause instanceof FriendDetailError && (cause.status === 404 || cause.status === 400)) {
          try {
            const ownBlock = await isUserBlocked(friendId, controller.signal);
            if (!canceled()) { setBlocked(ownBlock); setUnavailable(!ownBlock); }
          } catch { if (!canceled()) setError("フレンド情報を確認できませんでした。"); }
        } else setError("フレンド情報を取得できませんでした。");
      } finally { if (!canceled()) setLoading(false); }
    }
    void load();
    return () => { controller.abort(); };
  }, [friendId, sort, revision]);

  async function more() {
    if (!data?.tasks.nextCursor || loadingMore) return;
    const version = generation.current;
    setLoadingMore(true); setError("");
    try {
      const next = await fetchFriendActivity(friendId, sort, undefined, data.tasks.nextCursor);
      if (version !== generation.current) return;
      setData(current => current ? { ...next, tasks: { ...next.tasks, items: [...current.tasks.items.filter(task => isFriendTaskOngoing(task, Date.now())), ...next.tasks.items.filter(task => !current.tasks.items.some(old => old.id === task.id))] } } : null);
    } catch (cause) {
      if (version !== generation.current) return;
      if (cause instanceof FriendDetailError && cause.status === 404) { setData(null); setRevision(value => value + 1); }
      else setError("続きを読み込めませんでした。再度お試しください。");
    } finally { setLoadingMore(false); }
  }

  function openModal(value: "report" | "block" | "unblock") {
    if (menu.current) menu.current.open = false;
    setModalError(""); setModal(value);
  }

  async function sendReport() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setModalError("");
    try {
      const body: ReportBody = { reason, detail: detail.trim() };
      const serialized = JSON.stringify(body);
      if (requestKey.current?.body !== serialized) requestKey.current = { body: serialized, key: crypto.randomUUID() };
      await reportFriend(friendId, body, requestKey.current.key);
      setModal(null); setMessage("通報を受け付けました。ご協力ありがとうございます。");
    } catch { setModalError("通報を送信できませんでした。入力内容を確認して再度お試しください。"); }
    finally { lock.current = false; setBusy(false); }
  }

  async function changeBlock() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setModalError("");
    const next = modal === "block";
    try {
      await setUserBlocked(friendId, next);
      generation.current++;
      setData(null); setBlocked(next); setUnavailable(!next); setModal(null); setError("");
      setMessage(next ? "ブロックしました。フレンド関係は解除されています。" : "ブロックを解除しました。フレンドになるには再度申請が必要です。");
    } catch { setModalError("ブロック設定を更新できませんでした。再度お試しください。"); }
    finally { lock.current = false; setBusy(false); }
  }

  const expiredSinceLoad = data?.tasks.items.filter(task => !isFriendTaskOngoing(task, now)) ?? [];
  const liveTasks = data?.tasks.items.filter(task => isFriendTaskOngoing(task, now)) ?? [];

  return (
    <AppLayout showHeader={false}>
      <div className={styles["screen"]}>
        <PageHeader title="フレンド詳細" backHref="/friends" rightContent={!loading && (data || blocked) ? (
          <details ref={menu} className={styles["menu"]}>
            <summary aria-label="フレンドメニューを開く">⋯</summary>
            <div className={styles["dropdown"]}>
              {data && <button type="button" onClick={() => { openModal("report"); }}>通報する</button>}
              <button type="button" onClick={() => { openModal(blocked ? "unblock" : "block"); }}>{blocked ? "ブロックを解除する" : "ブロックする"}</button>
            </div>
          </details>
        ) : null} />
        <div className={styles["content"]}>
          {message && <p role="status" className={styles["notice"]}>{message}</p>}
          {loading ? <p role="status">フレンド情報を読み込んでいます...</p> : blocked ? (
            <section className={styles["state"]}><h2>ブロック中です</h2><p>この相手のプロフィールやタスクは表示できません。</p><Button variant="secondary" onClick={() => { openModal("unblock"); }}>ブロックを解除する</Button></section>
          ) : unavailable ? (
            <section className={styles["state"]}><h2>フレンド情報を表示できません</h2><p>フレンド関係や閲覧権限を確認してください。</p><Link href="/friends">フレンド一覧へ</Link></section>
          ) : data ? (
            <>
              <FriendProfile name={data.friend.nickname} />
              <TaskStatsCard completionRate={data.stats.successRate} activeCount={Math.max(0, data.stats.activeCount - expiredSinceLoad.length)} overdueCount={data.stats.overdueCount + expiredSinceLoad.filter(task => isTaskOverdue(task, now)).length} />
              <p className={styles["explanation"]}>達成率は達成・未達成の確定済みタスクから計算しています。判定不能は含みません。</p>
              {error && <p role="alert" className={styles["error"]}>{error}</p>}
              <FriendActivityList friendId={friendId} tasks={liveTasks} now={now} sort={sort} onSort={setSort} nextCursor={data.tasks.nextCursor} onMore={() => { void more(); }} loadingMore={loadingMore} />
            </>
          ) : <ErrorState description={error} onRetry={() => { setRevision(value => value + 1); }} />}
        </div>
      </div>
      <Modal isOpen={modal === "report"} title="フレンドを通報" isLoading={busy} onClose={() => { if (!busy) setModal(null); }}>
        <form className={styles["reportForm"]} onSubmit={event => { event.preventDefault(); void sendReport(); }}>
          <p>通報理由を選択してください。通報内容は相手に通知されません。</p>
          <label>通報理由<select value={reason} disabled={busy} onChange={event => { const value = event.target.value; if (value === "harassment" || value === "spam" || value === "inappropriate" || value === "other") setReason(value); }}>
            <option value="harassment">嫌がらせ・迷惑行為</option><option value="spam">スパム</option><option value="inappropriate">不適切な内容</option><option value="other">その他</option>
          </select></label>
          <label>詳細（{reason === "other" ? "必須" : "任意"}）<textarea value={detail} disabled={busy} required={reason === "other"} maxLength={1000} rows={5} onChange={event => { setDetail(event.target.value); }} /></label>
          {modalError && <p role="alert" className={styles["error"]}>{modalError}</p>}
          <Button type="submit" fullWidth variant="danger" disabled={busy || (reason === "other" && !detail.trim())}>{busy ? "送信中..." : "通報を送信する"}</Button>
          <Button variant="secondary" fullWidth disabled={busy} onClick={() => { setModal(null); }}>キャンセル</Button>
        </form>
      </Modal>
      <Modal isOpen={modal === "block" || modal === "unblock"} title={modal === "block" ? "フレンドをブロック" : "ブロックを解除"} confirmText={modal === "block" ? "ブロックする" : "解除する"} confirmVariant={modal === "block" ? "danger" : "primary"} onConfirm={() => { void changeBlock(); }} isLoading={busy} onClose={() => { if (!busy) setModal(null); }}>
        <p>{modal === "block" ? "ブロックするとフレンド関係が解除され、お互いのタスクを閲覧できなくなります。ブロックしますか？" : "ブロックを解除しますか？解除してもフレンド関係は自動で復元されません。"}</p>
        {modalError && <p role="alert" className={styles["error"]}>{modalError}</p>}
      </Modal>
    </AppLayout>
  );
}
