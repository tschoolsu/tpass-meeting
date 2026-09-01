"use client";

// 工作台 ①：基本資料的檢視／編輯切換。預設唯讀，按「編輯」才展開表單；
// 底部放刪除會議，已結束時多一顆「重新開啟」。名單不在這裡（②）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "tpass-ui";
import type { Meeting } from "@/lib/meetings";
import { formatTaipei, toDatetimeLocal } from "@/lib/time";
import { setMeetingStatusAction } from "@/lib/actions";
import type { MeetingPhase } from "@/lib/meeting-status";
import { MeetingForm } from "@/components/meeting-form";
import { DeleteMeetingButton } from "@/components/delete-meeting";
import { ConfirmActionButton } from "@/components/confirm-action-button";

export function BasicsPanel({ meeting, phase, departments }: { meeting: Meeting; phase: MeetingPhase; departments: string[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <MeetingForm
        departments={departments}
        meetingId={meeting.id}
        initial={{
          title: meeting.title,
          department: meeting.department,
          startsAt: toDatetimeLocal(new Date(meeting.starts_at)),
          location: meeting.location,
          onlineLink: meeting.online_link,
          description: meeting.description,
        }}
        onSaved={() => {
          setEditing(false);
          router.refresh();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Field label="標題" value={meeting.title} />
        <Field label="時間" value={`${formatTaipei(meeting.starts_at)}（UTC+8）`} />
        <Field label="部會" value={meeting.department || "—"} />
        <Field label="地點" value={meeting.location || "—"} />
        <Field label="線上連結" value={meeting.online_link || "—"} />
        <div className="sm:col-span-2">
          <Field label="說明" value={meeting.description || "—"} pre />
        </div>
      </dl>
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t-2 border-dashed border-foreground/30 pt-4">
        <Button type="button" size="sm" onClick={() => setEditing(true)}>
          編輯基本資料
        </Button>
        {phase === "closed" ? (
          <ConfirmActionButton
            size="sm"
            variant="ghost"
            label="重新開啟會議"
            pendingLabel="開啟中…"
            action={() => setMeetingStatusAction(meeting.id, "published")}
            confirm={{
              title: "確定要重新開啟這場會議嗎？",
              description: "會回到「已發布」，參與人可以再簽到與表決。不會再寄通知信。",
              confirmLabel: "重新開啟",
            }}
          />
        ) : null}
        <span className="ml-auto">
          <DeleteMeetingButton meetingId={meeting.id} title={meeting.title} />
        </span>
      </div>
    </div>
  );
}

function Field({ label, value, pre = false }: { label: string; value: string; pre?: boolean }) {
  return (
    <div>
      <dt className="font-mono text-xs font-bold text-muted-foreground">{label}</dt>
      <dd className={pre ? "mt-0.5 whitespace-pre-wrap font-medium" : "mt-0.5 font-medium"}>{value}</dd>
    </div>
  );
}
