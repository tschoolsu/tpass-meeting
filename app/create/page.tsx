import { notFound, redirect } from "next/navigation";
import { isAdmin, requireManager } from "@/lib/auth";
import { getMeetingDetail } from "@/lib/meetings";
import { toDatetimeLocal } from "@/lib/time";
import { MeetingForm } from "@/components/meeting-form";
import { BtnLink, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

function departments(): string[] {
  return (process.env.DEPARTMENTS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

// /create 建立；/create?id={數字} 編輯既有會議。
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;

  if (rawId && !/^\d+$/.test(rawId)) notFound();
  const returnPath = rawId ? `/create?id=${rawId}` : "/create";
  const session = await requireManager(returnPath);

  let initial = null;
  let meetingId: number | undefined;

  if (rawId) {
    meetingId = Number(rawId);
    const detail = await getMeetingDetail(meetingId);
    if (!detail) notFound();

    // 編輯權限：admin，或建立者本人（以 sub 比對，不使用 email）。
    if (!isAdmin(session) && detail.meeting.owner_sub !== session.sub) {
      redirect(`/read?id=${meetingId}`);
    }

    initial = {
      title: detail.meeting.title,
      department: detail.meeting.department,
      startsAt: toDatetimeLocal(new Date(detail.meeting.starts_at)),
      participants: detail.participants.map((p) => p.email).join("\n"),
      votingEnabled: detail.meeting.voting_enabled,
      questions: detail.vote ? detail.vote.questions.map((v) => v.question).join("\n") : "",
    };
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={meetingId ? "編輯會議記錄" : "創建會議記錄"}
        desc={
          meetingId
            ? "修改會議資訊；已完成的簽到紀錄會保留。"
            : "填寫會議資訊並邀請參與人，建立後即可進行簽到與表決。"
        }
        right={<BtnLink href="/">← 返回首頁</BtnLink>}
      />
      <MeetingForm departments={departments()} meetingId={meetingId} initial={initial} />
    </div>
  );
}
