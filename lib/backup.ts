import "server-only";
import { prisma } from "@/lib/db";
import { dateFromYmd, dateOnly } from "@/lib/meetings";
import { toDatetimeLocal } from "@/lib/time";
import { ValidationError } from "@/lib/validation";

interface BackupParticipant {
  email: string;
  name?: string;
  grade: string;
  checked_in: boolean;
  checked_in_at: string | null;
}

interface BackupAttachment {
  filename: string;
  mime: string;
  size: number;
  storage_path: string;
}

interface BackupBallot {
  voter_email: string;
  voter_name?: string;
  vote_status: string;
  created_at: string;
}

interface BackupMotion {
  title: string;
  description: string;
  threshold: string;
  status: string;
  position: number;
  opened_at?: string | null;
  closed_at?: string | null;
  present_count?: number | null;
  expected_count?: number | null;
  result?: string | null;
  ballots: BackupBallot[];
}

interface BackupAgendaItem {
  title: string;
  description: string;
  position: number;
  motions: BackupMotion[];
  attachments: BackupAttachment[];
}

interface BackupMeeting {
  title: string;
  department: string;
  meeting_date: string;
  starts_at: string;
  owner_sub: string;
  owner_email: string;
  owner_name: string;
  location: string;
  online_link: string;
  description: string;
  status: string;
  participants: BackupParticipant[];
  agenda: BackupAgendaItem[];
  notes: { author_email: string; author_name: string; body: string; created_at: string }[];
}

export interface BackupData {
  version: 2;
  exported_at: string;
  meetings: BackupMeeting[];
}

const iso = (d: Date): string => d.toISOString();

export async function exportAll(): Promise<BackupData> {
  const byId = { orderBy: { id: "asc" } } as const;
  const [mRows, pRows, aRows, moRows, atRows, bRows, nRows] = await Promise.all([
    prisma.meetings.findMany(byId),
    prisma.participants.findMany(byId),
    prisma.agenda_items.findMany(byId),
    prisma.motions.findMany(byId),
    prisma.agenda_attachments.findMany(byId),
    prisma.ballots.findMany(byId),
    prisma.meeting_notes.findMany(byId),
  ]);

  const participantsByMeeting = new Map<number, BackupParticipant[]>();
  for (const p of pRows) {
    const list = participantsByMeeting.get(p.meeting_id) ?? [];
    list.push({ email: p.email, name: p.name, grade: p.grade, checked_in: p.checked_in, checked_in_at: p.checked_in_at ? iso(p.checked_in_at) : null });
    participantsByMeeting.set(p.meeting_id, list);
  }

  const motionsByAgenda = new Map<number, BackupMotion[]>();
  for (const m2 of moRows) {
    const list = motionsByAgenda.get(m2.agenda_item_id) ?? [];
    list.push({
      title: m2.title, description: m2.description, threshold: m2.threshold, status: m2.status, position: m2.position,
      opened_at: m2.opened_at ? iso(m2.opened_at) : null,
      closed_at: m2.closed_at ? iso(m2.closed_at) : null,
      present_count: m2.present_count, expected_count: m2.expected_count, result: m2.result,
      ballots: [],
    });
    motionsByAgenda.set(m2.agenda_item_id, list);
  }
  const motionIdToKey = new Map<number, { agenda_item_id: number; position: number }>();
  for (const m2 of moRows) motionIdToKey.set(m2.id, { agenda_item_id: m2.agenda_item_id, position: m2.position });

  for (const b of bRows) {
    const key = motionIdToKey.get(b.motion_id);
    if (!key) continue;
    const list = motionsByAgenda.get(key.agenda_item_id);
    const mot = list?.find((x) => x.position === key.position);
    mot?.ballots.push({ voter_email: b.voter_email, voter_name: b.voter_name, vote_status: b.vote_status, created_at: iso(b.created_at) });
  }

  const attachmentsByAgenda = new Map<number, BackupAttachment[]>();
  for (const a of atRows) {
    const list = attachmentsByAgenda.get(a.agenda_item_id) ?? [];
    list.push({ filename: a.filename, mime: a.mime, size: Number(a.size), storage_path: a.storage_path });
    attachmentsByAgenda.set(a.agenda_item_id, list);
  }

  const agendaByMeeting = new Map<number, BackupAgendaItem[]>();
  for (const a of aRows) {
    const list = agendaByMeeting.get(a.meeting_id) ?? [];
    list.push({ title: a.title, description: a.description, position: a.position, motions: motionsByAgenda.get(a.id) ?? [], attachments: attachmentsByAgenda.get(a.id) ?? [] });
    agendaByMeeting.set(a.meeting_id, list);
  }

  const notesByMeeting = new Map<number, BackupMeeting["notes"]>();
  for (const n of nRows) {
    const list = notesByMeeting.get(n.meeting_id) ?? [];
    list.push({ author_email: n.author_email, author_name: n.author_name, body: n.body, created_at: iso(n.created_at) });
    notesByMeeting.set(n.meeting_id, list);
  }

  const meetings: BackupMeeting[] = mRows.map((m) => ({
    title: m.title,
    department: m.department,
    meeting_date: dateOnly(m.meeting_date),
    starts_at: iso(m.starts_at),
    owner_sub: m.owner_sub,
    owner_email: m.owner_email,
    owner_name: m.owner_name,
    location: m.location,
    online_link: m.online_link,
    description: m.description,
    status: m.status,
    participants: participantsByMeeting.get(m.id) ?? [],
    agenda: agendaByMeeting.get(m.id) ?? [],
    notes: notesByMeeting.get(m.id) ?? [],
  }));

  return { version: 2, exported_at: new Date().toISOString(), meetings };
}

