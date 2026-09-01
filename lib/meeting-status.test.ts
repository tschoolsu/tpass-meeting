import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, derivePhase, motionLabel, primaryCtaFor, publishPrecheck, isPublishBlocked } from "./meeting-status.ts";

const NOW = Date.parse("2026-09-01T10:00:00+08:00");
const PAST = "2026-09-01T09:00:00+08:00";
const FUTURE = "2026-09-01T11:00:00+08:00";

test("derivePhase：closed 永遠 closed，published 依時間分兩態，其餘 draft", () => {
  assert.equal(derivePhase("closed", PAST, NOW), "closed");
  assert.equal(derivePhase("published", FUTURE, NOW), "scheduled");
  assert.equal(derivePhase("published", PAST, NOW), "live");
  assert.equal(derivePhase("live", FUTURE, NOW), "scheduled"); // 舊資料的 live 當 published 看
  assert.equal(derivePhase("draft", PAST, NOW), "draft");
  assert.equal(derivePhase("garbage", PAST, NOW), "draft");
});

test("canTransition：只准發布、結束、重新開啟", () => {
  assert.equal(canTransition("draft", "published"), true);
  assert.equal(canTransition("published", "closed"), true);
  assert.equal(canTransition("live", "closed"), true);
  assert.equal(canTransition("closed", "published"), true);
  assert.equal(canTransition("published", "published"), false); // 重複發布（重複寄信）擋住
  assert.equal(canTransition("draft", "closed"), false);
  assert.equal(canTransition("draft", "live"), false);
  assert.equal(canTransition("closed", "draft"), false);
});

test("motionLabel：未知值退回「尚未開放」", () => {
  assert.equal(motionLabel("open"), "表決中");
  assert.equal(motionLabel("closed"), "已結算");
  assert.equal(motionLabel(""), "尚未開放");
  assert.equal(motionLabel("whatever"), "尚未開放");
});

test("publishPrecheck：名單 0 人阻擋，議程 0 項只建議", () => {
  const base = { participants: 0, checkedIn: 0, agenda: 0, motions: 0, openMotions: 0, closedMotions: 0, notes: 0, editors: 0 };
  assert.equal(isPublishBlocked(publishPrecheck(base)), true);
  assert.equal(isPublishBlocked(publishPrecheck({ ...base, participants: 3 })), false);
  assert.equal(publishPrecheck({ ...base, participants: 3 }).find((i) => i.label.startsWith("議程"))?.ok, false);
});

test("primaryCtaFor：學生依 phase 只拿到一顆", () => {
  const base = { meetingId: 7, isParticipant: true, checkedIn: false, openMotionId: null, startsAtLabel: "T" };
  assert.equal(primaryCtaFor({ ...base, phase: "draft" })?.kind, "note");
  assert.deepEqual(primaryCtaFor({ ...base, phase: "live" }), { kind: "link", href: "/checkin?id=7", label: "前往簽到" });
  assert.equal(primaryCtaFor({ ...base, phase: "live", checkedIn: true, openMotionId: 42 })?.kind, "link");
  assert.match((primaryCtaFor({ ...base, phase: "live", checkedIn: true }) as { text: string }).text, /等待主席/);
  assert.equal(primaryCtaFor({ ...base, phase: "closed" }), null);
  assert.equal(primaryCtaFor({ ...base, phase: "live", isParticipant: false }), null);
});
