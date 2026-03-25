# Findings

## 2026-03-24 Design Corpus Review

### Stable Product Thesis From `00-08`

- `beta-agent` is consistently framed as a personal, CLI-first, Markdown-driven code agent runtime rather than a prompt pack or Claude Code clone.
- The core architecture is intentionally layered:
  - interaction
  - document workspace
  - runtime
  - instruction stack
  - tool runtime
  - workflow engine
  - memory/evolution
  - optional subagents
  - eval/telemetry
- The strongest recurring product principle is: freeze contracts and module boundaries before expanding capability surfaces.
- The design corpus repeatedly separates:
  - runtime mechanics
  - extension surfaces
  - work memory
  - UI

### Stable Runtime And Workflow Decisions

- Runtime should be an agent loop with explicit state and multiple tool/subagent steps per turn, not a single request-response shell.
- Instruction stack must be layered and prioritized:
  - platform rules
  - mode/state
  - global config
  - project config
  - active skills
  - task documents
- Skills are behavior modules, not knowledge cards.
- Commands, hooks, roles, and skills are separate extension surfaces and should not collapse into one prompt directory.
- Modes (`fast / balanced / strict`) are the main lever for workflow intensity, preferred over ad-hoc per-skill toggling.

### Stable Memory And Document Decisions

- Memory is intentionally split into:
  - short-term session context
  - compaction summary
  - Markdown working memory
  - project memory
  - global memory
  - future lesson/evolution memory
  - subagent-local memory
- The document hierarchy is a first-class product feature:
  - requirements
  - plan
  - task
  - summary
- Session recovery should rely on documents and repo state, not only on raw chat history.
- Compaction and task summary are explicitly different artifacts with different purposes.

### Stable Security And Multi-Agent Decisions

- Multi-agent support is desired, but v1 should favor query/review roles before implementation workers.
- Task packets are treated as the core abstraction for safe subagent delegation.
- Safety is designed as a cross-cutting system:
  - tool risk levels
  - side-effect scope
  - approval policy
  - sandbox mode
  - audit logging
  - prompt-injection boundaries
- Read content is not automatically instruction content; only specific files should enter the instruction layer.

### Important Early Risk Signals

- `08-路线图与风险.md` makes clear that the biggest design risk is not missing features but missing arbitration rules between features.
- The early roadmap orders the system as:
  - contract freeze
  - artifact workspace
  - runtime
  - tool runtime
  - instruction stack
  - planning/memory
  - skills/commands
  - reviewer roles
  - evolution
  - hooks
  - eval
- This ordering is important because recent implementation has already jumped ahead on TUI interaction, so later planning must reconcile shipped UI work with the older architecture-first roadmap.

### Key Additions From `09-16`

- The Claude Code research docs reinforce four strong design patterns:
  - short `INDEX`-style memory roots
  - manifest-first skill loading
  - subagents as context isolators
  - compaction as one part of a broader context-governance system
- The evolution design was clarified into a staged pipeline:
  - observation
  - lesson candidate
  - promoted convention
  - evolved asset
- The Markdown-driven document model was sharpened into four explicit artifact layers:
  - requirements
  - plan
  - task
  - summary
- `12-模块边界与稳定API.md` adds a hard architectural rule that later became implementation-critical:
  - `neo-blessed` must stay inside `src/tui/renderer-blessed/*`
- `13-设计调查问卷.md` and `16-已确认决策与待讨论.md` show which decisions are no longer speculative:
  - `AGENTS.md` is the project entrypoint
  - docs live under `<repo>/.beta-agent/docs/`
  - complex tasks default to `requirements + plan + task + summary`
  - runtime state uses `Markdown + SQLite/JSON` split storage
  - all major contracts should be frozen early
  - v1 subagents are read-only roles
  - default workflow mode is `balanced`
  - fullscreen TUI is now the default interactive shell shape

### Current Tension Revealed By `09-16`

- The original roadmap recommended artifact workspace and contract freeze before UI expansion.
- The project has now already shipped a meaningful TUI slice.
- Therefore the next engineering plan should not pretend the roadmap is untouched; it must explicitly reconcile:
  - already implemented TUI/runtime slices
  - still-missing contract and workspace layers
  - the user’s stronger Markdown-driven and evolution-oriented requirements

