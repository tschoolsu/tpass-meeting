import { test } from "node:test";
import assert from "node:assert/strict";
import { canDeleteNote } from "./note-permissions.ts";

const meeting = { owner_sub: "sub-owner" };
const owner = { sub: "sub-owner", email: "owner@tschool.tp.edu.tw" };
const editor = { sub: "sub-editor", email: "editor@tschool.tp.edu.tw" };
const stranger = { sub: "sub-stranger", email: "stranger@tschool.tp.edu.tw" };

const editorNote = { author_sub: "sub-editor", author_email: editor.email };
const legacyNote = { author_sub: null, author_email: editor.email };

test("admin 可刪任何人的紀錄", () => {
  assert.equal(canDeleteNote(editorNote, meeting, stranger, true), true);
});

test("會議創建者可刪任何人的紀錄", () => {
  assert.equal(canDeleteNote(editorNote, meeting, owner, false), true);
});

test("作者可刪自己的紀錄", () => {
  assert.equal(canDeleteNote(editorNote, meeting, editor, false), true);
});

test("author_sub 為 NULL 的舊紀錄退回 email 比對認作者", () => {
  assert.equal(canDeleteNote(legacyNote, meeting, editor, false), true);
});

test("路人不能刪別人的紀錄", () => {
  assert.equal(canDeleteNote(editorNote, meeting, stranger, false), false);
  assert.equal(canDeleteNote(legacyNote, meeting, stranger, false), false);
});

test("author_sub 有值時不看 email——同信箱但換了 sub 也不算作者", () => {
  const note = { author_sub: "sub-someone-else", author_email: editor.email };
  assert.equal(canDeleteNote(note, meeting, editor, false), false);
});
