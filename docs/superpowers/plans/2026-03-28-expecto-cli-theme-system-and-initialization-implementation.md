# Expecto CLI Theme System And Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-run theme selection flow, persisted local theme preference, `/theme` re-entry, and a shared theme framework with Hufflepuff as the first fully implemented theme.

**Architecture:** Introduce a data-driven theme registry plus a dedicated user config store, wire theme selection into TUI state as an overlay instead of a transcript card, and route both the normal welcome screen and the initialization sample through shared themed assets. Keep terminal and blessed renderers on the same semantic contract so later themes are mostly new data definitions.

**Tech Stack:** Node.js 22+, TypeScript, Node test runner, existing TUI state/view-model pipeline, sticky terminal renderer, blessed renderer, built-in command execution pipeline.

---

## File Map

- Create: `src/tui/theme/theme-types.ts`
- Create: `src/tui/theme/theme-registry.ts`
- Create: `src/tui/theme/themes/hufflepuff.ts`
- Create: `src/cli/user-config.ts`
- Modify: `src/commands/command-types.ts`
- Modify: `src/commands/builtin-commands.ts`
- Modify: `src/commands/command-executor.ts`
- Modify: `src/runtime/runtime-session.ts`
- Modify: `src/tui/tui-types.ts`
- Modify: `src/tui/tui-state.ts`
- Modify: `src/tui/view-model/tui-view-types.ts`
- Modify: `src/tui/view-model/timeline-blocks.ts`
- Modify: `src/tui/view-model/tui-view-model.ts`
- Modify: `src/tui/run-interactive-tui.ts`
- Modify: `src/tui/sticky-screen/interactive-console-app.ts`
- Modify: `src/tui/sticky-screen/presentation-surface.ts`
- Modify: `src/tui/renderer-terminal/input-driver.ts`
- Modify: `src/tui/renderer-terminal/transcript-renderer.ts`
- Modify: `src/tui/renderer-terminal/footer-renderer.ts`
- Modify: `src/tui/renderer-blessed/tui-runtime.ts`
- Modify: `src/tui/renderer-blessed/tui-theme.ts`
- Modify: `src/tui/renderer-blessed/block-renderer.ts`
- Modify: `src/tui/renderer-blessed/tui-app.ts`
- Test: `tests/commands/builtin-commands.test.ts`
- Create Test: `tests/commands/command-executor.test.ts`
- Create Test: `tests/cli/user-config.test.ts`
- Test: `tests/tui/tui-state.test.ts`
- Test: `tests/tui/view-model/timeline-blocks.test.ts`
- Test: `tests/tui/view-model/tui-view-model.test.ts`
- Test: `tests/tui/renderer-terminal/transcript-renderer.test.ts`
- Test: `tests/tui/renderer-terminal/footer-renderer.test.ts`
- Test: `tests/tui/sticky-screen/interactive-console-app.test.ts`
- Test: `tests/tui/renderer-blessed/tui-runtime.test.ts`
- Test: `tests/tui/renderer-blessed/tui-theme.test.ts`
- Test: `tests/tui/renderer-blessed/block-renderer.test.ts`
- Test: `tests/tui/renderer-blessed/tui-app.test.ts`
- Test: `tests/tui/run-interactive-tui.test.ts`

## Task 1: Create The Theme Registry And The Local User Config Store

**Files:**
- Create: `src/tui/theme/theme-types.ts`
- Create: `src/tui/theme/theme-registry.ts`
- Create: `src/tui/theme/themes/hufflepuff.ts`
- Create: `src/cli/user-config.ts`
- Create Test: `tests/cli/user-config.test.ts`

- [ ] **Step 1: Write failing tests for local theme persistence and theme lookup**

```ts
test("loadUserConfig returns null themeId when no config file exists", async () => {
  // expect stable empty config semantics
});

test("saveUserConfig persists a themeId and loadUserConfig reads it back", async () => {
  // expect round-trip theme persistence
});

test("theme registry returns the Hufflepuff theme and stable house metadata", () => {
  // expect id, label, availability, and welcome assets
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:
```bash
node --experimental-strip-types --test \
  tests/cli/user-config.test.ts
```

Expected:
- FAIL because the config store and theme registry do not exist yet

- [ ] **Step 3: Implement the data-first theme contract**

Implementation notes:
- create a dedicated user config file at `~/.beta-agent/config.json`
- keep the config interface narrow: load and save only the fields needed now
- define theme ids and availability explicitly
- implement Hufflepuff as the first full theme definition
- include Gryffindor, Ravenclaw, and Slytherin as visible planned entries in the registry so the selector can render all four houses from the start
- avoid fake final assets for the planned themes; use explicit planned-preview data instead

- [ ] **Step 4: Re-run the focused tests and verify they pass**

Run:
```bash
node --experimental-strip-types --test \
  tests/cli/user-config.test.ts
