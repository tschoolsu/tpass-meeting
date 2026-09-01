import type { ReactNode } from "react";

export function PageHeader({ title, desc, right }: { title: ReactNode; desc?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {desc ? <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{desc}</p> : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}