### Open Architecture Question Still Not Fully Resolved

- The biggest unresolved storage boundary remains:
  - what lives as hot Markdown working memory
  - what becomes structured runtime/session state
  - what, if anything, should later move into retrieval-oriented cold history
- This question appears in the questionnaire answers and remains central for the next plan.

### Current Code Reality Check

- The repo already contains more foundation than the early roadmap might imply:
  - `ArtifactStore`
  - `ActiveArtifactResolver`
  - session snapshot store
  - event log store
  - provider bootstrap/router
  - fullscreen TUI runner and renderer
- However, the code also confirms several gaps highlighted by the design corpus:
  - instruction loading is still mostly `AGENTS.md` only
  - active Markdown artifacts are not yet first-class runtime inputs
  - there is no mature command registry/slash-command system
  - TUI rendering is still string-card oriented rather than block/semantic rendering

### Synthesis Result

- The next plan should not restart from architecture theory.
- It should treat the current TUI/runtime shell as valid shipped context, then backfill:
  - artifact lifecycle
  - instruction resolver
  - summary/resume loop
  - command system
  - block-based TUI renderer

### Detailed Execution Focus Chosen

- The first concrete implementation track is now frozen in:
  - `plans/2026-03-24-workspace-instruction-foundation-plan.md`
- That plan intentionally prioritizes:
  - contracts
  - `.beta-agent/docs/` lifecycle
  - instruction resolver
  - identity stabilization
  - summary/resume usefulness
- TUI semantic rendering and command palette work remain important, but are intentionally sequenced after this foundation pass.

## 2026-03-24 Foundation Pass Results

### Contracts

- `artifactRefSchema` now accepts optional metadata, which lets refs carry orchestration hints without forcing every consumer to read the full Markdown body.
- `sessionSnapshotSchema` now accepts a compact structured `summary` object:
  - `headline`
  - `currentTaskId`
  - `nextStep`

### Workspace

- A new `ArtifactWorkspace` helper now initializes the standard `.beta-agent/docs/` skeleton and does not overwrite existing baseline docs.
- `ArtifactStore` now round-trips `status` and `metadata` through Markdown frontmatter.
- `ActiveArtifactResolver` can now prefer the latest summary for an active task via metadata, not only via filename/title heuristics.

### Instruction Assembly

- The project now has an explicit `instruction-resolver` layer.
- Raw project instructions (`AGENTS.md`) remain separate from:
  - project memory docs
  - resolved prompt layers
- Bootstrap now exposes `instructionStack` and no longer eagerly loads optional artifacts into `loadedArtifacts.optional`.

### Identity

- Anthropic and OpenAI-style providers now share one default assistant identity string.
- This closes the earlier gap where Anthropic/gateway paths could respond with an upstream default identity.

### Summary / Resume

- Bootstrap/session summaries now include:
  - mode
  - required docs
  - optional refs
- Resume summaries now distinguish:
  - active artifacts
  - structured headline/current task/next step
  - compacted freeform summary
- Runtime snapshots now persist the new structured summary object automatically.

## 2026-03-24 Command Surface Findings

### Runtime Boundary

- The correct boundary for slash commands is now clearer in code:
  - parse command text in a command module
  - resolve command metadata from a registry
  - return structured effects
  - apply those effects inside `RuntimeSession`
- This keeps command semantics in the runtime layer and avoids repeating special cases across:
  - interactive loop code
  - session-manager hooks
  - TUI renderer code

### Verified Behavior

- Built-in commands `/help`, `/status`, `/branch`, `/clear`, and `/exit` can now be handled without creating assistant turns.
- Renderer-neutral session hooks only receive real conversational turns after the runtime dispatch gate.
- `/clear` now behaves like a runtime effect rather than a hardcoded string branch in the interactive loop.

### Remaining Gap

- The runtime command layer exists, but discoverability is still missing:
  - no shared slash suggestion state
  - no palette shell in the renderer
- The next work should stay focused on suggestion state and palette rendering without leaking command semantics into the blessed layer.

## 2026-03-24 Slash Palette Results

