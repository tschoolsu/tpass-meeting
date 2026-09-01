// /chair?id=<meetingId> —— 主席控制台：開會時的即時操作（設現行議程、開／停表決）。
// 籌備（改議程、改名單）在 /manage；這裡不重複列議程，ChairControls 已經全列了。
import { notFound } from "next/navigation";
import { isAdmin, requireManager } from "@/lib/auth";
import { getMeetingDetail } from "@/lib/meetings";
import { authConfig } from "@/config/auth";
import { derivePhase, MANAGE_PHASE_META } from "@/lib/meeting-status";
import { ChairControls } from "@/components/chair-controls";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { CopyLinkButton } from "@/components/copy-link";
import { Forbidden } from "@/components/forbidden";
import { Badge, Card } from "tpass-ui";
import { LinkButton } from "@/components/link-button";

export const dynamic = "force-dynamic";

export default async function ChairPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  if (!rawId || !/^\d{1,9}$/.test(rawId)) notFound();
  const id = Number(rawId);

  const session = await requireManager(`/chair?id=${id}`);
  const detail = await getMeetingDetail(id);
  if (!detail) notFound();

  const { meeting, agenda } = detail;
  if (!(isAdmin(session) || meeting.owner_sub === session.sub)) {
    return <Forbidden message="只有這場會議的建立者或管理員可以使用主席控制台。" />;
  }
  const phase = derivePhase(meeting.status, meeting.starts_at);

  return (
    <div className="mx-auto max-w-3xl">
      <LiveAutoRefresh meetingId={id} />
      <div className="flex flex-wrap items-center gap-2">
        <LinkButton href={`/manage?id=${id}`} size="sm">
          ← 回工作台
        </LinkButton>
        <LinkButton href={`/display?id=${id}`} size="sm">
          投放畫面
        </LinkButton>
        <LinkButton href={`/checkin?id=${id}`} size="sm">
          簽到台
        </LinkButton>
        <CopyLinkButton url={`${authConfig.selfUrl}/display?id=${id}`} label="複製投放連結" />
      </div>

      <Card className="mt-6 shadow-[6px_6px_0_0_var(--color-foreground)]">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={MANAGE_PHASE_META[phase].badgeClass}>{MANAGE_PHASE_META[phase].label}</Badge>
          <span className="font-mono text-xs font-bold text-muted-foreground">主席控制台</span>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold">{meeting.title}</h1>
        {phase === "closed" ? (
          <p className="mt-2 text-sm font-bold text-muted-foreground">會議已結束，表決已鎖定。要再開放請到工作台 ① 重新開啟。</p>
        ) : phase === "scheduled" ? (
          <p className="mt-2 text-sm font-bold text-muted-foreground">會議尚未到開始時間，開放表決前參與人還不能投票。</p>
        ) : null}
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
    </div>
  );
}
