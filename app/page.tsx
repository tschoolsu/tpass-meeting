import { isModerator, requireAccess } from "@/lib/auth";
import { listMeetings, listMyMeetings } from "@/lib/meetings";
import { MeetingFilter } from "@/components/meeting-filter";
import { canStudentCreate } from "@/lib/permissions";
import { listDepartments } from "@/lib/departments";
import { PageHeader } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await requireAccess("/");
  const isManager = isModerator(session);
  const allowCreate = isManager || canStudentCreate(session);

  // 一般學生只能看到自己受邀的會議（需求 1b），無法看到管理清單。
  const meetings = isManager ? await listMeetings() : await listMyMeetings(session.email);
  // 篩選下拉：DB 的部會清單，加上既有會議用過但已被刪掉的部會，舊會議才篩得到。
  const departments = [...new Set([...(await listDepartments()), ...meetings.map((m) => m.department).filter(Boolean)])];

  return (
    <div>
      <PageHeader
        title={isManager ? "會議列表" : "我受邀的會議"}
        desc={
          isManager
            ? "條列顯示所有會議記錄，可使用搜尋或部會標籤篩選。"
            : "下方為你受邀或需出席的會議；其他會議紀錄對一般學生不公開。"
        }
        right={
          allowCreate ? (
            <LinkButton href="/create" variant="primary">
              ＋ 創建會議記錄
            </LinkButton>
          ) : undefined
        }
      />

      <MeetingFilter meetings={meetings} departments={departments} canCreate={allowCreate} />
    </div>
  );
}