### Shared State Now Exists

- Slash command discoverability is no longer renderer-only wishful thinking.
- `TuiState` now carries a renderer-agnostic `commandMenu` snapshot:
  - `visible`
  - `query`
  - `items`
  - `selectedIndex`
- The slash menu is derived from draft text against the shared built-in command registry, so command metadata has one source of truth.

### Renderer Boundary Held

- The blessed renderer only consumes:
  - `state.commandMenu`
  - a pure layout helper
  - a pure markup renderer
- Command parsing, matching, and execution semantics still live outside `src/tui/renderer-blessed/*`.

### Product Reality After This Pass

- `beta` now has the first real command-surface loop:
  - slash command registry
  - runtime dispatch
  - TUI suggestion state
  - visible palette shell
- The next command-related improvements are product refinements, not architecture gaps.

## 2026-03-24 Semantic Block Renderer Design Decisions

### Why This Is The Next Layer

- The main remaining TUI weakness is no longer interaction shell or command discoverability.
- It is that timeline rendering still collapses product semantics directly into renderer string functions.
- This blocks the next class of UX work:
  - user input cards
  - richer assistant markdown
  - execution transcript separation
  - semantic token highlighting
  - future diff/file-edit rendering

### Boundary Chosen

- `TimelineItem` remains the renderer-external input contract for this pass.
- A new renderer-agnostic block/view-model layer will sit between timeline state and blessed markup generation.
- Blessed remains responsible for layout and coloring, not markdown parsing or card semantics.

### Scope Deliberately Excluded

- Full markdown compliance is out of scope.
- Diff blocks and file-edit blocks are out of scope.
- Scrollbar semantic marks are deferred until block structure is stable.

### Expected Payoff

- After this pass, future display improvements should land as new block types or token mappings rather than more ad-hoc special cases in `tui-theme.ts`.
- This is the display-side equivalent of the earlier command-runtime cleanup: one shared structure, less renderer-local policy.

## 2026-03-24 Semantic Block Task 1 Findings

### Contracts Frozen

- The first renderer-agnostic contracts now exist for:
  - markdown blocks
  - inline text tokens
- This is enough to let Task 2 build timeline card view models without touching blessed code.

### Real Risk Surface Was Fence Handling

- The highest-risk area in the markdown subset was not paragraphs or lists, but fenced code parsing.
- Review uncovered four separate source-preservation pitfalls that would have been easy to miss with a single green test run:
  - blank lines inside fences
  - ordered-list subset not fully frozen by tests
  - unclosed fence fallback dropping source
  - fence closing detection being too permissive
- The result is a better Task 1 than the first implementation pass would have delivered without review loops.

### Practical Lesson

- For `beta`, a “narrow parser” still needs strong regression tests around malformed and near-valid syntax.
- Future markdown/view-model work should assume fence-like edge cases are worth testing early, because downstream renderer work will magnify any source-loss bug.

## 2026-03-24 Semantic Block Task 2 Findings

- Fresh spec review passed: no blocking deviations for Task 2.
- Two quality issues were found in review and fixed quickly:
  - empty-string / whitespace-only body fallback now prefers `summary` for welcome/user/system/assistant when the summary has usable text
  - execution transcript blocks normalize CRLF and ignore a trailing terminal newline without losing meaningful interior blank lines
- This keeps the semantic block pipeline honest: view-model output is stable and renderer-agnostic before the blessed migration in Task 3.

## 2026-03-24 Semantic Block Task 3 Findings

- Fresh spec review passed: no blocking deviations for Task 3.
- Follow-up quality issues were found and fixed:
  - width-aware line accounting existed but was not wired into the live TUI until `resolveTimelineWrapWidth(...)` + `renderTimelineItems(...)` integration in `src/tui/renderer-blessed/tui-app.ts`
  - renderer surface was tightened to a single public raw-timeline entry point
  - dead `showCursor` parameter removed from `renderComposerMarkup`
  - dynamic inspector/status values are now escaped before tagged blessed rendering

## 2026-03-24 Semantic Block Task 4 Findings