```

Expected:
- PASS with stable theme persistence and Hufflepuff registry data

- [ ] **Step 5: Commit the registry and config store**

```bash
git add \
  src/tui/theme/theme-types.ts \
  src/tui/theme/theme-registry.ts \
  src/tui/theme/themes/hufflepuff.ts \
  src/cli/user-config.ts \
  tests/cli/user-config.test.ts
git commit -m "feat: add theme registry and local theme config"
```

## Task 2: Extend Built-In Commands And Runtime Effects For `/theme`

**Files:**
- Modify: `src/commands/command-types.ts`
- Modify: `src/commands/builtin-commands.ts`
- Modify: `src/commands/command-executor.ts`
- Modify: `src/runtime/runtime-session.ts`
- Test: `tests/commands/builtin-commands.test.ts`
- Create Test: `tests/commands/command-executor.test.ts`

- [ ] **Step 1: Write failing tests for `/theme` registration and effect emission**

```ts
test("builtin command registry includes /theme", () => {
  // expect id ordering and lookup support
});

test("executeBuiltinCommand returns an open-theme-selector effect for /theme", async () => {
  // expect a handled local command effect, not a provider prompt
});
```

- [ ] **Step 2: Run the focused command tests and verify they fail**

Run:
```bash
node --experimental-strip-types --test \
  tests/commands/builtin-commands.test.ts \
  tests/commands/command-executor.test.ts
```

Expected:
- FAIL because `/theme` and its command effect do not exist

- [ ] **Step 3: Add a dedicated command effect for opening the theme picker**

Implementation notes:
- extend the built-in command id union with `theme`
- make `/theme` route through the normal built-in command executor
- add a runtime-session hook/effect path for opening the local theme picker
- do not abuse `system_message` for this UI-only state change

- [ ] **Step 4: Re-run the focused command tests and verify they pass**

Run:
```bash
node --experimental-strip-types --test \
  tests/commands/builtin-commands.test.ts \
  tests/commands/command-executor.test.ts
```

Expected:
- PASS with `/theme` wired as a built-in command

- [ ] **Step 5: Commit the command pipeline work**

```bash
git add \
  src/commands/command-types.ts \
  src/commands/builtin-commands.ts \
  src/commands/command-executor.ts \
  src/runtime/runtime-session.ts \
  tests/commands/builtin-commands.test.ts \
  tests/commands/command-executor.test.ts
git commit -m "feat: add theme picker command effect"
```

## Task 3: Add Theme State And A Picker Overlay To The TUI Model

**Files:**
- Modify: `src/tui/tui-types.ts`
- Modify: `src/tui/tui-state.ts`
- Modify: `src/tui/view-model/tui-view-types.ts`
- Modify: `src/tui/view-model/tui-view-model.ts`
- Test: `tests/tui/tui-state.test.ts`
- Test: `tests/tui/view-model/tui-view-model.test.ts`

- [ ] **Step 1: Write failing tests for first-launch theme picker state**

```ts
test("createInitialTuiState opens the theme picker when no saved theme exists", () => {
  // expect active overlay state and a highlighted default theme
});

test("applying a theme closes the picker and sets the active theme id", () => {
  // expect overlay closure plus persisted active theme state
});

test("buildTuiViewModel exposes a structured theme-picker overlay when active", () => {
  // expect overlay data rather than null
});
```

- [ ] **Step 2: Run the focused state and view-model tests and verify they fail**

Run:
```bash
node --experimental-strip-types --test \
  tests/tui/tui-state.test.ts \
  tests/tui/view-model/tui-view-model.test.ts
```

Expected:
- FAIL because TUI state has no active theme or picker overlay model

- [ ] **Step 3: Implement theme-aware TUI state**

Implementation notes:
- add `activeThemeId`
- add a dedicated theme picker state branch with `reason`, `selectedThemeId`, and visibility
- reuse `move_selection_up`, `move_selection_down`, and `toggle_selected_item` semantics while the picker is active instead of inventing a second navigation API
- keep current timeline replacement and request lifecycle behavior intact when the picker is not active

- [ ] **Step 4: Re-run the focused tests and verify they pass**

Run:
```bash
node --experimental-strip-types --test \
  tests/tui/tui-state.test.ts \
  tests/tui/view-model/tui-view-model.test.ts
