"use client";

import { useEffect, useState } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { ObjectionDetailForm } from "../../../../../components/layout/ObjectionDetailForm";
import { ObjectionPageContent } from "../../../../../components/layout/ObjectionPageContent";
import {
  ObjectionReasonSelector,
  type ObjectionReasonOption,
  type ObjectionReasonType,
} from "../../../../../components/layout/ObjectionReasonSelector";
import { SubmitObjectionButton } from "../../../../../components/layout/SubmitObjectionButton";
import { BottomNavigation } from "../../../../../components/layout/BottomNavigation";
import { PageHeader } from "../../../../../components/layout/PageHeader";
import { SubmitterMemo } from "../../../../../components/layout/SubmitterMemo";
import { TaskInfoCard } from "../../../../../components/tasks/TaskInfoCard";
import { ImagePreview } from "../../../../../components/ui/ImagePreview";
import { ErrorState } from "../../../../../components/ui/ErrorState";
import { Loading } from "../../../../../components/ui/Loading";
import { getMockTaskReview } from "../../../../../lib/mockTaskReview";
import { readObjectionDraft } from "../../../../../lib/objectionDraft";

const reasonOptions: readonly ObjectionReasonOption[] = [
  {
    value: "insufficient_evidence",
    title: "証拠が不十分",
    description: "写真が不鮮明・内容が確認できないなど",
  },
  {
    value: "conditions_not_met",
    title: "達成条件を満たしていない",
    description: "タスクの内容と証拠が合っていないなど",
  },
  { value: "other", title: "その他", description: "上記以外の理由" },
];

export default function ObjectionPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();
  const data = getMockTaskReview(taskId);
  const taskPath = `/tasks/${encodeURIComponent(taskId)}`;
  const [reasonType, setReasonType] = useState<ObjectionReasonType>(
    "insufficient_evidence",
  );
  const [reasonDetail, setReasonDetail] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    setIsReady(false);
    setStorageError(null);
    setReasonType("insufficient_evidence");
    setReasonDetail("");
    try {
      const draft = readObjectionDraft(`objection-draft:${taskId}`);
      if (draft) {
        setReasonType(draft.reasonType);
        setReasonDetail(draft.reasonDetail);
      }
    } catch {
      setStorageError("保存した入力内容を読み込めませんでした。再度入力してください。");
    } finally {
      setIsReady(true);
    }
  }, [taskId]);

  const handleSubmit = () => {
    if (!isReady || !reasonDetail.trim()) return;

    try {
      sessionStorage.setItem(
        `objection-draft:${taskId}`,
        JSON.stringify({ reasonType, reasonDetail: reasonDetail.trim() }),
      );
      setStorageError(null);
      router.push(`${taskPath}/objection/confirm`);
    } catch {
      setStorageError(
        "入力内容を保存できませんでした。ブラウザの保存設定を確認して、もう一度お試しください。",
      );
    }
  };

  if (!data) notFound();
  if (!isReady) return <Loading message="入力内容を読み込んでいます..." />;

  return (
    <>
      <PageHeader title="異議申し立て" backHref={`${taskPath}/review`} />
      <ObjectionPageContent>
        {data.canObject ? (
          <>
            <TaskInfoCard
              title={data.taskTitle}
              deadline={data.deadline}
              submitter={data.submitter}
            />
            <ImagePreview images={data.evidenceImages} />
            <SubmitterMemo memo={data.memo} />
            <ObjectionReasonSelector
              options={reasonOptions}
              value={reasonType}
              onChange={setReasonType}
            />
            <ObjectionDetailForm
              value={reasonDetail}
              onChange={setReasonDetail}
            />
            {storageError && <p role="alert">{storageError}</p>}
            <SubmitObjectionButton
              disabled={!reasonDetail.trim()}
              onClick={handleSubmit}
            />
          </>
        ) : (
          <ErrorState
            title="異議申し立てできません"
            description="審査中のタスクから異議申し立てを行ってください。"
          />
        )}
      </ObjectionPageContent>
      <BottomNavigation />
    </>
  );
}
