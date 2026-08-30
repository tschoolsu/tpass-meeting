import { notFound, redirect } from "next/navigation";
import { isAdmin, requireAccess } from "@/lib/auth";
import { getMeetingDetail } from "@/lib/meetings";
import { toDatetimeLocal } from "@/lib/time";
import { MeetingForm } from "@/components/meeting-form";
import { canStudentCreate } from "@/lib/permissions";
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
  const session = await requireAccess(returnPath);

  // 新增：一般學生存取透過全置開關（需求 1c）
  if (!rawId && !canStudentCreate(session)) {
    redirect("/");
  }

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
      location: detail.meeting.location,
      onlineLink: detail.meeting.online_link,
      description: detail.meeting.description,
    };
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={meetingId ? "編輯會議記錄" : "創建會議記錄"}
        desc={
          meetingId
            ? "修改會議資訊；已完成的簽到紀錄會保留。議程與表決請至會議頁新增。"
            : "填寫會議資訊並邀請參與人，建立後可新增議程、表決並簽到。"
        }
        right={<BtnLink href="/">← 返回首頁</BtnLink>}
      />
      <MeetingForm departments={departments()} meetingId={meetingId} initial={initial} />
    </div>
  );
}
