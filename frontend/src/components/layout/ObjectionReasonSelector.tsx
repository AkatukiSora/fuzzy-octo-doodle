"use client";

import styles from "./ObjectionReasonSelector.module.css";

export type ObjectionReasonType =
  | "insufficient_evidence"
  | "conditions_not_met"
  | "other";

export interface ObjectionReasonOption {
  value: ObjectionReasonType;
  title: string;
  description: string;
}

interface ObjectionReasonSelectorProps {
  options: readonly ObjectionReasonOption[];
  value: ObjectionReasonType | null;
  onChange: (value: ObjectionReasonType) => void;
}

function classNames(...names: (string | undefined)[]): string {
  return names.filter((name): name is string => name !== undefined).join(" ");
}

export function ObjectionReasonSelector({
  options,
  value,
  onChange,
}: ObjectionReasonSelectorProps) {
  return (
    <section className={styles["section"]}>
      <h2 className={styles["title"]}>異議の理由</h2>
      <p className={styles["hint"]}>※1つ選択してください</p>
      <div className={styles["list"]} role="radiogroup">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={classNames(
                styles["option"],
                selected ? styles["selected"] : undefined,
              )}
              onClick={() => {
                onChange(option.value);
              }}
            >
              <span
                className={classNames(
                  styles["radio"],
                  selected ? styles["radioSelected"] : undefined,
                )}
                aria-hidden="true"
              />
              <span className={styles["text"]}>
                <span className={styles["optionTitle"]}>
                  {option.title}
                </span>
                <span className={styles["description"]}>
                  {option.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