```

Expected:
- PASS with a structured picker overlay and active theme state

- [ ] **Step 5: Commit the state model changes**

```bash
git add \
  src/tui/tui-types.ts \
  src/tui/tui-state.ts \
  src/tui/view-model/tui-view-types.ts \
  src/tui/view-model/tui-view-model.ts \
  tests/tui/tui-state.test.ts \
  tests/tui/view-model/tui-view-model.test.ts
git commit -m "feat: add theme picker state and overlay model"
```

## Task 4: Wire First-Run Detection, Theme Persistence, And `/theme` Re-Entry In `runInteractiveTui`

**Files:**
- Modify: `src/tui/run-interactive-tui.ts`
- Test: `tests/tui/run-interactive-tui.test.ts`

- [ ] **Step 1: Write failing integration tests for first-launch and `/theme` reopening**

```ts
test("runInteractiveTui opens the picker on first launch and blocks prompt mode until a theme is applied", async () => {
  // expect picker overlay and no normal prompt submission while active
});

test("runInteractiveTui reopens the picker when /theme is executed", async () => {
  // expect current theme to be preselected
});
```

- [ ] **Step 2: Run the focused integration tests and verify they fail**

Run:
```bash
node --experimental-strip-types --test tests/tui/run-interactive-tui.test.ts
```

Expected:
- FAIL because no theme preference load/save path or local reopen effect exists

- [ ] **Step 3: Implement the runtime wiring**

Implementation notes:
- load the saved theme preference before creating initial state
- open the picker when no saved theme exists
- save the applied theme immediately when selected
- make `/theme` reopen the picker with the current theme selected
- keep provider/session lifecycle unchanged outside the picker flow

- [ ] **Step 4: Re-run the focused integration tests and verify they pass**

Run:
```bash
node --experimental-strip-types --test tests/tui/run-interactive-tui.test.ts
```

Expected:
- PASS with first-run gating and `/theme` re-entry behavior

- [ ] **Step 5: Commit the runtime wiring**

```bash
git add src/tui/run-interactive-tui.ts tests/tui/run-interactive-tui.test.ts
git commit -m "feat: wire first-run theme selection flow"
```

## Task 5: Render The Theme Picker Overlay And Themed Welcome In The Terminal Path

**Files:**
- Modify: `src/tui/view-model/timeline-blocks.ts`
- Modify: `src/tui/renderer-terminal/input-driver.ts`
- Modify: `src/tui/renderer-terminal/transcript-renderer.ts`
- Modify: `src/tui/renderer-terminal/footer-renderer.ts`
- Modify: `src/tui/sticky-screen/presentation-surface.ts`
- Modify: `src/tui/sticky-screen/interactive-console-app.ts`
- Test: `tests/tui/view-model/timeline-blocks.test.ts`
- Test: `tests/tui/renderer-terminal/transcript-renderer.test.ts`
- Test: `tests/tui/renderer-terminal/footer-renderer.test.ts`
- Test: `tests/tui/sticky-screen/interactive-console-app.test.ts`

- [ ] **Step 1: Write failing tests for the terminal theme picker and themed welcome**

```ts
test("renderTranscript renders the Hufflepuff welcome using the active theme assets", () => {
  // expect badger glyph and yellow/gray token accents
});

test("renderFooter renders picker controls instead of the composer while theme selection is active", () => {
  // expect move/apply hints rather than prompt entry
});

test("interactive console input routes up/down/enter to picker navigation while the overlay is active", async () => {
  // expect no draft mutation and no prompt submission during selection
});
```

- [ ] **Step 2: Run the focused terminal tests and verify they fail**

Run:
```bash
node --experimental-strip-types --test \
  tests/tui/view-model/timeline-blocks.test.ts \
  tests/tui/renderer-terminal/transcript-renderer.test.ts \
  tests/tui/renderer-terminal/footer-renderer.test.ts \
  tests/tui/sticky-screen/interactive-console-app.test.ts
```

Expected:
- FAIL because the terminal path does not support a picker overlay or a theme-driven welcome/palette

- [ ] **Step 3: Implement terminal overlay rendering and themed palette use**

Implementation notes:
- render the picker as a structured overlay, not a transcript paragraph
- render the right-side sample from the same Hufflepuff welcome asset model used by the real welcome card
- while the picker is active, suppress draft entry and reuse up/down/enter as selection controls
- switch transcript token colors and welcome chrome to the active theme palette

- [ ] **Step 4: Re-run the focused terminal tests and verify they pass**

Run:
```bash
node --experimental-strip-types --test \
  tests/tui/view-model/timeline-blocks.test.ts \
  tests/tui/renderer-terminal/transcript-renderer.test.ts \
  tests/tui/renderer-terminal/footer-renderer.test.ts \
  tests/tui/sticky-screen/interactive-console-app.test.ts
