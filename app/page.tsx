import { isModerator, requireAccess } from "@/lib/auth";
import { listMeetings, listMyMeetings } from "@/lib/meetings";
import { MeetingFilter } from "@/components/meeting-filter";
import { canStudentCreate } from "@/lib/permissions";
import { serviceConfig } from "@/config/service";
import { Card } from "tpass-ui";
import { PageHeader } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await requireAccess("/");
  const isManager = isModerator(session);
  const allowCreate = isManager || canStudentCreate(session);

  // 一般學生只能看到自己受邀的會議（需求 1b），無法看到管理清單。
  const meetings = isManager ? await listMeetings() : await listMyMeetings(session.email);

  return (
    <div>
      <PageHeader
        title={isManager ? "會議列表" : "所有會議"}
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

      {!isManager ? (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">我受邀的會議</h2>
            <p className="text-sm text-muted-foreground">檢視你需出席的各項會議。</p>
          </div>
          <LinkButton href="/my" variant="accent">
            前往「我受邀的會議」
          </LinkButton>
        </Card>
      ) : null}

      <MeetingFilter meetings={meetings} departments={serviceConfig.departments} canCreate={allowCreate} />
    </div>
  );
}
