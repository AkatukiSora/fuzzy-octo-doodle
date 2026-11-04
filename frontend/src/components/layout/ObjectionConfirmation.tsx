import type { ObjectionReasonType } from "./ObjectionReasonSelector";
import styles from "./ObjectionConfirmation.module.css";

interface ObjectionConfirmationProps {
  reasonType: ObjectionReasonType;
  reasonDetail: string;
}

const reasonLabels: Record<ObjectionReasonType, string> = {
  insufficient_evidence: "証拠が不十分",
  conditions_not_met: "達成条件を満たしていない",
  other: "その他",
};

export function ObjectionConfirmation({
  reasonType,
  reasonDetail,
}: ObjectionConfirmationProps) {
  return (
    <section className={styles["card"]} aria-labelledby="confirmation-title">
      <h2 id="confirmation-title" className={styles["title"]}>
        異議申し立て内容
      </h2>
      <dl className={styles["list"]}>
        <div className={styles["row"]}>
          <dt>異議の理由</dt>
          <dd>{reasonLabels[reasonType]}</dd>
        </div>
        <div className={styles["row"]}>
          <dt>詳細な理由</dt>
          <dd className={styles["detail"]}>{reasonDetail}</dd>
        </div>
      </dl>
    </section>
  );
}
