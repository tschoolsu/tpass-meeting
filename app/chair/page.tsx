import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin, requireManager } from "@/lib/auth";
import { getMeetingDetail } from "@/lib/meetings";
import { ChairControls } from "@/components/chair-controls";
import { Card, Tag } from "@/components/ui";

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
      <Link
        href={`/read?id=${id}`}
        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3.5 py-2 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)]"
      >
        ← 返回會議
      </Link>

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
                <div key={m.id} className="mt-2 flex items-center justify-between rounded-lg border-2 border-foreground bg-tone-bg px-3 py-2">
                  <span className="text-sm font-bold">{m.title}</span>
                  <Tag className={m.status === "open" ? "bg-accent" : m.status === "closed" ? "bg-secondary" : "bg-tone-badge"}>
                    {m.status === "open" ? "表決中" : m.status === "closed" ? "已結算" : "未開放"}
                  </Tag>
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
