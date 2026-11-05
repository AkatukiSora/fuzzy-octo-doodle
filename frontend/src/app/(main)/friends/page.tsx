"use client";

import { useState } from "react";
import { FriendsHeader } from "../../../components/friends/FriendsHeader";
import { FriendCard } from "../../../components/friends/FriendCard";
import { BottomNavigation } from "../../../components/layout/BottomNavigation";
import type { Friend } from "../../../components/friends/friend.types";

const copyfriends: Friend[] = [
  { id: "1", name: "佐藤", avatarUrl: "/images/pazul.jpg" },
  { id: "3", name: "k", avatarUrl: "/images/pazul.jpg" },
  { id: "2", name: "aaa", avatarUrl: "/images/pazul.jpg" },
];

export default function FriendsPage() {
  const [friends] = useState<Friend[]>(copyfriends);
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
      <FriendsHeader />
      {friends.map((friend) => (
        <FriendCard
          key={friend.id}
          friend={friend}
          href={`/friends/${friend.id}`}
        />
      ))}
      <BottomNavigation />
    </>
  );
}
