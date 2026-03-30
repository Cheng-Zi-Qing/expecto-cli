import assert from "node:assert/strict";
import test from "node:test";

import type { TuiFooterView } from "../../../src/tui/view-model/tui-view-types.ts";
import { renderFooter } from "../../../src/tui/renderer-terminal/footer-renderer.ts";
import { getThemeDefinition } from "../../../src/tui/theme/theme-registry.ts";

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
  assert.match(footer.lines.join("\n"), /╭ Composer/);
  assert.match(footer.lines.join("\n"), /Write a prompt/);
  assert.match(footer.lines.join("\n"), /╰ Status: Thinking/);
  assert.equal(footer.composerBodyTop, 1);
  assert.equal(footer.composerContentColumn, 3);
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

  assert.equal(footer.lines[1], "│ line 3           │");
  assert.equal(footer.lines[2], "│ line 4           │");
  assert.equal(footer.lines[3], "│ line 5           │");
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

  assert.doesNotMatch(footer.lines.join("\n"), /Write a prompt/);
  assert.equal(footer.lines[1], "│      │");
});

test("renderFooter keeps explicit Composer and Status frame chrome", () => {
  const footer = renderFooter(createFooter(), { width: 32, composerHeight: 2 });
  const output = footer.lines.join("\n");

  assert.match(output, /^╭ Composer .*╮$/m);
  assert.match(output, /^╰ Status: Thinking .*╯$/m);
  assert.doesNotMatch(output, /^Status: Thinking$/m);
});

test("renderFooter renders theme picker controls instead of the normal composer placeholder", () => {
  const footer = renderFooter(
    createFooter({
      composer: {
        value: "",
        locked: true,
      },
      status: {
        runtimeLabel: "Selection required",
      },
      themePicker: {
        selectedThemeId: "hufflepuff",
        entries: [
          { id: "hufflepuff", displayName: "Hufflepuff", animal: "Badger", paletteLabel: "yellow / gray", availability: "available", selected: true },
          { id: "gryffindor", displayName: "Gryffindor", animal: "Lion", paletteLabel: "crimson / gold", availability: "available", selected: false },
          { id: "ravenclaw", displayName: "Ravenclaw", animal: "Eagle", paletteLabel: "blue / gold", availability: "available", selected: false },
          { id: "slytherin", displayName: "Slytherin", animal: "Serpent", paletteLabel: "green / silver", availability: "available", selected: false },
        ],
        required: true,
      },
    }),
    { width: 72, composerHeight: 4 },
  );

  const output = footer.lines.join("\n");

  assert.match(output, /Theme Picker/);
  assert.match(output, /Use ↑↓ to move/);
  assert.match(output, /Enter apply/);
  assert.match(output, /Required before entering the Room of Requirement/);
  assert.doesNotMatch(output, /Write a prompt/);
});

test("renderFooter applies the Hufflepuff emphasis panel styling to the composer", () => {
  const footer = renderFooter(
    {
      ...createFooter(),
      theme: {
        id: "hufflepuff",
        palette: getThemeDefinition("hufflepuff").palette,
      },
    } as TuiFooterView,
    { width: 48, composerHeight: 2 },
  );

  const output = footer.lines.join("\n");

  assert.match(output, /\u001b\[[0-9;]*m╭\u001b\[0m\u001b\[[0-9;]*m Composer /);
  assert.match(output, /\u001b\[[0-9;]*48;2;243;234;208mWrite a prompt\s+\u001b\[0m/);
  assert.match(output, /\u001b\[[0-9;]*48;2;243;234;208m Status: Thinking /);
});
