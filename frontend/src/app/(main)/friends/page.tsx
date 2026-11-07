"use client";

import { useEffect, useState } from "react";
import { FriendsHeader } from "../../../components/friends/FriendsHeader";
import { FriendCard } from "../../../components/friends/FriendCard";
import { FriendRequestCard } from "../../../components/friends/FriendRequestCard";
import { BottomNavigation } from "../../../components/layout/BottomNavigation";
import type { Friend } from "../../../components/friends/friend.types";

interface FriendRequestApiItem {
  id: string;
  addressee: { nickname: string };
  requestedAt: string;
}

interface PendingFriend {
  id: string;
  name: string;
  requestedAtText: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseFriendRequestApiItems(value: unknown): FriendRequestApiItem[] {
  if (!Array.isArray(value)) {
    throw new Error("招待中フレンドの形式が不正です");
  }

  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item["id"] !== "string" ||
      !isRecord(item["addressee"]) ||
      typeof item["addressee"]["nickname"] !== "string" ||
      typeof item["requestedAt"] !== "string"
    ) {
      throw new Error("招待中フレンドの形式が不正です");
    }

    return {
      id: item["id"],
      addressee: { nickname: item["addressee"]["nickname"] },
      requestedAt: item["requestedAt"],
    };
  });
}

const copyfriends: Friend[] = [
  { id: "1", name: "佐藤", avatarUrl: "/images/pazul.jpg" },
  { id: "3", name: "k", avatarUrl: "/images/pazul.jpg" },
  { id: "2", name: "aaa", avatarUrl: "/images/pazul.jpg" },
];

export default function FriendsPage() {
  const [friends] = useState<Friend[]>(copyfriends);
  const [activeTab, setActiveTab] = useState<"list" | "inviting">("list");
  const [pendingFriends, setPendingFriends] = useState<PendingFriend[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [inviteError, setInviteError] = useState(false);

  useEffect(() => {
    if (activeTab !== "inviting") return;

    const controller = new AbortController();

    async function loadPendingFriends() {
      setIsLoadingInvites(true);
      setInviteError(false);

      try {
        const response = await fetch("/api/friend-requests?direction=outgoing", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("招待中のフレンドを取得できませんでした");

        const body: unknown = await response.json();
        const requests = parseFriendRequestApiItems(body);
        setPendingFriends(
          requests.map((request) => ({
            id: request.id,
            name: request.addressee.nickname,
            requestedAtText: new Intl.DateTimeFormat("ja-JP", {
              dateStyle: "medium",
            }).format(new Date(request.requestedAt)),
          })),
        );
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setInviteError(true);
      } finally {
        if (!controller.signal.aborted) setIsLoadingInvites(false);
      }
    }

    void loadPendingFriends();
    return () => {
      controller.abort();
    };
  }, [activeTab]);
  // useEffect(() => {
  //   async function loadFriends() {
  //     const response = await fetch("/api/friends");
  //     if (!response.ok) throw new Error("友達一覧を取得できませんでした");
  //     const data: Friend[] = await response.json();
  //     setFriends(data);
  //   }
  //   void loadFriends();
  // }, []);

  return (
    <>
      <FriendsHeader activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "list" ? (
        friends.map((friend) => (
          <FriendCard
            key={friend.id}
            friend={friend}
            href={`/friends/${friend.id}`}
          />
        ))
      ) : isLoadingInvites ? (
        <p role="status">招待中のフレンドを読み込んでいます...</p>
      ) : inviteError ? (
        <p role="alert">招待中のフレンドを取得できませんでした。</p>
      ) : pendingFriends.length === 0 ? (
        <p>招待中のフレンドはいません。</p>
      ) : (
        pendingFriends.map((friend) => (
          <FriendRequestCard
            key={friend.id}
            request={{ ...friend, direction: "sent" }}
          />
        ))
      )}
      <BottomNavigation />
    </>
  );
}
