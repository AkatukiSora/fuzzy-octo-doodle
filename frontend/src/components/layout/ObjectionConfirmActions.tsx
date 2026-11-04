import { Button } from "../ui/Button";
import styles from "./ObjectionConfirmActions.module.css";

interface ObjectionConfirmActionsProps {
  onBack: () => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export function ObjectionConfirmActions({
  onBack,
  onSubmit,
  disabled = false,
}: ObjectionConfirmActionsProps) {
  return (
    <div className={styles["actions"]}>
      <Button variant="secondary" size="md" fullWidth onClick={onBack}>
        内容を修正する
      </Button>
      <Button
        variant="danger"
        size="md"
        fullWidth
        disabled={disabled}
        onClick={onSubmit}
      >
        内容を保存して完了する
      </Button>
    </div>
  );
}
