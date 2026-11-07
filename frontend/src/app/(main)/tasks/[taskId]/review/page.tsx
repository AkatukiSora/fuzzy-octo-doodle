"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "../../../../../components/layout/PageHeader";
import { ObjectionButton } from "../../../../../components/layout/ObjectionButton";
import { BottomNavigation } from "../../../../../components/layout/BottomNavigation";
import { TaskInfoCard } from "../../../../../components/tasks/TaskInfoCard";
import { EmptyState } from "../../../../../components/ui/EmptyState";
import { ErrorState } from "../../../../../components/ui/ErrorState";
import { Loading } from "../../../../../components/ui/Loading";
import type { TaskStatus } from "../../../../../types/task";

// タスク詳細APIから受け取って画面に表示するデータの型。
interface TaskDetails {
  title: string;
  achievementCondition: string;
  deadlineAt: string;
  status: TaskStatus;
}

// APIの日時文字列を、日本時間の表示用文字列に変換する。
function formatDeadline(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ReviewHome() {
  // URLの /tasks/[taskId]/review からタスクIDを取り出す。
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();

  // APIから取得したタスク、読み込み中かどうか、取得失敗したかどうかを保持する。
  const [task, setTask] = useState<TaskDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // タスクIDごとに詳細APIを呼び出してタスクを取得する。
    async function loadTask() {
      setIsLoading(true);
      setError(false);

      try {
        // URLの一部として安全に使えるようにIDをエンコードしてGETする。
        const response = await fetch(
          `/api/tasks/${encodeURIComponent(taskId)}`,
        );

        // 404など、成功以外のHTTP応答はエラー表示にする。
        if (!response.ok) {
          throw new Error("タスク情報を取得できませんでした。");
        }

        // レスポンスJSONをTaskDetails型として読み込み、Stateに保存する。
        const data: TaskDetails = await response.json();
        setTask(data);
      } catch {
        // 通信失敗やHTTPエラーが起きたことを画面に知らせる。
        setError(true);
      } finally {
        // 成功・失敗に関係なく読み込み表示を終了する。
        setIsLoading(false);
      }
    }

    // useEffect自体をasyncにせず、取得処理を開始する。
    void loadTask();
  }, [taskId]);

  // APIの応答を待っている間はローディングを表示する。
  if (isLoading) {
    return <Loading message="タスクを読み込んでいます..." />;
  }

  return (
    <>
      <PageHeader title="タスクの詳細" backHref="/" />
      {error ? (
        // API取得に失敗したときの表示。
        <ErrorState description="タスク情報を取得できませんでした。" />
      ) : task ? (
        <>
          {/* APIから取得したタスク名・期限・達成条件を表示する。 */}
          <TaskInfoCard
            title={task.title}
            deadline={formatDeadline(task.deadlineAt)}
            condition={task.achievementCondition}
          />

          {/* 審査中のタスクだけ異議申し立てボタンを表示する。 */}
          {task.status === "reviewing" ? (
            <ObjectionButton
              onClick={() => {
                router.push(`/tasks/${encodeURIComponent(taskId)}/objection`);
              }}
            />
          ) : (
            // 審査中でない場合は、証拠確認の対象外であることを表示する。
            <EmptyState
              title="確認できる証拠はありません"
              description="証拠の確認と異議申し立ては、審査中のタスクで利用できます。"
            />
          )}
        </>
      ) : null}
      <BottomNavigation />
    </>
  );
}