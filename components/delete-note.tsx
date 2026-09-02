"use client";

// 刪除單則會議記錄：ConfirmActionButton 的薄包裝（與 DeleteMeetingButton 同一套路）。
// 要不要顯示由呼叫端（server component）算好，這裡不判權限——action 本身會再驗一次。
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { deleteNoteAction } from "@/lib/actions";

export function DeleteNoteButton({ meetingId, noteId }: { meetingId: number; noteId: number }) {
  return (
    <ConfirmActionButton
      size="sm"
      variant="ghost"
      label="刪除"
      pendingLabel="刪除中…"
      action={() => deleteNoteAction(meetingId, noteId)}
      confirm={{
        title: "確定要刪除這則紀錄嗎？",
        description: "刪除後無法復原。",
        confirmLabel: "刪除",
      }}
    />
  );
}
