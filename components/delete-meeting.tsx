"use client";

import { useState, useTransition } from "react";
import { Button, ConfirmDialog } from "tpass-ui";
import { deleteMeetingAction } from "@/lib/actions";

export function DeleteMeetingButton({ meetingId, title }: { meetingId: number; title: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      await deleteMeetingAction(meetingId);
      setOpen(false);
    });
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)} disabled={pending}>
        {pending ? "刪除中…" : "刪除會議"}
      </Button>
      <ConfirmDialog
        open={open}
        title={`確定要刪除「${title}」嗎？`}
        description="刪除後無法復原。"
        confirmLabel="刪除"
        pending={pending}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
