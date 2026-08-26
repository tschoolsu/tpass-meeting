"use client";

import { useTransition } from "react";
import { deleteMeetingAction } from "@/lib/actions";
import { Button } from "@/components/ui";

export function DeleteMeetingButton({ meetingId, title }: { meetingId: number; title: string }) {
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!window.confirm(`確定要刪除「${title}」嗎？刪除後無法復原。`)) return;
    startTransition(async () => {
      await deleteMeetingAction(meetingId);
    });
  }

  return (
    <Button variant="destructive" onClick={confirm} disabled={pending}>
      {pending ? "刪除中…" : "刪除會議"}
    </Button>
  );
}
