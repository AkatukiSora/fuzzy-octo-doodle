"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomNavigation } from "../../../../../../components/layout/BottomNavigation";
import { ObjectionConfirmActions } from "../../../../../../components/layout/ObjectionConfirmActions";
import { ObjectionConfirmation } from "../../../../../../components/layout/ObjectionConfirmation";
import { ObjectionConfirmContent } from "../../../../../../components/layout/ObjectionConfirmContent";
import { PageHeader } from "../../../../../../components/layout/PageHeader";
import { SubmitterMemo } from "../../../../../../components/layout/SubmitterMemo";
import { TaskInfoCard } from "../../../../../../components/tasks/TaskInfoCard";
import { ImagePreview } from "../../../../../../components/ui/ImagePreview";
import { Loading } from "../../../../../../components/ui/Loading";
import { getMockTaskReview } from "../../../../../../lib/mockTaskReview";
import {
  readObjectionDraft,
  type ObjectionDraft,
} from "../../../../../../lib/objectionDraft";

export default function ObjectionConfirmPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();
  const data = getMockTaskReview(taskId);
  const inputPath = `/tasks/${encodeURIComponent(taskId)}/objection`;
  const [draft, setDraft] = useState<ObjectionDraft | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(null);
    setStorageError(null);
    try {
      const storedDraft = readObjectionDraft(`objection-draft:${taskId}`);
      if (!storedDraft || !data?.canObject) {
        router.replace(inputPath);
        return;
      }
      setDraft(storedDraft);
    } catch {
      setStorageError("入力内容を読み込めませんでした。入力画面に戻ってやり直してください。");
    }
  }, [router, taskId, inputPath, data?.canObject]);

  const handleSubmit = () => {
    if (!draft) return;

    try {
      // 完了画面専用にコピーし、後から下書きを編集しても保存結果は変えない。
      sessionStorage.setItem(
        `objection-complete:${taskId}`,
        JSON.stringify(draft),
      );
      setStorageError(null);
      router.push(`${inputPath}/complete`);
    } catch {
      setStorageError("入力内容を保存できませんでした。もう一度お試しください。");
    }
  };

  if (!data) notFound();
  if (!draft && !storageError) {
    return <Loading message="入力内容を読み込んでいます..." />;
  }

  return (
    <>
      <PageHeader title="内容の確認" backHref={inputPath} />
      <ObjectionConfirmContent>
        <TaskInfoCard
          title={data.taskTitle}
          deadline={data.deadline}
          submitter={data.submitter}
        />
        <ImagePreview images={data.evidenceImages} />
        <SubmitterMemo memo={data.memo} />
        {draft ? (
          <ObjectionConfirmation
            reasonType={draft.reasonType}
            reasonDetail={draft.reasonDetail}
          />
        ) : (
          !storageError && <p>入力内容を読み込んでいます...</p>
        )}
        <p>現在は画面確認用です。内容を一時保存しますが、異議申し立ては送信されません。</p>
        {storageError && <p role="alert">{storageError}</p>}
        <ObjectionConfirmActions
          onBack={() => {
            router.push(inputPath);
          }}
          onSubmit={handleSubmit}
          disabled={!draft}
        />
      </ObjectionConfirmContent>
      <BottomNavigation />
    </>
  );
}
