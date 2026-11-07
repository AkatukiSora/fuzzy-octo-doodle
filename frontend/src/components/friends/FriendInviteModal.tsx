"use client";

import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { ErrorState } from "../ui/ErrorState";
import { InviteLinkContent } from "./InviteLinkContent";
import { fetchFriendInviteUrl } from "../../lib/friendInviteApi";

export function FriendInviteModal({ onClose }: { onClose: () => void }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchFriendInviteUrl(window.location.origin, controller.signal).then((url) => {
      if (!controller.signal.aborted) setInviteUrl(url);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => { controller.abort(); };
  }, [attempt]);

  return (
    <Modal isOpen title="フレンドを招待" onClose={onClose} showCloseButton>
      {error ? (
        <ErrorState description="招待リンクを取得できませんでした。" onRetry={() => {
          setError(false);
          setAttempt((value) => value + 1);
        }} />
      ) : (
        <>
          {!inviteUrl && <p role="status">招待リンクを読み込んでいます...</p>}
          <InviteLinkContent inviteUrl={inviteUrl} />
        </>
      )}
    </Modal>
  );
}
