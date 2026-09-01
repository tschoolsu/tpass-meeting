import type { ReactNode } from "react";
import { Label } from "tpass-ui";

// 表單欄位：Label（＋右側 hint）包住輸入元件。輸入元件一律來自 tpass-ui。
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint ? <span className="text-xs font-medium text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}
