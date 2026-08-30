"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addParticipantEmailsAction } from "@/lib/actions";
import { Button, Card, Field, FileInput, Input, Textarea, Tag } from "@/components/ui";

export function ParticipantBulk({ meetingId }: { meetingId: number }) {
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
      setMsg(`已帶入 ${res.added ?? 0} 名與會者`);
      setText("");
      router.refresh();
    }
  }

  return (
    <Card className="mt-4">
      <p className="text-sm font-extrabold">帶入學生名單（文字／CSV，每行 email 或 email,年級）</p>
      <form action={submit} className="mt-3 space-y-3">
        <Field label="名單內容" htmlFor={`bulk-text${meetingId}`} hint="例：a@tschool.tp.edu.tw,高一">
          <Textarea
            id={`bulk-text${meetingId}`}
            name="participants"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={"stu1@tschool.tp.edu.tw,高一\nstu2@tschool.tp.edu.tw,高二\nstu3@tschool.tp.edu.tw"}
          />
        </Field>
        <Field label="CSV 檔上傳" htmlFor={`bulk-file${meetingId}`}>
          <FileInput
            id={`bulk-file${meetingId}`}
            type="file"
            accept=".csv,.txt,text/plain"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </Field>
        <Field label="預設年級（可留空，優先採用每行的年級）" htmlFor={`bulk-grade${meetingId}`}>
          <Input id={`bulk-grade${meetingId}`} name="grade" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="例如：高一" />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={busy || !text.trim()}>
            {busy ? "帶入中…" : "帶入名單"}
          </Button>
          {msg ? <Tag className={msg.startsWith("已") ? "bg-tone-badge" : "bg-destructive/10"}>{msg}</Tag> : null}
        </div>
        <p className="text-xs font-medium text-muted-foreground">
          支援以換行、逗號或分號分隔；每行第二欄為年級（可省略）。重複信箱會自動更新年級、不重複新增。
        </p>
      </form>
    </Card>
  );
}
