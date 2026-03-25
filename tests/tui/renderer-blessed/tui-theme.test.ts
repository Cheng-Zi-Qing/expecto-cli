import test from "node:test";
import assert from "node:assert/strict";

import {
  createRendererPalette,
  renderCommandMenuMarkup,
  renderComposerMarkup,
  renderInlineTextTokens,
} from "../../../src/tui/renderer-blessed/tui-theme.ts";
import { createTextToken } from "../../../src/tui/block-model/text-tokens.ts";

test("renderer palette keeps text readable while differentiating panel chrome", () => {
  const palette = createRendererPalette({
    focus: "composer",
    inputLocked: false,
  });

  assert.equal(palette.timeline.text, "#111827");
  assert.equal(palette.timeline.body, "#1F2937");
  assert.equal(palette.timeline.hint, "#374151");
  assert.equal(palette.timeline.guide, "#4B5563");
  assert.equal(palette.timeline.executionGuide, "#B7791F");
  assert.equal(palette.timeline.bg, "#F8FAFC");
  assert.equal(palette.timeline.card.user.border, "#4FAF7C");
  assert.equal(palette.timeline.card.execution.transcriptBg, "#F3F4F6");
  assert.equal(palette.timeline.token.inlineCode.bg, "#111827");
  assert.equal(palette.timeline.token.path.fg, "#4FAF7C");
  assert.equal(palette.composer.text, "#1F2937");
  assert.equal(palette.composer.placeholder, "#6B7280");
  assert.equal(palette.composer.bg, "#F3F4F6");
  assert.equal(palette.inspector.text, "#1F2937");
  assert.equal(palette.inspector.bg, "#F3F4F6");
  assert.notEqual(palette.composer.text, palette.composer.placeholder);
  assert.equal(palette.timeline.border, "#4B5563");
  assert.equal(palette.composer.border, "#4FAF7C");
});

test("inline token rendering maps semantic token kinds to distinct colors", () => {
  const palette = createRendererPalette({
    focus: "timeline",
    inputLocked: false,
  });
  const markup = renderInlineTextTokens(
    [
      createTextToken("default", "run "),
      createTextToken("command", "/status"),
      createTextToken("default", " in "),
      createTextToken("path", "src/main.ts"),
      createTextToken("default", " with "),
      createTextToken("shortcut", "Ctrl+C"),
      createTextToken("default", " when "),
      createTextToken("status", "ready"),
      createTextToken("default", " and inspect "),
      createTextToken("inline_code", "npm test"),
    ],
    palette,
  );

  assert.match(markup, /\/status/);
  assert.match(markup, /src\/main\.ts/);
  assert.match(markup, /Ctrl\+C/);
  assert.match(markup, /ready/);
  assert.match(markup, /npm test/);
  assert.match(markup, /#2563EB-fg/);
  assert.match(markup, /#4FAF7C-fg/);
  assert.match(markup, /#7C3AED-fg/);
  assert.match(markup, /#B7791F-fg/);
  assert.match(markup, /#111827-bg/);
});

test("composer markup uses its own text color plus placeholder and cursor contrast", () => {
  const palette = createRendererPalette({
    focus: "composer",
    inputLocked: false,
  });
  const placeholder = renderComposerMarkup({
    draft: "",
    inputLocked: false,
    palette,
  });
  const composed = renderComposerMarkup({
    draft: "Investigate auth",
    inputLocked: false,
    palette,
  });

  assert.match(placeholder, /#6B7280-fg/);
  assert.doesNotMatch(placeholder, /\{dim\}/);
  assert.match(composed, /#1F2937-fg/);
});

test("command menu markup highlights the selected slash command and its description", () => {
  const palette = createRendererPalette({
    focus: "composer",
    inputLocked: false,
  });
  const markup = renderCommandMenuMarkup({
    visible: true,
    query: "",
    items: [
      {
        id: "help",
        name: "/help",
        aliases: [],
        description: "Show the built-in session commands.",
      },
      {
        id: "status",
        name: "/status",
        aliases: [],
        description: "Show the current session status.",
      },
    ],
    selectedIndex: 1,
    palette,
  });

  assert.match(markup, /\/help/);
  assert.match(markup, /\/status/);
  assert.match(markup, /Show the current session status\./);
  assert.match(markup, /#2563EB-fg/);
  assert.match(markup, /#111827-fg/);
});

test("command menu markup renders an empty-state message when no slash commands match", () => {
  const palette = createRendererPalette({
    focus: "composer",
    inputLocked: false,
  });
  const markup = renderCommandMenuMarkup({
    visible: true,
    query: "zzz",
    items: [],
    selectedIndex: 0,
    palette,
  });

  assert.match(markup, /No matching commands\./);
});
