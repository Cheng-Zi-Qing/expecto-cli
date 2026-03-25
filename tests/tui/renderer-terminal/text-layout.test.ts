import assert from "node:assert/strict";
import test from "node:test";

import { padOrTrimToWidth, wrapPlainText } from "../../../src/tui/renderer-terminal/text-layout.ts";

test("wrapPlainText wraps by width and preserves explicit newlines", () => {
  const lines = wrapPlainText("alpha beta\ngamma delta", 7);

  assert.deepEqual(lines, ["alpha", "beta", "gamma", "delta"]);
});

test("padOrTrimToWidth pads short content and trims long content", () => {
  assert.equal(padOrTrimToWidth("abc", 5), "abc  ");
  assert.equal(padOrTrimToWidth("abcdef", 4), "abcd");
});