function requireString(v: unknown, field: string): string {
  if (typeof v !== "string" || !v) throw new ValidationError(`匯入檔案缺少 ${field}`);
  return v;
}

// SEC-004：附件儲存路徑白名單——僅接受上傳目錄內的伺服器產生檔名，防止匯入檔
// 植入路徑穿越（例如 ../../.env）後由附件下載端點讀取任意檔案。
const SAFE_STORAGE_PATH = /^uploads\/agenda\/[\w.-]+$/;

function requireStoragePath(v: unknown, field: string): string {
  const p = requireString(v, field);
  if (!SAFE_STORAGE_PATH.test(p)) throw new ValidationError(`${field} 格式不正確`);
  return p;
}

export async function importAll(data: unknown): Promise<number> {
  if (typeof data !== "object" || data === null || (data as BackupData).version !== 2) {
    throw new ValidationError("匯入檔案格式不正確（缺少 version=2）");
  }
  const meetings = (data as BackupData).meetings;
  if (!Array.isArray(meetings)) throw new ValidationError("匯入檔案格式不正確（缺少 meetings）");

  // 整包一個交易：中途任何一筆格式錯就整個回滾，不會留下半份資料。逾時給 60 秒（幾百場會議的量）。
  await prisma.$transaction(
    async (tx) => {
      // 固定字串、沒有參數，Unsafe 只是因為 TRUNCATE 沒有 Prisma API。
      await tx.$executeRawUnsafe(
        "TRUNCATE ballots, agenda_attachments, motions, agenda_items, meeting_notes, participants, meetings RESTART IDENTITY CASCADE",
      );

      for (const raw of meetings) {
        if (typeof raw !== "object" || raw === null) throw new ValidationError("匯入檔案格式不正確");
        const m = raw as BackupMeeting;
        const title = requireString(m.title, "title");
        const startsAt = requireString(m.starts_at, "starts_at");
        const startsAtDate = new Date(startsAt);
        if (Number.isNaN(startsAtDate.getTime())) throw new ValidationError("starts_at 格式不正確");
        const meetingDate = toDatetimeLocal(startsAtDate).slice(0, 10);

        const meeting = await tx.meetings.create({
          data: {
            title,
            department: requireString(m.department, "department"),
            meeting_date: dateFromYmd(meetingDate),
            starts_at: startsAtDate,
            owner_sub: requireString(m.owner_sub, "owner_sub"),
            owner_email: typeof m.owner_email === "string" ? m.owner_email : "",
            owner_name: requireString(m.owner_name, "owner_name"),
            location: m.location ?? "",
            online_link: m.online_link ?? "",
            description: m.description ?? "",
            status: m.status ?? "draft",
          },
          select: { id: true },
        });
        const meetingId = meeting.id;

        const participants = m.participants ?? [];
        if (participants.length > 0) {
          await tx.participants.createMany({
            data: participants.map((p) => ({
              meeting_id: meetingId,
              email: requireString(p.email, "participant.email"),
              name: p.name ?? "",
              grade: p.grade ?? "",
              checked_in: p.checked_in === true,
              checked_in_at: p.checked_in_at ? new Date(p.checked_in_at) : null,
            })),
          });
        }

        for (const ai of m.agenda ?? []) {
          const agenda = await tx.agenda_items.create({
            data: {
              meeting_id: meetingId,
              position: Number(ai.position) || 0,
              title: requireString(ai.title, "agenda.title"),
              description: ai.description ?? "",
            },
            select: { id: true },
          });
          const agendaId = agenda.id;

          const attachments = ai.attachments ?? [];
          if (attachments.length > 0) {
            await tx.agenda_attachments.createMany({
              data: attachments.map((att) => ({
                agenda_item_id: agendaId,
                filename: requireString(att.filename, "attachment.filename"),
                mime: att.mime ?? "",
                size: Number(att.size) || 0,
                storage_path: requireStoragePath(att.storage_path, "attachment.storage_path"),
              })),
            });
          }

          for (const mo of ai.motions ?? []) {
            const motion = await tx.motions.create({
              data: {
                agenda_item_id: agendaId,
                title: requireString(mo.title, "motion.title"),
                description: mo.description ?? "",
                threshold: mo.threshold ?? "1/2",
                status: mo.status ?? "",
                position: Number(mo.position) || 0,
                opened_at: mo.opened_at ? new Date(mo.opened_at) : null,
                closed_at: mo.closed_at ? new Date(mo.closed_at) : null,
                present_count: mo.present_count ?? null,
                expected_count: mo.expected_count ?? null,
                result: mo.result === "passed" || mo.result === "rejected" || mo.result === "tie" ? mo.result : null,
              },
              select: { id: true },
            });
            const ballots = mo.ballots ?? [];
            if (ballots.length > 0) {
              await tx.ballots.createMany({
                data: ballots.map((b) => ({
                  motion_id: motion.id,
                  voter_email: requireString(b.voter_email, "ballot.voter_email"),
                  voter_name: b.voter_name ?? "",
                  vote_status: b.vote_status === "against" || b.vote_status === "abstain" ? b.vote_status : "agree",
                  created_at: new Date(b.created_at),
                })),
              });
            }
          }
        }

        const notes = m.notes ?? [];
        if (notes.length > 0) {
          await tx.meeting_notes.createMany({
            data: notes.map((n) => ({
              meeting_id: meetingId,
              author_email: requireString(n.author_email, "note.author_email"),
              author_name: requireString(n.author_name, "note.author_name"),
              body: requireString(n.body, "note.body"),
              created_at: new Date(n.created_at),
            })),
          });
        }
      }
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  return meetings.length;
}
