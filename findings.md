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

## 2026-03-26 Interaction Contract Freeze

### What Is Now Explicitly Frozen

- Product routing is no longer ambiguous:
  - `beta` -> blessed fullscreen
  - `beta "<prompt>"` -> stream single-shot
  - `beta --native` -> native REPL
  - `beta --tui "<prompt>"` -> blessed with initial prompt
- Non-TTY safety outranks explicit UI flags.
- Blind interactive flows with redirected stdout must fail fast to `stderr`.
- Pipeline semantics are frozen:
  - `stdin + prompt` => instruction plus context
  - `stdin only` => wrapped analysis prompt
- Assistant and execution outputs are both contractually streaming-only.
- Tool-call preamble chatter is explicitly suppressed before presenter-facing events.
- Fullscreen UX is now frozen around:
  - explicit `Scroll Mode` and `Select Mode`
  - composer-locked submit flow
  - layered discoverability
  - stateless history service plus local draft cursor state

### Persistence Boundary Is Now Clearer

- Session context stays file-based and project-scoped.
- Command history is a SQLite-backed replay cache rather than an audit log.
- Stale drafts are quarantined rather than silently deleted.
- Stale draft GC now has concrete limits:
  - keep 10 recent stale drafts per workspace
  - delete entries older than 14 days

### Important Remaining Gap

- The previously open `Request Coordinator` gap is now closed in design:
  - request lock/unlock is controlled by a request ledger
  - parallel tool calls are declared through `plannedExecutionIds`
  - request termination is closed by explicit `request_completed`
  - interrupts remain locked until the request terminal event arrives
  - runtime must enforce a loop circuit breaker via `max_turn_limit`

### New Repo-Local Source Of Truth

- The approved design discussion is now consolidated in:
  - `specs/2026-03-26-cli-interaction-contract.md`
- This file should be treated as the active interaction contract for the next planning and implementation pass.

### Implementation Decomposition Chosen

- The interaction contract is too broad to implement safely as one giant patch.
- The first implementation plan is now intentionally narrowed to the runtime foundation:
  - typed presenter-facing event schema
  - runtime envelope emission
  - request ledger
  - capped execution transcript buffer
  - blessed-path integration
- This decomposition is important because it keeps the highest-risk state machine work isolated from:
  - native stream presenter work
  - CLI routing changes
  - SQLite history/draft persistence

### Active Implementation Plan

- The current first execution plan is now:
  - `plans/2026-03-26-interaction-runtime-foundation-plan.md`
- This should be treated as the active next engineering track.

## 2026-03-27 CLI Routing And Native Presenter Results

### Entry Contract Is Now Implemented

- CLI parsing and route selection are now physically separated:
  - raw flag parsing in `src/cli/arg-parser.ts`
  - pure TTY-aware route resolution in `src/cli/route-resolution.ts`
- The entrypoint now follows the frozen routing contract for:
  - `beta`
  - `beta --tui`
  - `beta "<prompt>"`
  - `beta --native`
  - `beta --native "<prompt>"`
- Non-TTY routing and the blind-interactive fail-fast case are now enforced at the entry layer rather than being left to incidental runtime behavior.

### Pipeline Semantics Are Explicit In Code

- `stdin + prompt` and `stdin only` prompt assembly now live in one pure helper:
  - `src/cli/stdin-pipeline.ts`
- The implementation preserves the explicit-empty-prompt vs absent-prompt distinction, which matters for the approved wrapper contract.
- A real entry regression was caught and fixed:
  - `--continue` / `--resume` had started consuming non-TTY stdin before routing
  - the final Task 5 patch restores them as true legacy pass-through routes at the entry layer

### Native Output Path Is No Longer The Old Terminal Renderer

- One-shot native output and the native REPL now flow through:
  - `src/cli/stream-presenter.ts`
  - `src/cli/run-native-session.ts`
- `renderer-terminal` is no longer part of entry selection.
- Presenter behavior is now contract-aligned:
  - assistant `output_text` streams to stdout
  - execution stderr chunks go to stderr
  - reasoning chunks are suppressed from plain native output

### Deprecation Surface Is Now Cleaner

- `-p/--print` remains supported but is visibly deprecated and warning-only.
- `BETA_TUI_RENDERER=terminal` remains warning-only and no longer changes routing.
- Deprecated surfaces were removed from primary README examples and non-compatibility tests.

