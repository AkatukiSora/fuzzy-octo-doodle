import { FriendInviteContent } from "../../../../components/friends/FriendInviteContent";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <FriendInviteContent key={token} token={token} />;
}
