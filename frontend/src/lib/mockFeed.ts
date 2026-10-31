import type { FeedPost, ReactionType } from "../types/feed";

export const reactionDefinitions: ReadonlyArray<{
  type: ReactionType;
  emoji: string;
}> = [
  { type: "support", emoji: "👏" },
  { type: "fire", emoji: "🔥" },
  { type: "congrats", emoji: "🎉" },
  { type: "laugh", emoji: "😂" },
];

export const mockPosts: FeedPost[] = [
  {
    id: "post-1",
    taskId: "task-1",
    userName: "さくら",
    timeAgo: "2時間前",
    taskTitle: "毎朝30分散歩する",
    status: "達成！",
    reactions: [
      { type: "support", emoji: "👏", count: 3 },
      { type: "fire", emoji: "🔥", count: 1 },
      { type: "congrats", emoji: "🎉", count: 0 },
      { type: "laugh", emoji: "😂", count: 0 },
    ],
  },
  {
    id: "post-2",
    taskId: "task-2",
    userName: "たくみ",
    timeAgo: "昨日",
    taskTitle: "毎日英単語を20個覚える",
    status: "進行中",
    deadlineAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    reactions: [
      { type: "support", emoji: "👏", count: 0 },
      { type: "fire", emoji: "🔥", count: 2 },
      { type: "congrats", emoji: "🎉", count: 0 },
      { type: "laugh", emoji: "😂", count: 0 },
    ],
  },
  {
    id: "post-3",
    taskId: "task-3",
    userName: "ゆい",
    timeAgo: "3時間前",
    taskTitle: "週に3回、筋トレする",
    status: "審査中",
    reviewEndsAt: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
    reactions: [
      { type: "support", emoji: "👏", count: 0 },
      { type: "fire", emoji: "🔥", count: 0 },
      { type: "congrats", emoji: "🎉", count: 0 },
      { type: "laugh", emoji: "😂", count: 0 },
    ],
  },
  {
    id: "post-4",
    taskId: "task-4",
    userName: "はると",
    timeAgo: "5時間前",
    taskTitle: "寝る前に本を読む",
    status: "達成！",
    reactions: [
      { type: "support", emoji: "👏", count: 0 },
      { type: "fire", emoji: "🔥", count: 0 },
      { type: "congrats", emoji: "🎉", count: 0 },
      { type: "laugh", emoji: "😂", count: 0 },
    ],
  },
];

const myReactions = new Map<string, ReactionType>();

export function getPost(postId: string): FeedPost | undefined {
  return mockPosts.find((post) => post.id === postId);
}

export function setReaction(postId: string, reactionType: ReactionType): FeedPost | undefined {
  const post = getPost(postId);
  if (!post) return undefined;

  const previousType = myReactions.get(postId);
  if (previousType === reactionType) return post;

  if (previousType) {
    const previousReaction = post.reactions.find((reaction) => reaction.type === previousType);
    if (previousReaction && previousReaction.count > 0) previousReaction.count -= 1;
  }

  const nextReaction = post.reactions.find((reaction) => reaction.type === reactionType);
  if (nextReaction) nextReaction.count += 1;
  myReactions.set(postId, reactionType);
  return post;
}

export function removeReaction(postId: string): FeedPost | undefined {
  const post = getPost(postId);
  if (!post) return undefined;

  const previousType = myReactions.get(postId);
  if (previousType) {
    const reaction = post.reactions.find((item) => item.type === previousType);
    if (reaction && reaction.count > 0) reaction.count -= 1;
    myReactions.delete(postId);
  }
  return post;
}

export function getPostsForFeed(): FeedPost[] {
  return mockPosts.map((post) => ({
    ...post,
    reactions: post.reactions.map((reaction) => ({
      ...reaction,
      reacted: myReactions.get(post.id) === reaction.type,
    })),
  }));
}