### Review Outcome

- Task 5 passed a dedicated spec review after the README and legacy-stdin fixes.
- Task 5 passed a dedicated code-quality review after:
  - de-coupling entry tests from default runtime output wording
  - adding a direct fail-fast regression
- The remaining reviewer concerns were explicitly judged as non-blocking for this plan:
  - whole-stdin slurping remains an accepted tradeoff of the current pipeline contract
  - the reported `isDirectExecution()` fallback concern did not reproduce for representative string inputs within the function’s public contract

### Final Post-Review Hardening

- The first fullscreen TUI integration had one real request-lifecycle drift:
  - local prompt submission bookkeeping in `src/tui/run-interactive-tui.ts` could fall behind true emitted `turnId`s after `tool_calls -> assistant continuation`
  - the final fix now synchronizes local prompt tracking from interaction events, which restores second-prompt submission after a continued tool-call turn
- Legacy route stability required one more entry guard refinement:
  - incomplete provider environment state is now suppressed only for legacy `--continue` / `--resume`
  - prompt-driven native and stream routes still surface provider configuration errors normally
- Native error propagation is now symmetric with the interaction contract:
  - request-level terminal failures are written to stderr
  - non-REPL native routes reject on request terminal error instead of appearing to succeed
  - direct CLI execution no longer double-prints the same terminal error

### Final Verification Status

- The final targeted post-review regression suite passed:
  - `tests/cli/entry.test.ts`
  - `tests/cli/stream-presenter.test.ts`
  - `tests/cli/run-native-session.test.ts`
  - `tests/tui/run-interactive-tui.test.ts`
  - `tests/runtime/session-manager.test.ts`
  - result: `55/55`
- Final whole-repo verification is now green at:
  - `npm test` -> `273/273`
  - `npm run check`
  - `npm run build`

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

## 2026-03-25 Terminal-Native Transcript Findings

### Terminal Renderer Boundary

- The terminal renderer works better as a main-screen, scroll-region-based transcript than as an alternate-screen full-frame replay.
- Keeping the transcript in the normal terminal buffer preserves terminal-native selection/scrollback behavior while still allowing a fixed footer.
- The renderer boundary stayed clean:
  - `runInteractiveTui()` and the shared view model were unchanged
  - terminal-specific behavior stayed inside `src/tui/renderer-terminal/*`

### Rendering Strategy That Held Up

- The right primitive split for the terminal path is:
  - full transcript line rendering
  - append-vs-replay diffing
  - fixed footer rendering with cursor metadata
- Append-only updates cover the common case of normal history growth.
- Replay remains necessary for width/height changes or any update that reflows prior transcript lines.

### Product Constraint Reconfirmed On Resume

- During resume verification on 2026-03-26, the CLI default fullscreen renderer was found to have been accidentally flipped from `blessed` to `terminal`.
- Existing plans and architecture docs still support:
  - `blessed` as the default fullscreen renderer
  - `terminal` as an explicit opt-in renderer for side-by-side validation and lightweight native-scroll workflows
- The correct product rule is therefore:
  - default fullscreen path: `blessed`
  - explicit `BETA_TUI_RENDERER=terminal`: terminal-native path

### Smoke-Test Evidence

- Real TTY smoke confirmed the new terminal renderer no longer emits alternate-screen enter (`?1049h`) on startup.
- In a 12-row terminal, the transcript reserves a scroll region above the footer and `/help` output appends through that region while the footer remains fixed.
- Exit cleanup correctly restores the cursor and resets the scroll region.

### Paging Follow-Up

- A resume-time code audit found that terminal input parsing and terminal paging behavior had drifted apart:
  - `input-driver.ts` recognized `PageUp` / `PageDown`
  - but `tui-app.ts` never attached those actions to any renderer-local page movement
- The correct boundary matches the blessed path:
  - key parsing happens at the renderer input edge
  - actual page target calculation stays renderer-local because it depends on rendered transcript geometry
- After wiring renderer-local page movement, terminal timeline focus now honors page keys instead of silently doing nothing.

## 2026-03-26 PRD Review: Scroll And Window Design

### Current Product Reality

