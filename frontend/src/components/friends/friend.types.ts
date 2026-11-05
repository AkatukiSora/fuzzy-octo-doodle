export interface FriendTask {
  id: string;
  title: string;
  deadline: string;
  href?: string;
}

export interface Friend {
  id: string;
  name: string;
  avatarUrl?: string;
}