```

Expected:
- PASS with a rendered picker overlay and Hufflepuff-themed welcome

- [ ] **Step 5: Commit the terminal renderer changes**

```bash
git add \
  src/tui/view-model/timeline-blocks.ts \
  src/tui/renderer-terminal/input-driver.ts \
  src/tui/renderer-terminal/transcript-renderer.ts \
  src/tui/renderer-terminal/footer-renderer.ts \
  src/tui/sticky-screen/presentation-surface.ts \
  src/tui/sticky-screen/interactive-console-app.ts \
  tests/tui/view-model/timeline-blocks.test.ts \
  tests/tui/renderer-terminal/transcript-renderer.test.ts \
  tests/tui/renderer-terminal/footer-renderer.test.ts \
  tests/tui/sticky-screen/interactive-console-app.test.ts
git commit -m "feat: render theme picker in terminal tui"
```

## Task 6: Thread Theme Semantics Through The Blessed Path

**Files:**
- Modify: `src/tui/renderer-blessed/tui-runtime.ts`
- Modify: `src/tui/renderer-blessed/tui-theme.ts`
- Modify: `src/tui/renderer-blessed/block-renderer.ts`
- Modify: `src/tui/renderer-blessed/tui-app.ts`
- Test: `tests/tui/renderer-blessed/tui-runtime.test.ts`
- Test: `tests/tui/renderer-blessed/tui-theme.test.ts`
- Test: `tests/tui/renderer-blessed/block-renderer.test.ts`
- Test: `tests/tui/renderer-blessed/tui-app.test.ts`

- [ ] **Step 1: Write failing blessed tests for picker navigation and theme palette rendering**

```ts
test("interpretKeypress routes up/down/enter to the picker when the overlay is active", () => {
  // expect picker navigation actions
});

test("createRendererPalette consumes the active theme instead of hardcoded colors", () => {
  // expect Hufflepuff token colors from theme data
});

test("renderTimelineCardMarkup or equivalent overlay renderer shows the theme picker structure", () => {
  // expect left house rail and right live sample
});
```

- [ ] **Step 2: Run the focused blessed tests and verify they fail**

Run:
```bash
node --experimental-strip-types --test \
  tests/tui/renderer-blessed/tui-runtime.test.ts \
  tests/tui/renderer-blessed/tui-theme.test.ts \
  tests/tui/renderer-blessed/block-renderer.test.ts \
  tests/tui/renderer-blessed/tui-app.test.ts
```

Expected:
- FAIL because the blessed path is still hardcoded and overlay-free

- [ ] **Step 3: Implement blessed overlay and theme palette support**

Implementation notes:
- keep the same semantic theme roles as the terminal path
- make the picker a first-class screen state, not a blessed-only special case
- keep current timeline and composer behavior unchanged when the picker is inactive

- [ ] **Step 4: Re-run the focused blessed tests and verify they pass**

Run:
```bash
node --experimental-strip-types --test \
  tests/tui/renderer-blessed/tui-runtime.test.ts \
  tests/tui/renderer-blessed/tui-theme.test.ts \
  tests/tui/renderer-blessed/block-renderer.test.ts \
  tests/tui/renderer-blessed/tui-app.test.ts
```

Expected:
- PASS with palette abstraction and picker interaction parity

- [ ] **Step 5: Commit the blessed renderer support**

```bash
git add \
  src/tui/renderer-blessed/tui-runtime.ts \
  src/tui/renderer-blessed/tui-theme.ts \
  src/tui/renderer-blessed/block-renderer.ts \
  src/tui/renderer-blessed/tui-app.ts \
  tests/tui/renderer-blessed/tui-runtime.test.ts \
  tests/tui/renderer-blessed/tui-theme.test.ts \
  tests/tui/renderer-blessed/block-renderer.test.ts \
  tests/tui/renderer-blessed/tui-app.test.ts