- The repo now has two renderer paths with different interaction tradeoffs:
  - `renderer-blessed`: default fullscreen renderer, richer UI, mouse capture capable
  - `renderer-terminal`: explicit opt-in via `BETA_TUI_RENDERER=terminal`, preserves terminal-native transcript behavior
- The user PRD about “scrolling vs native text copy” primarily targets the default `renderer-blessed` path, because that is where mouse tracking conflicts with drag-to-copy.
- The terminal renderer already exists specifically as a more terminal-native path and should not be forced into the same interaction model without a deliberate product decision.

### Main Design Tension

- There are two plausible product directions:
  - unify both renderers around one explicit mode toggle model
  - keep them intentionally differentiated:
    - `blessed` = richer interaction, optional select/copy mode
    - `terminal` = native transcript/copy-first path
- This is the first decision to settle before discussing specific keybindings, status affordances, or visual styling.

### User Decision

- The user explicitly chose the differentiated dual-track product model.
- Product direction is now:
  - `renderer-blessed` = interaction-first fullscreen UI
  - `renderer-terminal` = terminal-native, copy/scrollback-first path
- The user’s rationale matches the current architecture well:
  - Unix-style composability matters
  - scene separation matters more than forcing one interaction model everywhere
  - the terminal renderer should remain a reliable fallback when richer fullscreen behavior is undesirable or fragile

### Follow-Up Decision About The Terminal Path

- The user then chose a stronger version of the terminal-native path:
  - it should degrade into true standard stream mode
  - no raw mode
  - no fixed footer
  - no screen-region ownership
- This decision has an architectural consequence:
  - the current `renderer-terminal` implementation is no longer the target product shape
  - a true standard-stream path is not just a lighter fullscreen renderer, but a separate interaction/output mode
- The likely clean boundary is now:
  - `renderer-blessed` remains the fullscreen renderer
  - the terminal-native route becomes a plain/streaming CLI mode with semantic colorized output and minimal transient status behavior

### Entry Routing Direction Chosen

- The user chose a mixed routing strategy:
  - explicit flags first
  - environment variables second
  - automatic inference last
- The user’s proposed routing matrix is structurally sound for the new product split:
  - non-TTY stdin/stdout forces stream single-shot mode
  - explicit `--tui` / fullscreen request forces blessed
  - explicit `--native` request forces the stream family
  - bare `beta` remains the default fullscreen entry
- Inside the stream family, the chosen split is:
  - prompt present -> single-shot stream execution
  - no prompt + explicit native request -> line-based REPL

### Remaining Compatibility Question

- One matrix row still conflicts with the current frozen product docs:
  - today `beta "<prompt>"` is documented as entering fullscreen TUI with the first prompt
  - the new matrix would change `beta "<prompt>"` to default to single-shot stream output
- This is a valid product move, but it is a breaking behavior change and should be confirmed explicitly before design is treated as final.

### Breaking Change Confirmed

- The user explicitly confirmed that `beta "<prompt>"` should change from:
  - fullscreen TUI with an initial prompt
  to:
  - single-shot stream execution
- The user’s reasons are product-level, not incidental:
  - preserve visual context in integrated terminals such as VS Code
  - match the mental model of parameterized CLI commands as one-shot function calls
  - unlock pipelines and redirection by default
- The old behavior is not removed entirely; it becomes an explicit opt-in:
  - `beta --tui "<prompt>"`
  - or equivalent interactive/fullscreen flag naming chosen later

### Non-TTY Safety Rule

- The user explicitly confirmed that non-TTY detection must have absolute priority over explicit UI requests.
- This means `!stdin.isatty()` or `!stdout.isatty()` is evaluated before:
  - `--tui`
  - `--native`
  - environment UI preferences
- Rationale is operational safety, not taste:
  - never emit fullscreen/control-sequence UI into redirected output
  - never risk hanging a curses/blessed UI in a piped or redirected environment
- Therefore commands such as `beta --tui "write a script" > output.txt` must be forced away from fullscreen behavior regardless of explicit flags.

### Fail-Fast Guard For Blind Interactive Cases

- The user explicitly chose fail-fast behavior for contradictory commands such as:
  - `beta --tui > output.txt`
  - `beta --native > output.txt`
  - bare `beta > output.txt`
