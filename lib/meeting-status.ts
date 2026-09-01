// 會議狀態的推導、轉移合法性、兩份 label map、學生端 CTA 決策。
// 純函式、無 IO、無 server-only：server / client component 與測試都能 import。
// 不參與任何權限或寫入判斷——那些在 lib/actions.ts。

/** DB 實際存的值。`live` 只為相容舊資料與備份匯入，畫面上不由人設定。 */
export type MeetingStatus = "draft" | "published" | "live" | "closed";
/** 畫面用的推導值：published 依開始時間再分成「待開始」與「進行中」。 */
export type MeetingPhase = "draft" | "scheduled" | "live" | "closed";

export const PHASE_ORDER: readonly MeetingPhase[] = ["draft", "scheduled", "live", "closed"];

export function derivePhase(status: string, startsAt: string | Date, now: number = Date.now()): MeetingPhase {
  if (status === "closed") return "closed";
  if (status === "published" || status === "live") {
    const t = typeof startsAt === "string" ? new Date(startsAt).getTime() : startsAt.getTime();
    return t <= now ? "live" : "scheduled";
  }
  return "draft";
}

/** 人能按的狀態轉移：發布、結束、重新開啟（closed→published，不寄信）。其餘一律不合法。 */
export function canTransition(from: string, to: string): boolean {
  if (to === "published") return from === "draft" || from === "closed";
  if (to === "closed") return from === "published" || from === "live";
  return false;
}

interface PhaseMeta {
  label: string;
  badgeClass: string;
}

/** 管理端：帶待辦動詞，給要動手的人看。 */
export const MANAGE_PHASE_META: Record<MeetingPhase, PhaseMeta> = {
  draft: { label: "草稿・待發布", badgeClass: "bg-card" },
  scheduled: { label: "已發布・待開始", badgeClass: "bg-tone-blue-badge text-tone-blue-text" },
  live: { label: "進行中", badgeClass: "bg-tone-green-badge text-tone-green-text" },
  closed: { label: "已結束", badgeClass: "bg-muted text-muted-foreground" },
};

/** 學生端：只講觀察到的事實。 */
export const PUBLIC_PHASE_META: Record<MeetingPhase, PhaseMeta> = {
  draft: { label: "籌備中", badgeClass: "bg-muted text-muted-foreground" },
  scheduled: { label: "即將舉行", badgeClass: "bg-tone-blue-badge text-tone-blue-text" },
  live: { label: "進行中", badgeClass: "bg-tone-green-badge text-tone-green-text" },
  closed: { label: "已結束", badgeClass: "bg-muted text-muted-foreground" },
};

/** 表決案三態，全站唯一一份文案。 */
export const MOTION_STATUS_LABEL = { "": "尚未開放", open: "表決中", closed: "已結算" } as const;

export function motionLabel(status: string): string {
  return (MOTION_STATUS_LABEL as Record<string, string>)[status] ?? MOTION_STATUS_LABEL[""];
}

export interface WorkbenchCounts {
  participants: number;
  checkedIn: number;
  agenda: number;
  motions: number;
  openMotions: number;
  closedMotions: number;
  notes: number;
  editors: number;
}

export interface PrecheckItem {
  label: string;
  ok: boolean;
  detail?: string;
  /** ok=false 且 blocking=true 才擋住發布；非 blocking 的只是建議。 */
  blocking: boolean;
}

/** 發布前的檢查表：名單 0 人擋住，議程 0 項只建議。 */
export function publishPrecheck(c: WorkbenchCounts): PrecheckItem[] {
  return [
    { label: "基本資料已填", ok: true, blocking: false },
    {
      label: `參與人 ${c.participants} 人`,
      ok: c.participants > 0,
      detail: c.participants === 0 ? "至少要有一位參與人才能發布" : undefined,
      blocking: true,
    },
    {
      label: `議程 ${c.agenda} 項、表決案 ${c.motions} 案`,
      ok: c.agenda > 0,
      detail: c.agenda === 0 ? "建議先建好議程再發布，發布後仍可修改" : undefined,
      blocking: false,
    },
  ];
}

export function isPublishBlocked(items: PrecheckItem[]): boolean {
  return items.some((i) => i.blocking && !i.ok);
}

export type PrimaryCta =
  | { kind: "link"; href: string; label: string; pulse?: boolean }
  | { kind: "note"; text: string };

/** 學生在 /read 看到的唯一主要動作。回 null 代表「什麼都不用做」。 */
export function primaryCtaFor(input: {
  phase: MeetingPhase;
  meetingId: number;
  isParticipant: boolean;
  checkedIn: boolean;
  openMotionId: number | null;
  startsAtLabel: string;
}): PrimaryCta | null {
  const { phase, meetingId, isParticipant, checkedIn, openMotionId, startsAtLabel } = input;
  if (!isParticipant) return null;
  switch (phase) {
    case "draft":
      return { kind: "note", text: "主辦尚未發布這場會議，請稍候。" };
    case "scheduled":
      return { kind: "note", text: `簽到於 ${startsAtLabel} 開始後開放` };
    case "live":
      if (!checkedIn) return { kind: "link", href: `/checkin?id=${meetingId}`, label: "前往簽到" };
      if (openMotionId !== null)
        return { kind: "link", href: `/vote?id=${openMotionId}`, label: "前往表決（進行中）", pulse: true };
      return { kind: "note", text: "你已完成簽到，等待主席開放表決。" };
    case "closed":
      return null;
  }
}
