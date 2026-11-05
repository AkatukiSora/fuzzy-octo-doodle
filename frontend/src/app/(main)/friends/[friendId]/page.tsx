"use client";

import { PageHeader } from "../../../../components/layout/PageHeader";
import { BottomNavigation } from "../../../../components/layout/BottomNavigation";
import { FriendProfile } from "../../../../components/friends/FriendProfile";
import { FriendTaskList } from "../../../../components/friends/FriendTaskList";
import type { FriendTask } from "../../../../components/friends/friend.types";

interface Friend {
  name: string;
  avatarUrl: string;
  tasks: FriendTask[];
}

const friendData: Friend = {
  name: "さくら",
  avatarUrl: "/images/pazul.jpg",
  tasks: [
    { id: "1", title: "個人開発を1時間進める", deadline: "2025-04-20T23:59:00" },
    { id: "2", title: "毎日ストレッチする", deadline: "2025-04-25T23:59:00" },
    { id: "3", title: "ポートフォリオを更新する", deadline: "2025-04-30T23:59:00" },
  ],
};

export default function FriendDetail() {
  return (
    <>
      <PageHeader title="フレンド詳細" />
      <FriendProfile name={friendData.name} avatarUrl={friendData.avatarUrl} />
      <FriendTaskList tasks={friendData.tasks} />
      <BottomNavigation />
    </>
  );
}
