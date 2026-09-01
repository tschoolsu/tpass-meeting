import { notFound } from "next/navigation";
import { isAdmin, requireManager } from "@/lib/auth";
import { getMeetingDetail } from "@/lib/meetings";
import { ChairControls } from "@/components/chair-controls";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { Badge, Card } from "tpass-ui";
import { LinkButton } from "@/components/link-button";

export const dynamic = "force-dynamic";

// /chair?id=<meetingId> —— 主席控制台（需求 3）。
export default async function ChairPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  if (!rawId || !/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);

  const session = await requireManager(`/chair?id=${id}`);
  const detail = await getMeetingDetail(id);
  if (!detail) notFound();

  const { meeting, agenda } = detail;
  const canChair = isAdmin(session) || meeting.owner_sub === session.sub;
  if (!canChair) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <LiveAutoRefresh meetingId={id} />
<LinkButton href={`/read?id=${id}`}>
        ← 返回會議
      </LinkButton>

      <Card className="mt-6 shadow-[6px_6px_0_0_var(--color-foreground)]">
        <h1 className="text-2xl font-extrabold">{meeting.title}</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">主席控制台</p>
      </Card>

      <div className="mt-6">
        <ChairControls
          meetingId={id}
          currentId={detail.current?.id ?? null}
          agenda={agenda.map((a) => ({
            id: a.id,
            title: a.title,
            motions: a.motions.map((m) => ({ id: m.id, title: m.title, status: m.status })),
          }))}
        />
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-extrabold">完整議程</h2>
        <div className="flex flex-col gap-3">
          {agenda.map((a) => (
            <Card key={a.id}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-extrabold">#{a.position + 1} {a.title}</h3>
              </div>
              {a.motions.map((m) => (
                <div key={m.id} className="mt-2 flex items-center justify-between rounded-lg border-2 border-foreground bg-tone-green-bg px-3 py-2">
                  <span className="text-sm font-bold">{m.title}</span>
                  <Badge className={m.status === "open" ? "bg-accent" : m.status === "closed" ? "bg-secondary" : "bg-tone-green-badge"}>
                    {m.status === "open" ? "表決中" : m.status === "closed" ? "已結算" : "未開放"}
                  </Badge>
                </div>
              ))}
            </Card>
          ))}
          {agenda.length === 0 ? (
            <Card>
              <p className="text-sm text-muted-foreground">尚未建立議程，請回會議頁新增。</p>
            </Card>
          ) : null}
        </div>
      </section>
    </div>
  );
}
