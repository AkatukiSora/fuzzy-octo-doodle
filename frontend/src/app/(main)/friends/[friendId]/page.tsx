import { FriendDetailContent } from "../../../../components/friends/FriendDetailContent";

export default async function FriendDetailPage({ params }: { params: Promise<{ friendId: string }> }) {
  const { friendId } = await params;
  return <FriendDetailContent key={friendId} friendId={friendId} />;
}
