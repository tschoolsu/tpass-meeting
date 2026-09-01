import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateMotion, motionOutcome, parseThreshold } from "./threshold.ts";

const ev = (threshold: string, agree: number, against: number, present: number) =>
  evaluateMotion({ threshold, agree, against, present });

test("parseThreshold：未知值（含舊的 1/2+1/2）退回 1/2", () => {
  assert.deepEqual(parseThreshold("1/2+1/2"), parseThreshold("1/2"));
  assert.equal(parseThreshold("plurality").kind, "plurality");
});

test("相對多數：同意 > 不同意通過，同票交主席裁示", () => {
  assert.equal(ev("plurality", 5, 4, 20).result, "passed");
  assert.equal(ev("plurality", 4, 5, 20).result, "rejected");
  assert.equal(ev("plurality", 4, 4, 20).result, "tie");
  assert.equal(ev("plurality", 0, 0, 20).result, "tie");
  assert.equal(ev("plurality", 4, 4, 20).agreeNeeded, 5);
});

test("1/2：同意要超過已簽到的一半；剛好一半＝同票", () => {
  assert.equal(ev("1/2", 8, 2, 15).result, "passed"); // 8*2 > 15
  assert.equal(ev("1/2", 7, 2, 15).result, "rejected");
  assert.equal(ev("1/2", 8, 0, 16).result, "tie"); // 剛好一半
  assert.equal(ev("1/2", 9, 0, 16).result, "passed");
  assert.equal(ev("1/2", 8, 2, 15).agreeNeeded, 8);
  assert.equal(ev("1/2", 0, 0, 0).result, "rejected"); // 沒人出席不算同票
});

test("2/3 與 3/4：同意／已簽到 ≥ 比例，剛好達標算通過，沒有同票", () => {
  assert.equal(ev("2/3", 14, 0, 21).result, "passed"); // 14/21 = 2/3
  assert.equal(ev("2/3", 13, 0, 21).result, "rejected");
  assert.equal(ev("2/3", 13, 0, 21).agreeNeeded, 14);
  assert.equal(ev("3/4", 6, 1, 7).result, "passed"); // ceil(7*3/4)=6
  assert.equal(ev("3/4", 5, 2, 7).result, "rejected");
  assert.equal(ev("3/4", 0, 0, 0).result, "rejected");
  assert.equal(ev("3/4", 0, 0, 0).agreeNeeded, 1);
});

test("reason 講得出數字", () => {
  assert.match(ev("1/2", 8, 2, 15).reason, /同意 8／出席 15，過半/);
  assert.match(ev("plurality", 4, 4, 9).reason, /同票/);
});

test("motionOutcome：closed 用快照與 DB result，open 用即時數，'' 回 null，舊 no_quorum 重算", () => {
  const base = { threshold: "1/2", agree: 8, against: 2, present_count: null, expected_count: null, result: null };
  assert.equal(motionOutcome({ ...base, status: "" }, { present: 15 }), null);

  const open = motionOutcome({ ...base, status: "open" }, { present: 15 });
  assert.equal(open?.settled, false);
  assert.equal(open?.result, "passed");

  const closed = motionOutcome({ ...base, status: "closed", present_count: 30, expected_count: 30, result: "rejected" }, { present: 15 });
  assert.equal(closed?.settled, true);
  assert.equal(closed?.present, 30);
  assert.equal(closed?.result, "rejected");

  // 舊資料存的 no_quorum 已不是合法值：用快照重算
  const legacy = motionOutcome(
    { ...base, status: "closed", present_count: 15, expected_count: 30, result: "no_quorum" as never },
    { present: 0 },
  );
  assert.equal(legacy?.result, "passed");
});
