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