- The decisive UX argument is correct:
  - if stdout is redirected and no prompt is provided, dropping into any interactive loop creates a “blind typing” trap
  - the user sees no prompt, no progress, and no response because stdout is no longer visible
- Therefore the entrypoint guard should contain a hard validation step before normal routing:
  - if `!stdout.isatty()` and there is no prompt and stdin is still interactive, exit with an error on `stderr`
  - explain how to get a valid one-shot result instead
- This rule is stronger than graceful degradation because it prevents an apparently hung CLI.

## 2026-03-26 Blessed Scroll/Copy Mode Design

### Blessed Interaction Direction Chosen

- The user explicitly approved an interaction-first design for the fullscreen blessed path:
  - use explicit dual modes
  - avoid any “smart” half-automatic mouse heuristics
- Chosen model:
  - default `Scroll Mode`
  - explicit `Select Mode`
- The user agreed that status UI should use concise product language rather than debug-style labels:
  - `Scroll Mode`
  - `Select Mode`
- The user also approved keeping a small OS-level hint visible:
  - `Option-drag copies text on macOS`

### Why This Matters

- In the fullscreen path, the real design problem is not only mouse wheel capture.
- If copy mode is enabled but the app still auto-scrolls or steals the viewport during new output, copy mode becomes fake.
- The next design question therefore is not just “mouse on or off”, but “who owns the viewport while Select Mode is active”.

### Select Mode Semantics Confirmed

- The user explicitly approved defining `Select Mode` as:
  - native selection released back to the terminal
  - viewport ownership transferred to the user
  - automatic follow/jump behavior suspended
  - keyboard navigation still allowed
- The user added three high-value refinements that should be treated as part of the product contract:
  - unread update indicator while the viewport is locked
  - no forced viewport jump when leaving `Select Mode`
  - strict no-reflow/no-layout-shift rule for the visible viewport while copy mode is active

### Product Interpretation

- `Select Mode` is effectively:
  - scroll lock
  - copy mode
  - viewport freeze
- This is closer to `tmux` copy mode / `less` mental models than to a simple mouse toggle.

## 2026-03-26 Runtime Event Contract Review

### Current Code Reality

- The current runtime layer already has renderer-neutral intent, but not yet a unified event envelope.
- `SessionManager` / `RuntimeSession` currently expose separate callbacks for:
  - `onSystemLine`
  - `onUserPrompt`
  - `onAssistantOutput`
  - `onExecutionItem`
  - `onRuntimeStateChange`
  - `onConversationCleared`
  - `onPromptInterrupted`
- This is enough for the first fullscreen TUI integration, but it is not the right long-term contract for the newly chosen dual-presenter product model.

### Gap Against The New Direction

- The current hook set lacks a standard event envelope carrying:
  - event type
  - timestamp
  - correlation id / request id / turn id
  - typed payload
- Without a stable envelope, stream and TUI presenters would need parallel glue logic instead of consuming one protocol.
- The user’s recommended “mixed model” is the right next abstraction:
  - one standard runtime event envelope
  - semantic event types inside the envelope
  - presenter-specific rendering layered above that contract

### Assistant Output Contract Chosen

- The user explicitly chose a fully streaming assistant contract:
  - `assistant_stream_chunk`
  - followed by `assistant_response_completed`
- The user rejected a dual-shape assistant contract where presenters must support both:
  - full-text completion events
  - chunk-based incremental events
- This is the correct simplification for the presenter layer:
  - presenters always assemble assistant output from chunks
  - non-streaming providers can still adapt by emitting one large chunk followed by completion
- Therefore the runtime event contract should assume streaming as the canonical assistant output shape, not an optional capability.

## 2026-03-26 Blessed Focus Flow Design

### Submit And Stream Focus Contract

- The user approved keeping focus on the composer after prompt submission.
- Chosen behavior:
  - prompt submit does not move focus to the timeline
  - composer enters a locked/read-only visual state during streaming
  - normal text input is ignored while locked
  - `Ctrl+C` remains active as an interrupt escape hatch
  - timeline scrolling must remain possible during locked streaming via:
    - mouse wheel in `Scroll Mode`
    - global keyboard scroll shortcuts independent of composer focus

### Why This Is The Right Shape

- This preserves the chat-style mental model:
  - the composer remains the user’s home position
  - interruption is immediate and obvious
