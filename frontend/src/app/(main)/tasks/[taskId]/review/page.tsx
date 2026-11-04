"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "../../../../../components/layout/PageHeader";
import { ObjectionButton } from "../../../../../components/layout/ObjectionButton";
import { ReviewStatusPanel } from "../../../../../components/layout/ReviewStatusPanel";
import { SubmitterMemo } from "../../../../../components/layout/SubmitterMemo";
import { TaskInfoCard } from "../../../../../components/tasks/TaskInfoCard";
import { BottomNavigation } from "../../../../../components/layout/BottomNavigation";
import { ImagePreview } from "../../../../../components/ui/ImagePreview";
import { EmptyState } from "../../../../../components/ui/EmptyState";
import { Loading } from "../../../../../components/ui/Loading";
import { getMockTaskReview } from "../../../../../lib/mockTaskReview";

export default function ReviewHome() {
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    setIsReady(true);
  }, []);
  const data = getMockTaskReview(taskId);
  if (!data) notFound();
  if (!isReady) return <Loading message="タスクを読み込んでいます..." />;

  return (
    <>
      <PageHeader title="タスクの詳細" backHref="/" />
      <TaskInfoCard
        title={data.taskTitle}
        deadline={data.deadline}
        submitter={data.submitter}
      />
      {data.canObject ? (
        <>
          <ImagePreview images={data.evidenceImages} />
          <SubmitterMemo memo={data.memo} />
          {data.submittedAt && data.reviewEndsAt && (
            <ReviewStatusPanel
              submittedAt={data.submittedAt}
              reviewEndsAt={data.reviewEndsAt}
            />
          )}
          <ObjectionButton
            onClick={() => {
              router.push(`/tasks/${encodeURIComponent(taskId)}/objection`);
            }}
          />
        </>
      ) : (
        <EmptyState
          title="確認できる証拠はありません"
          description="証拠の確認と異議申し立ては、審査中のタスクで利用できます。"
        />
      )}
      <BottomNavigation />
    </>
  );
}
