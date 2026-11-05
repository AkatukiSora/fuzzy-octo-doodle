import { Button } from "../ui/Button";
import styles from "./ObjectionButton.module.css";

interface ObjectionButtonProps {
  onClick?: () => void;
}

export function ObjectionButton({ onClick }: ObjectionButtonProps) {
  return (
    <Button
      variant="danger"
      size="lg"
      fullWidth
      className={styles["button"]}
      onClick={onClick}
      aria-label="異議申し立てをする"
    >
      <span className={styles["content"]}>
        <span className={styles["warningIcon"]} aria-hidden="true">
          !
        </span>
        <span>異議申し立てをする</span>
        <span className={styles["arrow"]} aria-hidden="true">
          ›
        </span>
      </span>
    </Button>
  );
}
