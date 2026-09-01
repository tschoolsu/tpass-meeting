import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateMotion, motionOutcome, parseThreshold } from "./threshold.ts";

const ev = (threshold: string, agree: number, present: number, expected: number, against = 0) =>
  evaluateMotion({ threshold, agree, against, present, expected });

test("parseThreshold：未知值退回 1/2+1/2", () => {
  assert.deepEqual(parseThreshold("xxx"), parseThreshold("1/2+1/2"));
  assert.equal(parseThreshold("3/4").attendance, null);
});

test("1/2+1/2：出席過半才有效，同意要超過出席一半", () => {
  assert.equal(ev("1/2+1/2", 8, 15, 20).result, "passed"); // 15/20 ≥ 1/2；8 > 7.5
  assert.equal(ev("1/2+1/2", 7, 15, 20).result, "rejected"); // 7 < 8
  assert.equal(ev("1/2+1/2", 8, 15, 20).agreeNeeded, 8);
  assert.equal(ev("1/2+1/2", 5, 8, 16).result, "passed"); // 剛好 1/2 出席；5 > 4
  assert.equal(ev("1/2+1/2", 4, 8, 16).result, "rejected"); // 4 = 8/2 不算過半
  assert.equal(ev("1/2+1/2", 9, 9, 20).result, "no_quorum"); // 9/20 < 1/2，就算全同意也無效
  assert.equal(ev("1/2+1/2", 9, 9, 20).presentNeeded, 10);
});

test("2/3+1/2 與 2/3+2/3：出席 2/3 門檻與同意 2/3", () => {
  assert.equal(ev("2/3+1/2", 11, 20, 30).result, "passed"); // 20/30 = 2/3 剛好；11 > 10
  assert.equal(ev("2/3+1/2", 11, 19, 30).result, "no_quorum"); // 19/30 < 2/3
  assert.equal(ev("2/3+2/3", 14, 21, 30).result, "passed"); // 14/21 = 2/3
  assert.equal(ev("2/3+2/3", 13, 21, 30).result, "rejected");
  assert.equal(ev("2/3+2/3", 13, 21, 30).agreeNeeded, 14);
});

test("3/4：不看出席，只看同意/出席 ≥ 3/4", () => {
  assert.equal(ev("3/4", 3, 4, 100).result, "passed"); // 出席只有 4/100 也不影響
  assert.equal(ev("3/4", 3, 4, 100).presentNeeded, null);
  assert.equal(ev("3/4", 2, 4, 100).result, "rejected");
  assert.equal(ev("3/4", 6, 7, 7).result, "passed"); // ceil(7*3/4)=6
  assert.equal(ev("3/4", 5, 7, 7).result, "rejected");
});

test("邊界：應到 0 或出席 0", () => {
  assert.equal(ev("1/2+1/2", 0, 0, 0).result, "no_quorum");
  assert.equal(ev("3/4", 0, 0, 0).result, "rejected"); // 不看出席但沒人同意
  assert.equal(ev("3/4", 0, 0, 0).agreeNeeded, 1);
});

test("no_quorum 優先於 rejected；reason 講得出數字", () => {
  const r = ev("1/2+1/2", 0, 3, 20);
  assert.equal(r.result, "no_quorum");
  assert.match(r.reason, /出席 3／應到 20/);
  assert.match(ev("1/2+1/2", 8, 15, 20).reason, /同意 8／出席 15，過半/);
});

test("motionOutcome：closed 用快照與 DB result，open 用即時數，'' 回 null", () => {
  const base = { threshold: "1/2+1/2", agree: 8, against: 2, present_count: null, expected_count: null, result: null };
  assert.equal(motionOutcome({ ...base, status: "" }, { present: 15, expected: 20 }), null);

  const open = motionOutcome({ ...base, status: "open" }, { present: 15, expected: 20 });
  assert.equal(open?.settled, false);
  assert.equal(open?.result, "passed");

  const closed = motionOutcome(
    { ...base, status: "closed", present_count: 30, expected_count: 30, result: "rejected" },
    { present: 15, expected: 20 },
  );
  assert.equal(closed?.settled, true);
  assert.equal(closed?.present, 30);
  assert.equal(closed?.result, "rejected"); // DB 存的結果為準
  assert.equal(closed?.passed, false);

  // 舊資料：closed 但沒快照 → 用即時數算
  const legacy = motionOutcome({ ...base, status: "closed" }, { present: 15, expected: 20 });
  assert.equal(legacy?.settled, false);
  assert.equal(legacy?.result, "passed");
});
