import { Tag } from "@/components/ui";

// 依 des.md 的 OKLCH 色票，以 SVG 畫圓餅圖，避免引入重量的圖表套件。
export function PieChart({
  yes,
  no,
  title,
  answeredByMe,
}: {
  yes: number;
  no: number;
  title: string;
  answeredByMe: boolean;
}) {
  const total = yes + no;
  const yesPct = total > 0 ? (yes / total) * 100 : 0;
  const noPct = total > 0 ? (no / total) * 100 : 0;

  const r = 50;
  const c = 2 * Math.PI * r;
  const yesLen = (yesPct / 100) * c;
  const noLen = (noPct / 100) * c;
  const rotate = -90;

  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-extrabold leading-snug">{title}</h3>
        {answeredByMe ? <Tag className="shrink-0 bg-tone-badge">已表決</Tag> : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-6">
        <svg viewBox="0 0 120 120" className="h-32 w-32" role="img" aria-label={`「${title}」表決結果`}>
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-muted)" strokeWidth="16" />
          {total > 0 ? (
            <>
              {noPct > 0 ? (
                <circle
                  cx="60"
                  cy="60"
                  r={r}
                  fill="none"
                  stroke="var(--color-destructive)"
                  strokeWidth="16"
                  strokeDasharray={`${noLen} ${c - noLen}`}
                  strokeDashoffset={0}
                  transform={`rotate(${rotate} 60 60)`}
                />
              ) : null}
              {yesPct > 0 ? (
                <circle
                  cx="60"
                  cy="60"
                  r={r}
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth="16"
                  strokeDasharray={`${yesLen} ${c - yesLen}`}
                  strokeDashoffset={-noLen}
                  transform={`rotate(${rotate} 60 60)`}
                />
              ) : null}
            </>
          ) : null}
          <text x="60" y="57" textAnchor="middle" className="fill-foreground" style={{ fontSize: 20, fontWeight: 800 }}>
            {total}
          </text>
          <text x="60" y="75" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10, fontWeight: 700 }}>
            票
          </text>
        </svg>

        <div className="flex flex-col gap-2 text-sm font-medium">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm border-2 border-foreground bg-primary" />
            <span>是（同意）</span>
            <span className="font-mono font-bold">{yes} 票</span>
            <span className="font-mono text-xs font-bold text-muted-foreground">
              {total > 0 ? `${yesPct.toFixed(0)}%` : "—"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm border-2 border-foreground bg-destructive" />
            <span>否（不同意）</span>
            <span className="font-mono font-bold">{no} 票</span>
            <span className="font-mono text-xs font-bold text-muted-foreground">
              {total > 0 ? `${noPct.toFixed(0)}%` : "—"}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs font-bold text-muted-foreground">
            {total > 0 ? `共 ${total} 人已表決` : "尚無人表決"}
          </p>
        </div>
      </div>
    </div>
  );
}
