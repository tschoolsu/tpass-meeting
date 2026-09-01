"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { staffCheckInAction } from "@/lib/actions";
import { Badge, Button, Card } from "tpass-ui";

export function StaffCheckin({
  meetingId,
  participants,
}: {
  meetingId: number;
  participants: { email: string; name: string; grade: string; checked_in: boolean }[];
}) {
  const router = useRouter();
  const [grade, setGrade] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grades = useMemo(
    () => [...new Set(participants.map((p) => p.grade).filter(Boolean))].sort(),
    [participants],
  );
  const filtered = grade ? participants.filter((p) => p.grade === grade) : participants;
  const doneCount = filtered.filter((p) => p.checked_in).length;

  async function checkIn(email: string) {
    setBusy(email);
    setError(null);
    const res = await staffCheckInAction(meetingId, email);
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">簽到管理（工作人員）</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">年級：</span>
          <Button type="button" size="sm" variant={grade === "" ? "accent" : "default"} onClick={() => setGrade("")}>
            全部
          </Button>
          {grades.map((g) => (
            <Button key={g} type="button" size="sm" variant={grade === g ? "accent" : "default"} onClick={() => setGrade(g)}>
              {g}
            </Button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-xs font-bold text-muted-foreground">
        已簽到 {doneCount}／{filtered.length}
      </p>

      <ul className="mt-4 divide-y-2 divide-dashed divide-foreground/15">
        {filtered.map((p) => (
          <li key={p.email} className="flex items-center justify-between gap-3 py-2.5">
            <span className="font-mono text-sm font-bold">
              {p.name}
              {p.name !== p.email ? (
                <span className="ml-1.5 text-xs font-bold text-muted-foreground">{p.email}</span>
              ) : null}
              {p.grade ? <span className="ml-1.5 text-xs font-bold text-muted-foreground">[{p.grade}]</span> : null}
            </span>
            {p.checked_in ? (
              <Badge className="bg-tone-green-badge">已簽到</Badge>
            ) : (
              <Button variant="primary" size="sm" disabled={busy === p.email} onClick={() => checkIn(p.email)}>
                {busy === p.email ? "簽到中…" : "代簽到"}
              </Button>
            )}
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="py-4 text-center text-sm text-muted-foreground">沒有符合的參與人。</li>
        ) : null}
      </ul>

      {error ? (
        <p role="alert" className="mt-3 rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
