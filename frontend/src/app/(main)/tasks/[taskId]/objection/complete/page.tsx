"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomNavigation } from "../../../../../../components/layout/BottomNavigation";
import { ObjectionCompleteContent } from "../../../../../../components/layout/ObjectionCompleteContent";
import { ObjectionCompleteHero } from "../../../../../../components/layout/ObjectionCompleteHero";
import { ObjectionConfirmation } from "../../../../../../components/layout/ObjectionConfirmation";
import { PageHeader } from "../../../../../../components/layout/PageHeader";
import { Button } from "../../../../../../components/ui/Button";
import styles from "../../../../../../components/layout/ObjectionCompleteContent.module.css";
import { SubmitterMemo } from "../../../../../../components/layout/SubmitterMemo";
import { TaskInfoCard } from "../../../../../../components/tasks/TaskInfoCard";
import { ImagePreview } from "../../../../../../components/ui/ImagePreview";
import { getMockTaskReview } from "../../../../../../lib/mockTaskReview";
import {
  readObjectionDraft,
  type ObjectionDraft,
} from "../../../../../../lib/objectionDraft";

export default function ObjectionCompletePage() {
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();
  const data = getMockTaskReview(taskId);
  const inputPath = `/tasks/${encodeURIComponent(taskId)}/objection`;
  const [completed, setCompleted] = useState<ObjectionDraft | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    setCompleted(null);
    setStorageError(null);
    try {
      const saved = readObjectionDraft(`objection-complete:${taskId}`);
      if (!saved || !data?.canObject) {
        router.replace(inputPath);
        return;
      }
      setCompleted(saved);
    } catch {
      setStorageError("保存内容を読み込めませんでした。入力画面に戻ってやり直してください。");
    }
  }, [router, taskId, inputPath, data?.canObject]);

  if (!data) notFound();

  return (
    <>
      <PageHeader title="入力内容の保存" backHref={inputPath} />
      <ObjectionCompleteContent>
        {completed ? (
          <>
            <ObjectionCompleteHero />
            <TaskInfoCard
              title={data.taskTitle}
              deadline={data.deadline}
              submitter={data.submitter}
            />
            <ImagePreview images={data.evidenceImages} />
            <SubmitterMemo memo={data.memo} />
            <ObjectionConfirmation
              reasonType={completed.reasonType}
              reasonDetail={completed.reasonDetail}
            />
          </>
        ) : storageError ? (
          <p role="alert">{storageError}</p>
        ) : (
          <p>保存内容を読み込んでいます...</p>
        )}
        <div className={styles["action"]}>
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => {
              router.push("/");
            }}
          >
            ‹ フレンドのタスク一覧に戻る
          </Button>
        </div>
      </ObjectionCompleteContent>
      <BottomNavigation />
    </>
  );
}