git commit -m "feat: thread themes through blessed tui"
```

## Task 7: Run End-To-End Verification For The First Theme Delivery

**Files:**
- No new files
- Verify: `tests/commands/builtin-commands.test.ts`
- Verify: `tests/commands/command-executor.test.ts`
- Verify: `tests/cli/user-config.test.ts`
- Verify: `tests/tui/tui-state.test.ts`
- Verify: `tests/tui/view-model/timeline-blocks.test.ts`
- Verify: `tests/tui/view-model/tui-view-model.test.ts`
- Verify: `tests/tui/renderer-terminal/transcript-renderer.test.ts`
- Verify: `tests/tui/renderer-terminal/footer-renderer.test.ts`
- Verify: `tests/tui/sticky-screen/interactive-console-app.test.ts`
- Verify: `tests/tui/renderer-blessed/tui-runtime.test.ts`
- Verify: `tests/tui/renderer-blessed/tui-theme.test.ts`
- Verify: `tests/tui/renderer-blessed/block-renderer.test.ts`
- Verify: `tests/tui/renderer-blessed/tui-app.test.ts`
- Verify: `tests/tui/run-interactive-tui.test.ts`

- [ ] **Step 1: Run the targeted theme-system suite**

Run:
```bash
node --experimental-strip-types --test \
  tests/commands/builtin-commands.test.ts \
  tests/commands/command-executor.test.ts \
  tests/cli/user-config.test.ts \
  tests/tui/tui-state.test.ts \
  tests/tui/view-model/timeline-blocks.test.ts \
  tests/tui/view-model/tui-view-model.test.ts \
  tests/tui/renderer-terminal/transcript-renderer.test.ts \
  tests/tui/renderer-terminal/footer-renderer.test.ts \
  tests/tui/sticky-screen/interactive-console-app.test.ts \
  tests/tui/renderer-blessed/tui-runtime.test.ts \
  tests/tui/renderer-blessed/tui-theme.test.ts \
  tests/tui/renderer-blessed/block-renderer.test.ts \
  tests/tui/renderer-blessed/tui-app.test.ts \
  tests/tui/run-interactive-tui.test.ts
```

Expected:
- PASS

- [ ] **Step 2: Rebuild the project**

Run:
```bash
npm run build
```

Expected:
- PASS

- [ ] **Step 3: Manual verification checklist**

Run:
```bash
beta
```

Check:
- first launch opens the required theme picker when no theme config exists
- left navigation moves selection and the right sample updates live
- `Enter` persists the selection and enters the normal themed TUI directly
- later launches skip the picker and use the saved theme
- `/theme` reopens the picker and reapplies a new choice
- the active Hufflepuff welcome and semantic highlights use the shared theme palette

- [ ] **Step 4: Commit the first theme system delivery**

```bash
git add \
  src/tui/theme/theme-types.ts \
  src/tui/theme/theme-registry.ts \
  src/tui/theme/themes/hufflepuff.ts \
  src/cli/user-config.ts \
  src/commands/command-types.ts \
  src/commands/builtin-commands.ts \
  src/commands/command-executor.ts \
  src/runtime/runtime-session.ts \
  src/tui/tui-types.ts \
  src/tui/tui-state.ts \
  src/tui/view-model/tui-view-types.ts \
  src/tui/view-model/timeline-blocks.ts \
  src/tui/view-model/tui-view-model.ts \
  src/tui/run-interactive-tui.ts \
  src/tui/sticky-screen/interactive-console-app.ts \
  src/tui/sticky-screen/presentation-surface.ts \
  src/tui/renderer-terminal/input-driver.ts \
  src/tui/renderer-terminal/transcript-renderer.ts \
  src/tui/renderer-terminal/footer-renderer.ts \
  src/tui/renderer-blessed/tui-runtime.ts \
  src/tui/renderer-blessed/tui-theme.ts \
  src/tui/renderer-blessed/block-renderer.ts \
  src/tui/renderer-blessed/tui-app.ts \
  tests/commands/builtin-commands.test.ts \
  tests/commands/command-executor.test.ts \
  tests/cli/user-config.test.ts \
  tests/tui/tui-state.test.ts \
  tests/tui/view-model/timeline-blocks.test.ts \
  tests/tui/view-model/tui-view-model.test.ts \
  tests/tui/renderer-terminal/transcript-renderer.test.ts \
  tests/tui/renderer-terminal/footer-renderer.test.ts \
  tests/tui/sticky-screen/interactive-console-app.test.ts \
  tests/tui/renderer-blessed/tui-runtime.test.ts \
  tests/tui/renderer-blessed/tui-theme.test.ts \
  tests/tui/renderer-blessed/block-renderer.test.ts \
  tests/tui/renderer-blessed/tui-app.test.ts \
  tests/tui/run-interactive-tui.test.ts
git commit -m "feat: add theme system and first-run picker"
```
