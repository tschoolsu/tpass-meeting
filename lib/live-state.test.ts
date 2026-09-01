import { test } from "node:test";
import assert from "node:assert/strict";
import { liveSignature, pendingMotionsFor, type LiveState } from "./live-state.ts";

function state(over: Partial<LiveState> = {}): LiveState {
  return {
    meeting: { id: 1, title: "m", status: "published", phase: "live", starts_at: "2026-09-01T02:00:00.000Z" },
    checked_in: 3,
    total: 5,
    current: null,
    agenda: [
      {
        id: 10,
        position: 0,
        title: "第一案",
        description: "",
        motions: [
          { id: 100, agenda_item_id: 10, title: "a", threshold: "1/2+1/2", status: "closed", agree: 1, against: 0 },
          { id: 101, agenda_item_id: 10, title: "b", threshold: "1/2+1/2", status: "open", agree: 0, against: 0 },
        ],
      },
      {
        id: 11,
        position: 1,
        title: "第二案",
        description: "",
        motions: [{ id: 110, agenda_item_id: 11, title: "c", threshold: "3/4", status: "open", agree: 0, against: 0 }],
      },
    ],
    me: { participant: true, checked_in: true, voted_motion_ids: [] },
    ...over,
  };
}

test("pendingMotionsFor：只挑 open 且我未投，依議程順序", () => {
  const got = pendingMotionsFor(state());
  assert.deepEqual(
    got.map((x) => [x.agenda.id, x.motion.id]),
    [
      [10, 101],
      [11, 110],
    ],
  );
});

test("pendingMotionsFor：投過的不再出現", () => {
  const got = pendingMotionsFor(state({ me: { participant: true, checked_in: true, voted_motion_ids: [101] } }));
  assert.deepEqual(
    got.map((x) => x.motion.id),
    [110],
  );
});

test("pendingMotionsFor：未簽到或非參與者一律空", () => {
  assert.equal(pendingMotionsFor(state({ me: { participant: true, checked_in: false, voted_motion_ids: [] } })).length, 0);
  assert.equal(pendingMotionsFor(state({ me: { participant: false, checked_in: false, voted_motion_ids: [] } })).length, 0);
});

test("liveSignature：票數、簽到數、phase、我的投票數任一變就不同", () => {
  const base = liveSignature(state());
  assert.equal(liveSignature(state()), base);
  assert.notEqual(liveSignature(state({ checked_in: 4 })), base);
  assert.notEqual(liveSignature(state({ meeting: { ...state().meeting, phase: "closed" } })), base);
  assert.notEqual(liveSignature(state({ me: { participant: true, checked_in: true, voted_motion_ids: [101] } })), base);
  const voted = state();
  voted.agenda[0].motions[1].agree = 1;
  assert.notEqual(liveSignature(voted), base);
});
