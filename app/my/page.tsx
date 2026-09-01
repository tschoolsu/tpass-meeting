import { requireAccess } from "@/lib/auth";
import { listMyMeetings } from "@/lib/meetings";
import { isStarted } from "@/lib/time";
import { Badge, Card } from "tpass-ui";
import { PageHeader } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";

export const dynamic = "force-dynamic";

// /my —— 一般學生的「我受邀／需參加的會議」入口（需求 1b）。
export default async function MyMeetingsPage() {
  const session = await requireAccess("/my");
  const meetings = await listMyMeetings(session.email);

  return (
    <div>
      <PageHeader
        title="我受邀的會議"
        desc="你被邀請參加或需出席的會議清單。點擊即可檢視詳細內容並進行簽到與表決。"
      />
      {meetings.length === 0 ? (
        <Card>
          <p className="text-sm font-medium text-muted-foreground">
            你目前沒有受邀的任何會議。
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {meetings.map((m) => {
            const started = isStarted(m.starts_at);
            return (
              <Card key={m.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {m.department ? <Badge className="bg-tone-green-badge">{m.department}</Badge> : null}
                      <Badge className={started ? "bg-accent/10" : "bg-secondary"}>
                        {started ? "進行中" : "尚未開始"}
                      </Badge>
                    </div>
                    <h2 className="mt-2 text-lg font-extrabold">{m.title}</h2>
                  </div>
                  <LinkButton href={`/read?id=${m.id}`} variant="primary">
                    檢視
                  </LinkButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