- Task 4 integration is complete and passed spec review + code quality review.
- `tests/tui/run-interactive-tui.test.ts` now renders each `TuiState` through the semantic block path and captures `RenderedTimelineLayout`, including selected-line assertions for rendered selection.
- Fresh verification for the renderer integration area:
  - `node --experimental-strip-types --test tests/tui/run-interactive-tui.test.ts` (4/4)
  - `npm run check`

## 2026-03-24 Semantic Block Task 5 Verification Note

- Automated verification completed successfully:
  - `npm test` (148/148)
  - `npm run check`
  - `npm run build`
- Manual fullscreen TUI smoke completed for startup, slash palette visibility on `/`, prompt submission rendering, assistant reply rendering, and markdown/list/inline-code rendering, plus clean exit with `Ctrl+D`.
- A fresh real-TTY fullscreen smoke of `node dist/src/cli/entry.js "/branch"` also showed the natural execution-card path end-to-end:
  - `System: branch: no-git`
  - collapsed `Execution: Read git branch · Details hidden`

## 2026-03-25 Execution Item Emission Path

- Added a renderer-neutral execution-item effect and hook so built-in commands can emit execution items without entering the user/assistant streams.
- `/branch` now emits an execution item with a minimal transcript:
  - `$ git rev-parse --abbrev-ref HEAD`
  - `<branch-or-no-git>`
- `runInteractiveTui()` maps the execution-item hook to the existing `append_execution_item` action, so manual fullscreen smoke can trigger a real execution card by running `/branch`.
- Built-in slash dispatch is now unified for the real interactive read loop plus `interactive.initialPrompt` and one-shot `print` prompts, which closes the earlier gap where some entry paths still sent slash commands into the user/assistant streams.
- New verification now covers that path directly:
  - `tests/runtime/session-manager.test.ts`
  - `tests/tui/run-interactive-tui.test.ts`
- The semantic block renderer track is now closed with:
  - renderer/view-model tests
  - integration tests
  - full regression/build verification
  - real fullscreen TTY smoke for a natural execution card

## Product And UX Decisions Confirmed

- Interactive default should feel like Claude Code: fullscreen app, keyboard-first navigation, alternate screen, fixed composer, thin status bar, optional right-side inspector.
- Input behavior:
  - `Enter` sends
  - `Alt+Enter` and `Ctrl+J` insert newline
  - `Tab` toggles Context Inspector
  - `Esc` moves focus to timeline
  - `i` moves focus back to input
- Output behavior:
  - user messages are deemphasized
  - tool/execution items are collapsed by default
  - only short status summaries should be visible until expanded

## Architecture Findings

- The pure TUI state layer is fully testable without any renderer dependency.
- Runtime/provider work already exposed the right integration seam:
  - session events are renderer-neutral
  - provider requests accept `AbortSignal`
  - session interruption has its own controller
- A renderer-neutral `tui-app` interface keeps `run-interactive-tui` testable without importing any terminal UI library.
- `neo-blessed` is confined to `src/tui/renderer-blessed/*`; runtime, providers, and CLI selection remain renderer-agnostic.

## Current Implementation State

- `tests/tui/tui-state.test.ts` is green for:
  - welcome state
  - focus switching
  - inspector toggling
  - context metric derivation
  - welcome-card replacement
  - execution-card expansion
  - timeline selection movement
- `tests/tui/run-interactive-tui.test.ts` is green for:
  - queued prompt submission
  - assistant output projection
  - inspector toggling
  - interrupt-and-restore-draft behavior
- `tests/cli/entry.test.ts` is green for:
  - `interactive + TTY => fullscreen TUI`
  - `-p => plain path`

## Implementation Notes

- `selectedTimelineIndex` follows the newest appended real item.
- When the timeline only contains the welcome card, the first appended real item replaces it instead of appending after it.
- Execution items use stable ids, collapsed defaults, and independent toggle behavior.
- The display wording for runtime states is decoupled from internal ids so labels can change later.
- The first fullscreen slice uses a custom lightweight composer editor in the renderer instead of coupling runtime to blessed input widgets.
- The current renderer works in a real TTY, but captured PTY output looks compressed because alternate-screen escape sequences are emitted directly.
- The repository itself is not a git repo, so the status bar currently shows `no-git` in smoke tests.
