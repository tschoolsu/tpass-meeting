"use client";

// 工作台 ④：會議紀錄 + 協作者。紀錄用既有 NoteBar 新增；協作者（可寫紀錄、可代簽到）
// 在這裡授權——這是 addNoteEditorAction 唯一的 UI 入口。撤銷尚未提供（已知缺口）。
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input } from "tpass-ui";
import type { MeetingEditor, MeetingNote } from "@/lib/meetings";
import { addNoteEditorAction } from "@/lib/actions";
import { formatTaipei } from "@/lib/time";
import { NoteBar } from "@/components/note-bar";
import { displayName } from "@/lib/names";

export function NotesPanel({ meetingId, notes, editors }: { meetingId: number; notes: MeetingNote[]; editors: MeetingEditor[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        {notes.map((n) => (
          <Card key={n.id} className="p-4 shadow-[2px_2px_0_0_var(--color-foreground)]">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold">{n.author_name}</span>
              <span className="font-mono text-[11px] font-bold text-muted-foreground">{formatTaipei(n.created_at)}</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">{n.body}</p>
          </Card>
        ))}
        {notes.length === 0 ? <p className="text-sm font-medium text-muted-foreground">尚無紀錄。</p> : null}
      </div>
      <NoteBar meetingId={meetingId} canNote />
      <EditorsBlock meetingId={meetingId} editors={editors} />
    </div>
  );
}

function EditorsBlock({ meetingId, editors }: { meetingId: number; editors: MeetingEditor[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");
    setBusy(true);
    setError(null);
    const res = await addNoteEditorAction(meetingId, email);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-foreground/40 p-4">
      <p className="text-sm font-extrabold">協作者</p>
      <p className="mt-0.5 text-xs font-medium text-muted-foreground">被授權的人可以在會議頁寫紀錄、在簽到台代簽到。目前無法撤銷，請謹慎授權。</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {editors.map((ed) => (
          <Badge key={ed.email} title={ed.email}>{displayName(ed)}</Badge>
        ))}
        {editors.length === 0 ? <li className="text-sm font-medium text-muted-foreground">尚未授權任何人。</li> : null}
      </ul>
      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input name="email" type="email" required placeholder="協作者的學校信箱" className="sm:max-w-sm" aria-label="協作者信箱" />
        <Button type="submit" size="sm" variant="accent" disabled={busy} className="shrink-0">
          {busy ? "授權中…" : "授權"}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 font-mono text-xs font-bold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