- It also avoids a common TUI trap where the app silently steals focus and forces users to fight their way back to input.
- The remaining design work is now to freeze:
  - exact locked-state visuals
  - exact global timeline scroll keys
  - exact unlock moment when execution and assistant lifecycles overlap

### Manual Focus Switching Contract

- The user proposed a clean orthogonal key contract for manual focus changes, and it matches the product direction well:
  - `Tab` = explicit UI focus traversal
  - `Esc` = leave the current active mode / return to a safer browsing state
  - `i` = fast jump from timeline back to composer input
  - `Enter` = perform the primary action for the currently focused target
- This is the right separation of concerns:
  - structural traversal stays on `Tab`
  - mode escape stays on `Esc`
  - insert intent stays on `i`
  - confirmation/action stays on `Enter`
- It also aligns with both:
  - general terminal/TUI expectations
  - Vim-influenced CLI user habits

### Resulting Focus Rules

- Composer focus:
  - `Tab` moves to timeline
  - `Esc` moves to timeline
  - `Enter` submits
- Timeline focus:
  - `Tab` moves to composer
  - `i` moves to composer and places the cursor at the end of the current draft
  - `Enter` acts on the selected timeline item
  - `Esc` should reduce state further:
    - clear selection emphasis
    - or leave `Select Mode`
    - but never trap the user deeper in UI state

### Composer History And Cursor Contract

- The user rejected all simplistic `Up/Down` rules that depend only on:
  - empty-vs-nonempty draft state
  - history-only priority
  - cursor-only priority
- The approved direction is the stronger REPL/editor contract:
  - `Up/Down` perform normal cursor movement inside the composer
  - but when the cursor hits the visible top/bottom boundary, the action escapes into history navigation
- This must be treated as a spatial-boundary rule, not a naive content-state rule.
- The correct reading of “boundary” is the physical visible row boundary of the composer, not only logical newline-delimited lines.

### Non-Negotiable Draft Preservation

- The user explicitly required zero-index draft protection:
  - the current unsent draft must be preserved as the “return point” when history navigation starts
  - when the user navigates back down to the live draft, it must be restored without loss
  - cursor position should be restored as well, not only text content
- The user also required unconditional history keys for terminal veterans:
  - `Ctrl+P` = previous history
  - `Ctrl+N` = next history
- This implies a richer composer model than the current append-only draft string:
  - text buffer
  - cursor position
  - history index
  - saved live draft snapshot

### Composer Submit/Newline Contract

- The user approved the final submit-vs-newline split:
  - `Enter` = submit
  - `Alt+Enter` / `Option+Enter` = insert newline
  - `Ctrl+J` = insert newline
- The user explicitly agreed that `Shift+Enter` should not be part of the formal contract.
- Reason:
  - standard terminal protocols do not provide a stable cross-terminal distinction for `Shift+Enter`
  - promising it in the product contract would create an avoidable compatibility trap
- This means the blessed composer contract is now stable enough to be treated as frozen for:
  - focus flow
  - history navigation
  - submit/newline behavior

## 2026-03-26 Blessed Discoverability Design

### Discoverability Model Chosen

- The user explicitly approved a tiered discoverability model instead of:
  - always-visible exhaustive hotkey text
  - or documentation-only discovery
- The chosen model is:
  - Tier 1: contextual bottom action bar
  - Tier 2: global mode/status indicator
  - Tier 3: modal help overlay

### Context-Aware Bottom Bar

- The user refined the bottom help bar into a state-aware action surface rather than static text.
- Approved direction:
  - when focus is on the composer, show input-centric actions
  - when focus is on the timeline, show browsing-centric actions
  - macOS copy fallback hint should appear only when it is actually relevant, especially in timeline `Scroll Mode`
- This keeps the interface quiet while still teachable.

### Help Surface Direction

- The user explicitly wants full hotkey help as a modal overlay, not as:
  - a separate screen
  - or a wall of always-visible hints
- `/help` should remain a command-level equivalent entry.
- One remaining key conflict still needs explicit resolution before the keymap can be frozen:
  - whether `?` can safely be a global help key while the composer is focused, given that `?` is also valid input text

## 2026-03-26 Blessed Render Tree Direction

### High-Level Layering

