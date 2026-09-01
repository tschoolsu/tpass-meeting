import type { ReactNode } from "react";
import { Card } from "tpass-ui";

export function EmptyState({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-lg font-extrabold">{title}</p>
      {desc ? <p className="max-w-md text-sm text-muted-foreground">{desc}</p> : null}
      {action}
    </Card>
  );
}
