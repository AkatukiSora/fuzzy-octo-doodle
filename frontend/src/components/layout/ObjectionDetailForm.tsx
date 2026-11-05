"use client";

import { Textarea } from "../ui/Textarea";

interface ObjectionDetailFormProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}

export function ObjectionDetailForm({
  value,
  onChange,
  maxLength = 200,
}: ObjectionDetailFormProps) {
  return (
    <Textarea
      label="詳細な理由"
      required
      value={value}
      maxLength={maxLength}
      showCount
      placeholder="具体的な理由を入力してください。"
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}