- The user proposed a three-layer render tree for the fullscreen blessed path:
  - Layer 0: base workspace
  - Layer 1: context overlays
  - Layer 2: modal interruptions
- This matches the product decisions already made for:
  - timeline/composer as the main loop
  - inspector as a secondary surface
  - help as a true modal interruption

### Important Implementation Refinements

- In blessed, this should be implemented with strict append/z-order discipline and one top-level render scheduler, not with child-owned render calls.
- The main layout should prefer explicit anchored geometry over abstract flex-style layout to avoid resize/reflow quirks:
  - timeline anchored above footer
  - footer anchored to the bottom with dynamic height
  - inspector clipped to the timeline region rather than reshaping the whole screen
  - modal appended last with event capture semantics

### Missing Node Identified

- The proposed tree still needs one explicit transient surface between overlay and modal concepts:
  - slash/command palette
  - unread badges or lock indicators if rendered as floating widgets
- This suggests the final blessed tree will likely need:
  - base workspace
  - transient overlays
  - modal overlays

### Render Ownership Decision

- The user’s “top-level owns screen.render()” rule is correct and should be treated as mandatory.
- A practical implementation note is to use coalesced scheduling rather than naive immediate renders from each chunk:
  - one pending render flag
  - batched state updates
  - capped render frequency during streaming bursts

## 2026-03-26 Persistence Architecture Direction

### Storage Split Confirmed

- The user explicitly approved the mixed persistence design:
  - project-scoped session context stays file-based under `.beta-agent/state/`
  - global command history moves to SQLite under `~/.beta-agent/history/`
  - draft snapshots remain isolated hot-state JSON files
- The user also explicitly approved the fallback rule for non-project contexts:
  - use `~/.beta-agent/workspaces/<fingerprint>/` instead of polluting arbitrary directories

### Draft I/O Red Line

- The user added an essential performance/safety constraint:
  - draft snapshots must not be written on every keypress
- Approved write triggers:
  - debounce after typing idle
  - focus/mode transition
  - process exit / crash boundary
- This should be treated as mandatory for the draft persistence design.

### Recovery Priority Discussion

- The user proposed a strong stale-draft eviction rule:
  - if `DraftSnapshot.updatedAt` is older than the latest meaningful session activity time, treat the draft as stale
- The stale-draft detection predicate is directionally correct.
- The still-open question is the stale-draft action:
  - the user proposed silent eviction and blank-composer startup
  - the safer product stance may be:
    - do not auto-restore stale drafts into the composer
    - but also do not destroy them immediately
    - quarantine them as recoverable stale drafts until TTL cleanup

## 2026-03-27 Interaction Runtime Foundation Closure

### Runtime Boundary Hardening

- Task 5 review surfaced a real contract-boundary gap in `RuntimeSession`:
  - `kind: "output"` assistant results could carry invalid `responseId`, invalid `finishReason`, or invalid usage payloads straight into interaction events
  - `kind: "tool_calls"` results could carry an empty `plannedExecutionIds` array and emit schema-invalid envelopes
- The final behavior now distinguishes the two cases explicitly:
  - malformed `kind: "output"` results are normalized into a valid output lifecycle
  - malformed `kind: "tool_calls"` results fail fast with `InvalidAssistantStepResult` and terminate the request through `request_completed(error)`

### Loop-Limit Recovery

- The other real Task 5 gap was post-error recovery:
  - when `AGENT_LOOP_LIMIT_EXCEEDED` fired, the current user prompt still remained in `conversation`
  - the next interactive prompt therefore inherited stale failed context
- The runtime now removes that active prompt before closing the request, matching the safer cleanup behavior already used for interrupts.

### Final Verification Result

- The interaction-runtime-foundation plan is now fully verified in the worktree with fresh evidence:
  - focused suite:
    - `node --experimental-strip-types --test tests/contracts/interaction-event-schema.test.ts tests/runtime/session-manager.test.ts tests/runtime/interactive-session.test.ts tests/tui/request-ledger.test.ts tests/tui/execution-transcript-buffer.test.ts tests/tui/tui-state.test.ts tests/tui/run-interactive-tui.test.ts`
  - full suite:
    - `npm test`
  - typecheck:
    - `npm run check`
  - build:
    - `npm run build`
