// 可決門檻：標籤、解析、通過判定（純函式、無 db、無 "use client"，三方共用，配 node:test）。
//
// 規則（2026-09-01 拍板）：
// - 「出席 X」＝已簽到／應到 ≥ X，不足＝法定人數不足，表決無效（no_quorum）。
// - 「同意 Y」分母一律是「已簽到人數」，未投票視同不同意。
//   簡單多數＝同意 > 出席/2；比例＝同意/出席 ≥ Y。'3/4' 不看出席門檻。
// - 全部用整數乘法比較，不碰浮點。

export const THRESHOLD_LABEL: Record<string, string> = {
  "1/2+1/2": "出席 1/2＋簡單多數",
  "2/3+1/2": "出席 2/3＋簡單多數",
  "2/3+2/3": "出席 2/3＋同意 2/3",
  "3/4": "同意 3/4",
};

export const thLabel = (v: string) => THRESHOLD_LABEL[v] ?? `門檻 ${v}`;

export type MotionResult = "passed" | "rejected" | "no_quorum";

export const RESULT_LABEL: Record<MotionResult, string> = {
  passed: "通過",
  rejected: "不通過",
  no_quorum: "出席不足・無效",
};

export const RESULT_BADGE_CLASS: Record<MotionResult, string> = {
  passed: "bg-tone-green-badge text-tone-green-text",
  rejected: "bg-destructive text-primary-foreground",
  no_quorum: "bg-muted text-muted-foreground",
};

type Fraction = readonly [number, number];

export interface ThresholdRule {
  /** 出席門檻 present/expected ≥ n/d；null＝不看出席。 */
  attendance: Fraction | null;
  /** 同意門檻：majority＝agree > present/2；否則 agree/present ≥ n/d。 */
  agree: "majority" | Fraction;
}

const RULES: Record<string, ThresholdRule> = {
  "1/2+1/2": { attendance: [1, 2], agree: "majority" },
  "2/3+1/2": { attendance: [2, 3], agree: "majority" },
  "2/3+2/3": { attendance: [2, 3], agree: [2, 3] },
  "3/4": { attendance: null, agree: [3, 4] },
};

/** 未知值退回最寬鬆的 '1/2+1/2'（舊資料或手打的值不該讓整頁爆）。 */
export function parseThreshold(value: string): ThresholdRule {
  return RULES[value] ?? RULES["1/2+1/2"];
}

export interface MotionTally {
  threshold: string;
  agree: number;
  against: number;
  /** 已簽到人數（分母）。 */
  present: number;
  /** 應到人數（出席門檻用）。 */
  expected: number;
}

export interface MotionEvaluation {
  result: MotionResult;
  quorumMet: boolean;
  passed: boolean;
  /** 達出席門檻所需簽到數；null＝此門檻不看出席。 */
  presentNeeded: number | null;
  /** 以目前出席數計，通過所需最少同意票（至少 1）。 */
  agreeNeeded: number;
  /** 一句話說明，例：「同意 8／出席 15，未過半」。 */
  reason: string;
}

const ceilDiv = (a: number, b: number) => Math.floor((a + b - 1) / b);

export function evaluateMotion(t: MotionTally): MotionEvaluation {
  const rule = parseThreshold(t.threshold);
  const present = Math.max(0, t.present);
  const expected = Math.max(0, t.expected);

  const presentNeeded = rule.attendance ? ceilDiv(expected * rule.attendance[0], rule.attendance[1]) : null;
  const quorumMet = rule.attendance
    ? expected > 0 && present * rule.attendance[1] >= expected * rule.attendance[0]
    : true;

  const agreeNeeded =
    rule.agree === "majority"
      ? Math.floor(present / 2) + 1
      : Math.max(1, ceilDiv(present * rule.agree[0], rule.agree[1]));
  const agreeMet = present > 0 && t.agree >= agreeNeeded;
  const passed = quorumMet && agreeMet;

  const agreeText =
    rule.agree === "majority"
      ? `同意 ${t.agree}／出席 ${present}，${agreeMet ? "過半" : "未過半"}`
      : `同意 ${t.agree}／出席 ${present}，${agreeMet ? "達" : "未達"} ${rule.agree[0]}/${rule.agree[1]}`;

  let result: MotionResult;
  let reason: string;
  if (!quorumMet && rule.attendance) {
    result = "no_quorum";
    reason = `出席 ${present}／應到 ${expected}，未達 ${rule.attendance[0]}/${rule.attendance[1]}`;
  } else {
    result = passed ? "passed" : "rejected";
    reason = agreeText;
  }

  return { result, quorumMet, passed, presentNeeded, agreeNeeded, reason };
}

export interface OutcomeSource {
  status: string;
  threshold: string;
  agree: number;
  against: number;
  present_count: number | null;
  expected_count: number | null;
  result: MotionResult | null;
}

export interface MotionOutcome extends MotionEvaluation {
  present: number;
  expected: number;
  /** true＝結算時的快照（closed 且有 present_count）；false＝用現場即時出席數推算。 */
  settled: boolean;
}

/** 顯示用：closed 用結算快照，open 用即時出席數；尚未開放回 null。 */
export function motionOutcome(m: OutcomeSource, live: { present: number; expected: number }): MotionOutcome | null {
  if (m.status !== "open" && m.status !== "closed") return null;
  const settled = m.status === "closed" && m.present_count != null && m.expected_count != null;
  const present = settled ? (m.present_count as number) : live.present;
  const expected = settled ? (m.expected_count as number) : live.expected;
  const ev = evaluateMotion({ threshold: m.threshold, agree: m.agree, against: m.against, present, expected });
  // 已結算且 DB 有存結果：以 DB 為準（規則日後改了，歷史結果不能跟著變）。
  const result = settled && m.result ? m.result : ev.result;
  return { ...ev, result, passed: result === "passed", present, expected, settled };
}
