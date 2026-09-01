"use client";

// 工作台 ②：名單的唯一入口。上半是名單（每列可移除），下半是帶入工具
// （貼上 email[,年級] 或上傳 CSV）。格式只有這一種，解析在 lib/validation.ts 的 parseParticipantLines。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Textarea } from "tpass-ui";
import type { Participant } from "@/lib/meetings";
import { addParticipantEmailsAction, removeParticipantAction } from "@/lib/actions";
import { Field } from "@/components/field";
import { FileInput } from "@/components/file-input";
import { ConfirmActionButton } from "@/components/confirm-action-button";

export function ParticipantsPanel({ meetingId, participants }: { meetingId: number; participants: Participant[] }) {
  return (
    <div className="flex flex-col gap-5">
      <ul className="divide-y-2 divide-dashed divide-foreground/15">
        {participants.map((p) => (
          <li key={p.email} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate font-mono text-sm font-bold">
              {p.email}
              {p.grade ? <span className="ml-2 text-xs text-muted-foreground">[{p.grade}]</span> : null}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {p.checked_in ? <Badge className="bg-tone-green-badge">已簽到</Badge> : <Badge>未簽到</Badge>}
              <ConfirmActionButton
                size="sm"
                variant="ghost"
                label="移除"
                action={() => removeParticipantAction(meetingId, p.email)}
                confirm={{
                  title: `確定要把 ${p.email} 移出名單嗎？`,
                  description: "只移除名單；他已投的票不受影響。之後可以再加回來。",
                  confirmLabel: "移除",
                }}
              />
            </span>
          </li>
        ))}
        {participants.length === 0 ? (
          <li className="py-3 text-sm font-medium text-muted-foreground">尚未加入任何參與人，用下方工具貼上名單。</li>
        ) : null}
      </ul>
      <BulkImport meetingId={meetingId} />
    </div>
  );
}

function BulkImport({ meetingId }: { meetingId: number }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [grade, setGrade] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function submit(formData: FormData) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const res = await addParticipantEmailsAction(meetingId, {}, formData);
    setBusy(false);
    if (res.error) {
      setMsg(res.error);
    } else {
      setMsg(`已帶入 ${res.added ?? 0} 名參與人`);
      setText("");
      router.refresh();
    }
  }

  return (
    <form action={submit} className="space-y-3 rounded-xl border-2 border-dashed border-foreground/40 p-4">
      <p className="text-sm font-extrabold">＋ 帶入名單</p>
      <Field label="名單內容" htmlFor={`bulk-text${meetingId}`} hint="每行一人：email 或 email,年級">
        <Textarea
          id={`bulk-text${meetingId}`}
          name="participants"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder={"stu1@example.com,高一\nstu2@example.com,高二\nstu3@example.com"}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="或上傳 CSV／文字檔" htmlFor={`bulk-file${meetingId}`}>
          <FileInput
            id={`bulk-file${meetingId}`}
            accept=".csv,.txt,text/plain"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </Field>
        <Field label="預設年級" htmlFor={`bulk-grade${meetingId}`} hint="可留空；每行自己的年級優先">
          <Input id={`bulk-grade${meetingId}`} name="grade" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="例：高一" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy || !text.trim()}>
          {busy ? "帶入中…" : "帶入名單"}
        </Button>
        {msg ? <Badge className={msg.startsWith("已") ? "bg-tone-green-badge" : "bg-destructive/10"}>{msg}</Badge> : null}
      </div>
      <p className="text-xs font-medium text-muted-foreground">重複的信箱會更新年級、不會重複加入。</p>
    </form>
  );
}
