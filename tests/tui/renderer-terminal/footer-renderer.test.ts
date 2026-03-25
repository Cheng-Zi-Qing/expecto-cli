import assert from "node:assert/strict";
import test from "node:test";

import type { TuiFooterView } from "../../../src/tui/view-model/tui-view-types.ts";
import { renderFooter } from "../../../src/tui/renderer-terminal/footer-renderer.ts";

function createFooter(overrides: Partial<TuiFooterView> = {}): TuiFooterView {
  return {
    composer: {
      value: "",
      locked: false,
    },
    status: {
      runtimeLabel: "Thinking",
    },
    ...overrides,
  };
}

test("renderFooter emits a dark composer line and concise status line", () => {
  const footer = renderFooter(createFooter(), { width: 80, composerHeight: 4 });
  assert.match(footer.join("\n"), /Write a prompt/);
  assert.match(footer.join("\n"), /Thinking|Done|Running tool/);
});

test("renderFooter keeps newest composer lines when content overflows", () => {
  const footer = renderFooter(
    createFooter({
      composer: {
        value: "line 1\nline 2\nline 3\nline 4\nline 5",
        locked: false,
      },
    }),
    { width: 20, composerHeight: 3 },
  );

  assert.equal(footer[0], "line 3              ");
  assert.equal(footer[1], "line 4              ");
  assert.equal(footer[2], "line 5              ");
});

test("renderFooter does not replace whitespace-only draft with placeholder", () => {
  const footer = renderFooter(
    createFooter({
      composer: {
        value: "   ",
        locked: false,
      },
    }),
    { width: 8, composerHeight: 2 },
  );

  assert.doesNotMatch(footer.join("\n"), /Write a prompt/);
  assert.equal(footer[0], "        ");
});
