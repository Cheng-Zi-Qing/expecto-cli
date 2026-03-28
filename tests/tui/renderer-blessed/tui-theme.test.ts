import test from "node:test";
import assert from "node:assert/strict";

import {
  createRendererPalette,
  renderCommandMenuMarkup,
  renderComposerMarkup,
  renderInlineTextTokens,
} from "../../../src/tui/renderer-blessed/tui-theme.ts";
import { createTextToken } from "../../../src/tui/block-model/text-tokens.ts";

function stripBlessedTags(value: string): string {
  return value.replace(/\{[^}]+\}/g, "");
}

test("renderer palette keeps text readable while differentiating panel chrome", () => {
  const palette = createRendererPalette({
    focus: "composer",
    inputLocked: false,
  });

  assert.equal(palette.timeline.text, "#1F1A12");
  assert.equal(palette.timeline.body, "#3A3128");
  assert.equal(palette.timeline.hint, "#3A3128");
  assert.equal(palette.timeline.guide, "#7A746C");
  assert.equal(palette.timeline.executionGuide, "#B8892C");
  assert.equal(palette.timeline.bg, "#F8FAFC");
  assert.equal(palette.timeline.card.user.border, "#D6A93D");
  assert.equal(palette.timeline.card.execution.transcriptBg, "#F3F4F6");
  assert.equal(palette.timeline.token.inlineCode.bg, "#2C2620");
  assert.equal(palette.timeline.token.path.fg, "#7A746C");
  assert.equal(palette.composer.text, "#3A3128");
  assert.equal(palette.composer.placeholder, "#7A746C");
  assert.equal(palette.composer.bg, "#F3F4F6");
  assert.equal(palette.inspector.text, "#3A3128");
  assert.equal(palette.inspector.bg, "#F3F4F6");
  assert.notEqual(palette.composer.text, palette.composer.placeholder);
  assert.equal(palette.timeline.border, "#7A746C");
  assert.equal(palette.composer.border, "#D6A93D");
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
  assert.match(markup, /#D6A93D-fg/);
  assert.match(markup, /#7A746C-fg/);
  assert.match(markup, /#7AA9D9-fg/);
  assert.match(markup, /#2C2620-bg/);
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

  assert.match(placeholder, /#7A746C-fg/);
  assert.doesNotMatch(placeholder, /\{dim\}/);
  assert.match(composed, /#3A3128-fg/);
});

test("composer markup soft-wraps long draft lines within the visible composer width", () => {
  const palette = createRendererPalette({
    focus: "composer",
    inputLocked: false,
  });
  const composed = renderComposerMarkup({
    draft: "abcdefghij",
    inputLocked: false,
    palette,
    maxLineWidth: 4,
  });
  const plain = stripBlessedTags(composed);

  assert.match(plain, /^abcd$/m);
  assert.match(plain, /^efgh$/m);
  assert.match(plain, /^ij$/m);
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
        id: "session.help",
        name: "/help",
        aliases: [],
        description: "Show the built-in session commands.",
      },
      {
        id: "session.status",
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
  assert.match(markup, /#F2D16B-fg/);
  assert.match(markup, /#F6E8B3-fg/);
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

test("renderer palette consumes the active theme palette instead of hardcoded unrelated accents", () => {
  const palette = createRendererPalette({
    focus: "composer",
    inputLocked: false,
    themeId: "ravenclaw",
  });

  assert.equal(palette.timeline.card.welcome.border, "#2C5A8A");
  assert.equal(palette.timeline.token.command.fg, "#2C5A8A");
  assert.equal(palette.commandMenu.selectedMarker, "#F6E8B3");
});
