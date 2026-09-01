import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName } from "./names.ts";

test("displayName：有名字用名字，空白／缺省退回 email", () => {
  assert.equal(displayName({ name: "王小明", email: "a@x" }), "王小明");
  assert.equal(displayName({ name: "  ", email: "a@x" }), "a@x");
  assert.equal(displayName({ name: null, email: "a@x" }), "a@x");
  assert.equal(displayName({ email: "a@x" }), "a@x");
});
