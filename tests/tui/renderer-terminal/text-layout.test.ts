import assert from "node:assert/strict";
import test from "node:test";

import { padOrTrimToWidth, wrapPlainText } from "../../../src/tui/renderer-terminal/text-layout.ts";

test("wrapPlainText wraps by width and preserves explicit newlines", () => {
  const lines = wrapPlainText("alpha beta\ngamma delta", 7);

  assert.deepEqual(lines, ["alpha", " beta", "gamma", " delta"]);
});

test("wrapPlainText preserves indentation and repeated spaces", () => {
  const lines = wrapPlainText("    return  x;", 40);

  assert.deepEqual(lines, ["    return  x;"]);
});

test("padOrTrimToWidth pads short content and trims long content", () => {
  assert.equal(padOrTrimToWidth("abc", 5), "abc  ");
  assert.equal(padOrTrimToWidth("abcdef", 4), "abcd");
});

test("wrapPlainText wraps full-width characters by terminal cell width", () => {
  const lines = wrapPlainText("你好世界", 4);

  assert.deepEqual(lines, ["你好", "世界"]);
});

test("padOrTrimToWidth trims and pads full-width characters by terminal cell width", () => {
  assert.equal(padOrTrimToWidth("你好世界", 4), "你好");
  assert.equal(padOrTrimToWidth("你好", 5), "你好 ");
});
