"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "../../../../../components/layout/PageHeader";
import { ObjectionButton } from "../../../../../components/layout/ObjectionButton";
import { BottomNavigation } from "../../../../../components/layout/BottomNavigation";
import { TaskInfoCard } from "../../../../../components/tasks/TaskInfoCard";
import { ImagePreview } from "../../../../../components/ui/ImagePreview";
import { EmptyState } from "../../../../../components/ui/EmptyState";
import { ErrorState } from "../../../../../components/ui/ErrorState";
import { Loading } from "../../../../../components/ui/Loading";
import { fetchObjectionTask } from "../../../../../lib/objectionTaskApi";
import type { ObjectionTask } from "../../../../../lib/objectionTaskApi";
import { fetchTaskEvidences } from "../../../../../lib/taskEvidenceApi";
import type { TaskEvidencesResult } from "../../../../../lib/taskEvidenceApi";

function EvidenceSection({ taskId }: { taskId: string }) {
  const [result, setResult] = useState<TaskEvidencesResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchTaskEvidences(taskId, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult(data);
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ kind: "error", status: 0 });
    });
    return () => { controller.abort(); };
  }, [taskId]);

  if (!result) return <Loading message="証拠写真を読み込んでいます..." />;
  if (result.kind === "forbidden") {
    return <EmptyState title="証拠写真を閲覧する権限がありません" />;
  }
  if (result.kind === "error") {
    return <ErrorState description="証拠写真を取得できませんでした。画面を再読み込みしてください。" />;
  }

  const images = result.evidences.flatMap((evidence) =>
    evidence.photoUrls.map((src) => ({ src })),
  );
  if (images.length === 0) return <EmptyState title="提出された証拠写真はありません" />;
  return <ImagePreview images={images} />;
}

function TaskReview({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [task, setTask] = useState<ObjectionTask | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchObjectionTask(taskId, controller.signal).then((data) => {
      if (!controller.signal.aborted) setTask(data);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => { controller.abort(); };
  }, [taskId]);

  if (error) return <ErrorState description="タスク情報を取得できませんでした。" />;
  if (!task) return <Loading message="タスクを読み込んでいます..." />;

  const deadline = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(task.deadlineAt));

  return (
    <>
      <TaskInfoCard title={task.title} deadline={deadline} condition={task.achievementCondition} />
      <EvidenceSection key={taskId} taskId={taskId} />
      {/* 提出者メモと審査終了日時は現在のAPIに含まれないため表示しない。 */}
      {/* 表示条件は補助。申立て時の認可・状態検証はバックエンドで行う。 */}
      {task.status === "reviewing" && task.viewer === "friend" && (
        <ObjectionButton onClick={() => {
          router.push(`/tasks/${encodeURIComponent(taskId)}/objection`);
        }} />
      )}
    </>
  );
}

export default function ReviewHome() {
  const { taskId } = useParams<{ taskId: string }>();
  return (
    <>
      <PageHeader title="タスクの詳細" backHref="/" />
      <TaskReview key={taskId} taskId={taskId} />
      <BottomNavigation />
    </>
  );
}
