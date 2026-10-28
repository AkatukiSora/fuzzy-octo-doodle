"use client";

import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "../../components/layout/AppLayout";
import { CommunityTaskCard } from "../../components/tasks/CommunityTaskCard";
import { HomeHeader } from "../../components/ui/HomeHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { Loading } from "../../components/ui/Loading";
import type { FeedFilter, FeedPost, FeedResponse } from "../../types/feed";

export default function HomePage() {
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const retry = useCallback(() => {
    setRetryKey((current) => current + 1);
  }, []);

  //仮API
  useEffect(() => {
    const controller = new AbortController();

    async function loadFeed() {
      setIsLoading(true);
      setError(false);

      try {
        const response = await fetch(`/api/feed?filter=${filter}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`フィードの取得に失敗しました (${response.status})`);
        }

        const data: FeedResponse = await response.json();
        setPosts(data.items);
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadFeed();

    return () => controller.abort();
  }, [filter, retryKey]);

  return (
    <AppLayout title="みんなのタスク">
      <HomeHeader onTabChange={setFilter} />

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
            taskTitle={post.taskTitle}
            status={post.status}
            reactions={post.reactions}
            {...(post.avatarUrl !== undefined
              ? { avatarUrl: post.avatarUrl }
              : {})}
            {...(post.remainingTime !== undefined
              ? { remainingTime: post.remainingTime }
              : {})}
          />
        ))
      )}
    </AppLayout>
  );
}
