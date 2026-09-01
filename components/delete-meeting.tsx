"use client";

// 刪除會議：ConfirmActionButton 的薄包裝（錯誤就地顯示，不再靜默關掉對話框）。
// 工作台用 afterDelete="home"（刪完回首頁）；首頁卡片用 "stay"（refresh 列表即可）。
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { deleteMeetingAction } from "@/lib/actions";

export function DeleteMeetingButton({
  meetingId,
  title,
  afterDelete = "stay",
  size = "md",
  variant = "destructive",
}: {
  meetingId: number;
  title: string;
  afterDelete?: "home" | "stay";
  size?: "sm" | "md";
  variant?: "destructive" | "ghost";
}) {
  return (
    <ConfirmActionButton
      size={size}
      variant={variant}
      label="刪除會議"
      pendingLabel="刪除中…"
      action={() => deleteMeetingAction(meetingId)}
      navigateTo={afterDelete === "home" ? "/" : undefined}
      confirm={{
        title: `確定要刪除「${title}」嗎？`,
        description: "名單、簽到、議程、表決案、票數、會議紀錄與附件檔案會一併刪除，無法復原。",
        confirmLabel: "刪除",
      }}
    />
  );
}
