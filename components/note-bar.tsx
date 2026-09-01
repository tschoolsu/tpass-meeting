"use client";

import { useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { noteAction } from "@/lib/actions";
import { Button, Card, Label, Textarea } from "tpass-ui";

export function NoteBar({ meetingId, canNote }: { meetingId: number; canNote: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (!canNote) {
    return (
      <p className="rounded-xl border-2 border-foreground bg-secondary px-4 py-3 text-sm font-medium text-muted-foreground">
        只有會議創建者與被授權成員可新增/編輯會議記錄。
      </p>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "");
    startTransition(async () => {
      const res = await noteAction(meetingId, body);
      if (res.error) {
        setError(res.error);
      } else {
        setError(null);
        formRef.current?.reset();
      }
    });
  }

  return (
    <Card>
      <form ref={formRef} onSubmit={submit}>
        <Label htmlFor="note-body" className="mb-1.5">
          新增紀錄
        </Label>
        <p className="mb-3 text-xs font-medium text-muted-foreground">
          可貼上會議連結、待辦事項或任何想記錄的內容。
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Textarea
            id="note-body"
            name="body"
            rows={2}
            maxLength={5000}
            placeholder="例：https://meet.example.com/…，下次會議需討論議題 A…"
          />
          <Button
            type="submit"
            variant="primary"
            disabled={pending}
            className="shrink-0 sm:self-end"
          >
            {pending ? "送出中…" : "送出"}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mt-3 rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-2 text-sm font-bold text-destructive">
            {error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
