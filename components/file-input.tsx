import type { ComponentProps } from "react";
import { Input, cn } from "tpass-ui";

// 檔案輸入：瀏覽器預設的「選擇檔案」鈕也加上 border + hard shadow，看起來才找得到。
export function FileInput({ className, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  return (
    <Input
      type="file"
      className={cn(
        "cursor-pointer file:mr-3 file:cursor-pointer file:rounded-lg file:border-2 file:border-foreground file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-foreground file:shadow-[2px_2px_0_0_var(--color-foreground)] file:transition-colors file:hover:bg-muted",
        className,
      )}
      {...props}
    />
  );
}
