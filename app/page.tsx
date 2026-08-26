import { isModerator, requireAccess } from "@/lib/auth";
import { listMeetings } from "@/lib/meetings";
import { MeetingFilter } from "@/components/meeting-filter";
import { BtnLink, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

function departments(): string[] {
  return (process.env.DEPARTMENTS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

export default async function HomePage() {
  const session = await requireAccess("/");
  const [meetings] = await Promise.all([listMeetings()]);

  return (
    <div>
      <PageHeader
        title="會議列表"
        desc="條列顯示所有會議記錄，可使用搜尋或部會標籤篩選。"
        right={
          isModerator(session) ? (
            <BtnLink href="/create" variant="primary">
              ＋ 創建會議記錄
            </BtnLink>
          ) : undefined
        }
      />
      <MeetingFilter meetings={meetings} departments={departments()} canCreate={isModerator(session)} />
    </div>
  );
}
