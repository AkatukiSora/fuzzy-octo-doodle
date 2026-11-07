"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "../../components/layout/AppLayout";
import { CommunityTaskCard } from "../../components/tasks/CommunityTaskCard";
import { HomeHeader } from "../../components/ui/HomeHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { Loading } from "../../components/ui/Loading";
import type { FeedFilter, FeedPost, ReactionType } from "../../types/feed";
import { fetchFeed, sendReaction } from "../../lib/feedApi";

export default function HomePage() {
  const router = useRouter();
  // allは全投稿、objectedは自分が異議を出したタスクの投稿を表示する。
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const retry = useCallback(() => {
    setRetryKey((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadFeed() {
      setIsLoading(true);
      setError(false);

      try {
        const feedPosts = await fetchFeed(controller.signal, filter);
        setPosts(feedPosts);
      } catch (cause) {
        // タブ切替などで中断された通信はエラー画面にしない。
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError(true);
      } finally {
        // 古い通信が終わったときに、新しい通信のローディング表示を消さない。
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadFeed();

    // タブが切り替わったら前の通信を中断し、古い結果の反映を防ぐ。
    return () => {
      controller.abort();
    };
  }, [filter, retryKey]);

  const [reactingPostIds, setReactingPostIds] = useState<Set<FeedPost["id"]>>(
    () => new Set(),
  );
  const [reactionError, setReactionError] = useState<string | null>(null);

  async function handleReaction(
    postId: FeedPost["id"],
    reactionType: ReactionType,
    reacted: boolean,
  ) {
    if (reactingPostIds.has(postId)) return;

    setReactingPostIds((current) => new Set(current).add(postId));
    setReactionError(null);

    try {
      await sendReaction(postId, reactionType, reacted);

      retry();
    } catch {
      setReactionError(
        "リアクションを送信できませんでした。もう一度お試しください。",
      );
    } finally {
      setReactingPostIds((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
  }

  return (
    <AppLayout title="みんなのタスク">
      <HomeHeader onTabChange={setFilter} />
      {reactionError && <p role="alert">{reactionError}</p>}

      {isLoading ? (
        <Loading message="投稿を読み込んでいます..." />
      ) : error ? (
        <ErrorState
          description="投稿を読み込めませんでした。もう一度お試しください。"
          onRetry={retry}
        />
      ) : posts.length === 0 ? (
        <EmptyState
          title="投稿がありません"
          description={
            filter === "objected"
              ? "異議を出したタスクはまだありません。"
              : "表示できる投稿はまだありません。"
          }
        />
      ) : (
        posts.map((post) => (
          <CommunityTaskCard
            key={post.id}
            userName={post.userName}
            timeAgo={post.timeAgo}
            {...(post.activityLabel !== undefined ? { activityLabel: post.activityLabel } : {})}
            taskTitle={post.taskTitle}
            status={post.status}
            reactions={post.reactions}
            onDetailClick={() => {
              router.push(`/tasks/${encodeURIComponent(post.taskId)}`);
            }}
            onReactionClick={(reactionType, reacted) => {
              void handleReaction(post.id, reactionType, reacted);
            }}
            {...(post.avatarUrl !== undefined
              ? { avatarUrl: post.avatarUrl }
              : {})}
            {...(post.deadlineAt !== undefined
              ? { deadlineAt: post.deadlineAt }
              : {})}
            {...(post.reviewEndsAt !== undefined
              ? { reviewEndsAt: post.reviewEndsAt }
              : {})}
          />
        ))
      )}
    </AppLayout>
  );
}
