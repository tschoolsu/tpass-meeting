// 可決門檻：標籤、解析、通過判定（純函式、無 db、無 "use client"，三方共用，配 node:test）。
//
// 規則（2026-09-01 晚拍板，第二版）：只有四種，都不看出席法定人數。
// - 相對多數（plurality）：同意 > 不同意 → 通過；同意 < 不同意 → 不通過；同票 → 主席裁示。
// - 1/2：同意 > 已簽到 ÷ 2 → 通過；剛好一半 → 同票（主席裁示）；否則不通過。
// - 2/3、3/4：同意 ÷ 已簽到 ≥ 該比例 → 通過；否則不通過。
// 分母一律「已簽到人數」（未投視同不同意），全部用整數乘法比較。
// 同票（tie）畫面不寫通過／不通過，由主席裁示。

export const THRESHOLD_LABEL: Record<string, string> = {
  plurality: "相對多數",
  "1/2": "1/2",
  "2/3": "2/3",
  "3/4": "3/4",
};

export const thLabel = (v: string) => THRESHOLD_LABEL[v] ?? `門檻 ${v}`;

export const DEFAULT_THRESHOLD = "1/2";

export type MotionResult = "passed" | "rejected" | "tie";

export const RESULT_LABEL: Record<MotionResult, string> = {
  passed: "通過",
  rejected: "不通過",
  tie: "同票・主席裁示",
};

export const RESULT_BADGE_CLASS: Record<MotionResult, string> = {
  passed: "bg-tone-green-badge text-tone-green-text",
  rejected: "bg-destructive text-primary-foreground",
  tie: "bg-secondary",
};

type Fraction = readonly [number, number];

export type ThresholdRule = { kind: "plurality" } | { kind: "majority" } | { kind: "ratio"; ratio: Fraction };

const RULES: Record<string, ThresholdRule> = {
  plurality: { kind: "plurality" },
  "1/2": { kind: "majority" },
  "2/3": { kind: "ratio", ratio: [2, 3] },
  "3/4": { kind: "ratio", ratio: [3, 4] },
};

/** 未知值（含舊資料）退回 1/2。 */
export function parseThreshold(value: string): ThresholdRule {
  return RULES[value] ?? RULES[DEFAULT_THRESHOLD];
}

export interface MotionTally {
  threshold: string;
  agree: number;
  against: number;
  /** 已簽到人數（分母）。 */
  present: number;
}

export interface MotionEvaluation {
  result: MotionResult;
  passed: boolean;
  /** 以目前數字計，通過所需最少同意票（相對多數＝不同意＋1）。 */
  agreeNeeded: number;
  /** 一句話說明，例：「同意 8／出席 15，過半」。 */
  reason: string;
}

const ceilDiv = (a: number, b: number) => Math.floor((a + b - 1) / b);

export function evaluateMotion(t: MotionTally): MotionEvaluation {
  const rule = parseThreshold(t.threshold);
  const present = Math.max(0, t.present);
  const { agree, against } = t;

  if (rule.kind === "plurality") {
    const result: MotionResult = agree > against ? "passed" : agree < against ? "rejected" : "tie";
    return {
      result,
      passed: result === "passed",
      agreeNeeded: against + 1,
      reason: result === "tie" ? `同意 ${agree}／不同意 ${against}，同票` : `同意 ${agree}／不同意 ${against}`,
    };
  }

  if (rule.kind === "majority") {
    const twice = agree * 2;
    const result: MotionResult = twice > present ? "passed" : twice === present && present > 0 ? "tie" : "rejected";
    return {
      result,
      passed: result === "passed",
      agreeNeeded: Math.floor(present / 2) + 1,
      reason:
        result === "tie"
          ? `同意 ${agree}／出席 ${present}，剛好一半`
          : `同意 ${agree}／出席 ${present}，${result === "passed" ? "過半" : "未過半"}`,
    };
  }

  const [n, d] = rule.ratio;
  const agreeNeeded = Math.max(1, ceilDiv(present * n, d));
  const passed = present > 0 && agree * d >= present * n;
  return {
    result: passed ? "passed" : "rejected",
    passed,
    agreeNeeded,
    reason: `同意 ${agree}／出席 ${present}，${passed ? "達" : "未達"} ${n}/${d}`,
  };
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
  /** true＝結算時的快照（closed 且有 present_count）；false＝用現場即時出席數推算。 */
  settled: boolean;
}

const VALID_RESULTS: ReadonlySet<string> = new Set(["passed", "rejected", "tie"]);

/** 顯示用：closed 用結算快照，open 用即時出席數；尚未開放回 null。 */
export function motionOutcome(m: OutcomeSource, live: { present: number }): MotionOutcome | null {
  if (m.status !== "open" && m.status !== "closed") return null;
  const settled = m.status === "closed" && m.present_count != null;
  const present = settled ? (m.present_count as number) : live.present;
  const ev = evaluateMotion({ threshold: m.threshold, agree: m.agree, against: m.against, present });
  // 已結算且 DB 有存合法結果：以 DB 為準（規則日後改了，歷史結果不能跟著變）。
  const result = settled && m.result && VALID_RESULTS.has(m.result) ? m.result : ev.result;
  return { ...ev, result, passed: result === "passed", present, settled };
}
