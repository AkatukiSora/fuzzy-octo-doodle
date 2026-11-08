import assert from "node:assert/strict";
import { test } from "node:test";
import { updateReactions } from "./feedReactions.ts";
import type { FeedReaction } from "../types/feed.ts";
const reactions: FeedReaction[] = [
  { type: "support", emoji: "??", count: 3, reacted: true },
  { type: "fire", emoji: "??", count: 2, reacted: false },
];
test("switching transfers the user's single vote without mutating the snapshot", () => {
  const next = updateReactions(reactions, "fire", false);
  assert.deepEqual(next.map(r => [r.count, r.reacted]), [[2, false], [3, true]]);
  assert.equal(reactions[0]?.count, 3);
});
test("removal and addition update counts and selection", () => {
  const removed = updateReactions(reactions, "support", true);
  assert.deepEqual(removed.map(r => [r.count, r.reacted]), [[2, false], [2, false]]);
  assert.deepEqual(updateReactions(removed, "support", false), reactions);
});
