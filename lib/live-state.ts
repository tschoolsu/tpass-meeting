// 即時快照（GET /api/live/meeting/:id）的型別與純函式。
// 無 "use client"、無 server-only：API route、client hook、node:test 三方共用。
// 快照是唯一事實來源；SSE 只是「請立刻重抓」的鈴聲（見 components/live-polling.ts）。

import type { MotionResult } from "./threshold";

export type VoteStatus = "agree" | "against";

export interface LiveBallot {
  voter_email: string;
  voter_name: string;
  vote_status: VoteStatus;
}

export interface LiveMotion {
  id: number;
  agenda_item_id: number;
  title: string;
  threshold: string;
  status: string; // '' | 'open' | 'closed'
  agree: number;
  against: number;
  present_count: number | null;
  expected_count: number | null;
  result: MotionResult | null;
}

export interface LiveAgendaItem {
  id: number;
  position: number;
  title: string;
  description: string;
  motions: LiveMotion[];
}

export interface LiveMe {
  participant: boolean;
  checked_in: boolean;
  voted_motion_ids: number[];
}

export interface LiveParticipant {
  email: string;
  name: string;
  grade: string;
  checked_in: boolean;
}

export interface LiveState {
  meeting: { id: number; title: string; status: string; phase: string; starts_at: string };
  checked_in: number;
  total: number;
  /** 全員名單（簽到階段投屏要列出誰還沒到）。 */
  participants: LiveParticipant[];
  current: LiveAgendaItem | null;
  agenda: LiveAgendaItem[];
  me: LiveMe;
}

/** 我該被提醒去投的表決案：open、我已簽到、我還沒投。依議程順序。 */
export function pendingMotionsFor(state: LiveState): { motion: LiveMotion; agenda: LiveAgendaItem }[] {
  if (!state.me.participant || !state.me.checked_in) return [];
  const voted = new Set(state.me.voted_motion_ids);
  const out: { motion: LiveMotion; agenda: LiveAgendaItem }[] = [];
  for (const agenda of state.agenda) {
    for (const motion of agenda.motions) {
      if (motion.status === "open" && !voted.has(motion.id)) out.push({ motion, agenda });
    }
  }
  return out;
}

/** 給「Server Component 頁面自動 refresh」用的簽章：任一會改變頁面內容的欄位變了就不同。 */
export function liveSignature(state: LiveState): string {
  return JSON.stringify({
    status: state.meeting.status,
    phase: state.meeting.phase,
    current: state.current?.id ?? null,
    checked: state.checked_in,
    total: state.total,
    agenda: state.agenda.map((a) => [a.id, a.motions.map((m) => `${m.id}:${m.status}:${m.agree}:${m.against}`)]),
    me: [state.me.participant, state.me.checked_in, state.me.voted_motion_ids.length],
  });
}
