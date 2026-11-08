import type { FeedReaction, ReactionType } from "../types/feed.ts";

// The API allows one reaction per user and post, including when switching types.
export function updateReactions(reactions: FeedReaction[], type: ReactionType, reacted: boolean): FeedReaction[] {
  return reactions.map((reaction) => {
    const selected = !reacted && reaction.type === type;
    return { ...reaction, reacted: selected,
      count: Math.max(0, reaction.count + Number(selected) - Number(reaction.reacted ?? false)) };
  });
}
