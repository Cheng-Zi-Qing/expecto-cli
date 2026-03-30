# CLI Interaction Contract

## Goal

Freeze the approved `beta` interaction contracts across:

- entry routing
- fullscreen blessed behavior
- terminal-native stream behavior
- runtime event payloads
- execution/tool rendering
- local persistence and history replay

This spec exists to replace chat-only design memory with a repo-local source of truth before implementation resumes.

## Scope

This contract covers:

- routing and environment guards at process entry
- presenter split between fullscreen TUI and terminal-native stream output
- blessed interaction rules for focus, scrolling, help, and key bindings
- runtime event envelopes for assistant and execution streams
- persistence rules for session context, drafts, and command history

This contract does not yet freeze:

- request-level coordinator state transitions for multi-step tool calling
- exact reducer implementation details for the new event model
- final render tree code changes needed to replace the current string-based timeline items

## Supersession

The following earlier specs are now partially outdated and must not be treated as the latest source of truth for interaction behavior:

- `specs/v1-cli-spec.md`
- `specs/v1-tui-architecture.md`

In particular, the older rule `beta "<prompt>" -> fullscreen TUI` is superseded by this document.

## Product Routing

The product now has two explicit interaction tracks:

- `blessed`
  - fullscreen
  - interaction-first
  - richer TUI controls
- `native/stream`
  - terminal-native
  - no fullscreen capture
  - standard stdout-friendly behavior

### Public Entry Contract

- `beta`
  - default fullscreen blessed session
- `beta "<prompt>"`
  - single-shot stream output
- `beta --native`
  - line-based native REPL
- `beta --native "<prompt>"`
  - single-shot stream output
- `beta --tui`
  - fullscreen blessed session
- `beta --tui "<prompt>"`
  - fullscreen blessed session with the initial prompt submitted inside the TUI

### Deprecated Compatibility Surface

- `beta -p "<prompt>"` / `beta --print "<prompt>"`
  - deprecated compatibility alias for single-shot native/stream execution
  - must continue to run during the deprecation window
  - must emit a runtime warning on `stderr`
  - must be removed from primary help and README examples
- `BETA_TUI_RENDERER=terminal`
  - deprecated environment override from the older dual-renderer TUI model
  - must emit a runtime warning when used
  - must not remain the long-term selector for native/stream mode

### Explicitly Deferred Legacy Surface

- `--continue`
- `--resume`

These existing session-lifecycle entrypoints are not part of this routing cleanup pass and should remain behaviorally stable until a dedicated session-lifecycle plan replaces them.

### Routing Priority

Entrypoint routing is resolved in strict priority order:

1. non-TTY guard and fail-fast checks
2. explicit `--tui`
3. explicit `--native`
4. explicit prompt argument
5. default bare `beta` fallback

### Non-TTY Hard Rules

Non-TTY safety outranks explicit UI flags.

- if `stdin` is not a TTY or `stdout` is not a TTY:
  - never start fullscreen blessed mode
  - never start line-based REPL
  - always resolve to single-shot stream semantics

### Blind Interactive Fail-Fast

If:

- `stdout` is redirected
- `stdin` is still interactive
- no prompt was provided

then `beta` must:

- write an explanatory error to `stderr`
- exit with non-zero status

This prevents invisible REPL/TUI sessions where the user would type into a process that cannot visibly respond.

## Pipeline Semantics

### `stdin + prompt`

If both piped `stdin` content and an explicit prompt are present:

- the explicit prompt is the user instruction
- `stdin` is attached as additional context
- the process runs as single-shot stream mode

### `stdin only`

If `stdin` is present and no prompt argument exists:

- the process runs as single-shot stream mode
- the raw `stdin` content is wrapped in a stable default instruction
- the wrapper must force analysis/helpful behavior rather than raw completion behavior

Example wrapper shape:

```text
Please analyze the following input and provide the most helpful direct summary, code review, or bug-fix guidance:

[Input]
<stdin content>
```

## Presenter Architecture

The runtime owns business logic. The presenter owns display behavior.

### Approved Split

- `SessionManager` and the runtime remain renderer-neutral
- `TuiPresenter` consumes runtime events for fullscreen blessed rendering
- `StreamPresenter` consumes the same runtime events for terminal-native output

The current terminal renderer should not remain a fake second TUI. The long-term native path is a real stream presenter, not another viewport simulation.

## Runtime Event Direction

The event model should converge toward a typed event envelope with semantic payloads.

### Envelope Shape

Each runtime event should carry:

- `eventType`
- `timestamp`
- `sessionId`
- `turnId`
- `requestId`
- `payload`

The current weak generic event schema is not sufficient for the approved UI contracts and should be upgraded in a later implementation pass.

## Assistant Event Contract

Assistant output is streaming-only.

### Lifecycle

- `assistant_response_started`
- `assistant_stream_chunk`
- `assistant_response_completed`

### Payload Rules

- `responseId` identifies one assistant output segment
- `requestId` groups the full user request lifecycle
- assistant chunks must carry a `channel`
  - `output_text`
  - `reasoning_text`
- assistant chunks must carry a `format`
  - `markdown`
  - `plain_text`

### Reasoning Isolation

Reasoning must be structurally separated from normal answer text.

- reasoning must not be inferred from raw tags such as `<think>`
- reasoning must not be mixed into the main assistant markdown buffer
- reasoning may be hidden from the main timeline body by default

### Silent Thinking Protection

If any `reasoning_text` chunk is received, the presenter must show a visible active thinking indicator on the current assistant card or header.

The UI may hide the reasoning text body by default, but it must not appear frozen while long reasoning is actively streaming.

### Tool Preamble Suppression

Provider/runtime adapters must suppress non-essential tool preamble chatter before it reaches the public presenter contract.

Examples of text that must not leak into the public assistant stream:

- `I will now run the tests`
- `Let me execute a script`
- other purely transitional tool-call narration

Only pure answer text and pure reasoning text may enter the public assistant chunk stream.

### Completion Semantics

`assistant_response_completed` must expose:

- `finishReason`
  - `stop`
  - `tool_calls`
  - `max_tokens`
  - `interrupted`
  - `error`
  - `content_filter`
- `continuation`
  - `none`
  - `awaiting_execution`
- `plannedExecutionIds`
  - required when `finishReason = tool_calls`
  - forbidden otherwise
- optional usage stats
- optional normalized error code

The runtime must normalize provider-specific finish reasons before emitting them to presenters.

### Tool Call Fan-Out Contract

If an assistant segment ends with `finishReason = tool_calls`:

- `continuation` must be `awaiting_execution`
- `plannedExecutionIds` must be present
- `plannedExecutionIds` must be non-empty
- `plannedExecutionIds` must be de-duplicated

These execution identifiers form an explicit declared execution wave for the current request.

The presenter must not guess how many execution items are expected.

## Execution Event Contract

Execution and tool activity is also streaming-only.

### Lifecycle

- `execution_item_started`
- `execution_item_chunk`
- `execution_item_completed`

### Payload Rules

`execution_item_started` must include:

- `executionId`
- `executionKind`
  - `command`
  - `tool`
  - `system`
- `title`
- structured `origin`

`execution_item_chunk` must include:

- `executionId`
- `stream`
  - `stdout`
  - `stderr`
  - `system`
- `output`

`execution_item_completed` must include:

- `executionId`
- `status`
  - `success`
  - `error`
  - `interrupted`
- sanitized `summary`
- optional `exitCode`
- optional normalized `errorCode`

### Error Evidence Rule

Detailed failure evidence must flow through `execution_item_chunk`, not through `summary`.

If an execution path fails before natural process output begins, the runtime must synthesize one or more `stderr` chunks before sending the completed event.

### Summary Sanitization Law

Execution completion summaries must be aggressively sanitized before reaching the UI:

- replace any newline with a single space
- truncate to a short header-safe length
- never allow raw multiline text into card headers

## Request Coordinator Contract

The UI must not infer request completion from scattered assistant and execution events alone.

The system must maintain an explicit request-level ledger for the current foreground request.

### Frontground Request Scope

`v1` supports exactly one foreground request at a time.

- execution items may run in parallel within that request
- the composer remains locked until the active foreground request reaches a terminal event
- a second prompt must not be accepted while the foreground request is still active

### Ledger Truth

The request coordinator owns:

- active request identity
- active assistant segment
- active execution wave
- interrupt-in-progress state
- request terminal state

The presenter must derive `inputLocked` from the request ledger, not from local guesses about the latest visible card.

### Required Request Terminal Event

The runtime must emit a request-level terminal event:

- `request_completed`

The request may terminate as:

- `completed`
- `interrupted`
- `error`

The composer may unlock only after `request_completed` is received for the active foreground request.

### Why `request_completed` Is Mandatory

This prevents silent dead zones between phases such as:

- execution wave completed
- assistant continuation never started
- provider/runtime failed before the final answer segment

Without a terminal request event, the presenter would be forced to guess whether it is safe to unlock. That is forbidden.

### Execution Wave Rules

An execution wave is defined by one `assistant_response_completed` event with:

- `finishReason = tool_calls`
- explicit `plannedExecutionIds`

For every declared execution id in the wave:

- the runtime must eventually emit a terminal execution path
- if a tool never truly starts, the runtime must still synthesize a terminal path
  - `execution_item_started`
  - optional `stderr` chunk(s)
  - `execution_item_completed(error|interrupted)`

The presenter may only consider an execution wave finished when all `plannedExecutionIds` have reached terminal execution events.

### Default Failure Policy

If one execution item in a parallel wave fails:

- do not unlock the composer
- do not prematurely abandon the request ledger
- continue waiting until all execution ids in the declared wave reach terminal state

After the wave closes:

- the runtime may resume the assistant with a follow-up answer
- or emit `request_completed(error)`

The presenter does not decide which of those runtime strategies is taken. It only waits for the declared wave and the terminal request event.

### Interrupt Contract

When the user presses `Ctrl+C` during an active foreground request:

- the presenter marks interrupt intent on the request ledger
- the runtime aborts the active assistant or execution work
- all already-declared execution ids must still converge to terminal execution events
- the runtime must then emit `request_completed(interrupted)`

The presenter must not unlock early just because an interrupt was requested.

### Request Ledger Shape

The coordinator should model the foreground request as a structured ledger, not as loose booleans.

Representative fields:

- `requestId`
- `turnId`
- `activeResponseId`
- `currentExecutionWave`
- `interruptRequested`
- `terminalEventReceived`
- `terminalStatus`
- `phase`

`phase` is a derived control label rather than the sole source of truth.

Recommended derived phases:

- `assistant_active`
- `awaiting_execution_start`
- `executing`
- `awaiting_assistant_resume`
- `interrupting`
- `terminal`

### Unlock Rule

`inputLocked` must be derived from the request ledger by one rule:

- lock while an active foreground request exists and no matching `request_completed` event has been received
- unlock immediately after the matching `request_completed` event

No other assistant or execution completion event may unlock the composer on its own.

### Coordinator Transition Rules

#### On User Submit

- create a new foreground request ledger
- lock the composer immediately

#### On `assistant_response_started`

- attach `responseId` to the active request
- mark assistant as active

#### On `assistant_response_completed(stop|max_tokens|content_filter)`

- mark the assistant segment as finished
- keep the request locked
- wait for `request_completed(completed|error)` from runtime

#### On `assistant_response_completed(tool_calls)`

- clear the active assistant segment
- create a new execution wave from `plannedExecutionIds`
- keep the request locked

#### On `execution_item_started`

- the execution id must belong to the current declared execution wave
- move the request into active execution phase

#### On `execution_item_completed`

- mark that execution id terminal
- if the current wave is not fully terminal, stay locked
- if the wave becomes fully terminal, stay locked and wait for:
  - another `assistant_response_started`
  - or `request_completed(error|interrupted)`

#### On `request_completed`

- mark the foreground request terminal
- unlock the composer
- clear the active foreground request after presenter cleanup

## Runaway Agent Circuit Breaker

The runtime must protect the foreground request against infinite multi-step loops.

### Hard Rule

The runtime must enforce a maximum agent loop limit:

- `max_turn_limit`

Example initial value:

- `15`

The exact numeric default may evolve, but the existence of the circuit breaker is mandatory.

### Turn Accounting

- `turnId` must increase monotonically within a request
- each assistant-to-execution-to-assistant cycle counts toward the loop limit

The presenter does not count turns. This is a runtime responsibility.

### Limit Exceeded Behavior

If the runtime reaches the loop limit before the request naturally terminates:

- abort the active assistant or execution wave
- converge any already-declared execution ids to terminal events
- emit:
  - `request_completed(status = error, errorCode = AGENT_LOOP_LIMIT_EXCEEDED)`

The presenter treats this like any other request terminal event and unlocks the composer immediately.

## Blessed Fullscreen UX

### Scroll And Copy Modes

The fullscreen TUI exposes two explicit modes only:

- `Scroll Mode`
- `Select Mode`

No heuristic or automatic mode switching is allowed.

### Select Mode Contract

When `Select Mode` is active:

- native terminal selection is released back to the terminal
- viewport ownership belongs to the user
- auto-follow is suspended
- the visible viewport must not jump or reflow
- keyboard navigation remains available

If new output arrives while the viewport is locked:

- the timeline shows a subtle unread indicator
- the user is not forcibly snapped back to the bottom

Exiting `Select Mode` must not force a jump to the latest output.

### Discoverability

The fullscreen UI uses layered discoverability:

- contextual bottom action bar
- global mode indicator
- modal help overlay

The bottom action bar must change with focus and mode. It must not be a static wall of shortcuts.

### Help Trigger Rules

- `?` opens help only when the timeline is focused
- `/help` submitted from the composer is a local UI command and must not be sent to the runtime or provider

## Focus And Input Contract

### Focus Flow After Submit

When the user submits a prompt from the composer:

- focus remains on the composer
- the composer becomes visibly locked/read-only
- normal typing is blocked
- timeline scrolling remains available
- `Ctrl+C` remains available for interrupt

Unlocking must happen only when the full active request lifecycle is truly complete. It must not happen on the first partial completion event.

### Focus Switching

- `Tab`
  - structural focus traversal between timeline and composer
- `Esc`
  - linear escape cascade
- `i`
  - timeline to composer jump
- `Enter`
  - default action for the focused target

### Escape Cascade

`Esc` resolves in this strict order:

1. close help modal
2. close inspector
3. leave select mode or clear extra emphasis
4. composer to timeline
5. safe no-op

### Composer Editing

Composer submission and editing rules are fixed as:

- `Enter`
  - submit
- `Alt+Enter`
  - insert newline
- `Ctrl+J`
  - insert newline

`Shift+Enter` is explicitly excluded from the formal contract.

### History Navigation

The composer must behave like a lightweight editor, not a plain input string.

Rules:

- cursor truth is logical offset, not visual row/column
- history navigation must preserve the live unsent draft
- `Up/Down` move the cursor within the editor until the visible wrapped row boundary is reached
- once the visible top or bottom row boundary is hit, `Up/Down` escape into history navigation
- `Ctrl+P` and `Ctrl+N` are unconditional history navigation

## Keymap Contract

### Global

- `Ctrl+C`
  - interrupt active request
  - when idle, repeated `Ctrl+C` may exit
- `PageUp/PageDown`
  - global timeline scrolling only

### Timeline Focus

- `Up/Down`
  - move through timeline or scroll contextually
- `j/k`
  - optional advanced aliases, not required in primary hints
- `Enter`
  - toggle collapse or activate the selected item
- `i`
  - focus composer
- `Esc`
  - reduce state
- `?`
  - help overlay
- `Tab`
  - focus composer
- `o`
  - toggle inspector

### Composer Focus

- `Enter`
  - submit
- `Alt+Enter` or `Ctrl+J`
  - newline
- `Up/Down`
  - editor movement with boundary escape into history
- `Ctrl+P/Ctrl+N`
  - direct history navigation
- `Esc`
  - focus timeline, preserving draft
- `Tab`
  - focus timeline

## Render Tree Contract

The fullscreen layout should use explicit anchored geometry, not browser-like flexbox assumptions.

### Layers

- base workspace
- transient overlays
- modal scrim
- modal surface

### Main Layout

- timeline anchored above the dynamic footer/composer
- composer anchored to the bottom
- inspector overlays at the side and must not dominate the main focus ring
- command palette belongs to the transient overlay layer
- command palette must be bottom-anchored and grow upward from above the composer

### Render Ownership

Only the top-level app root may call `screen.render()`.

Child views may:

- update local state
- mark themselves dirty
- request render

Child views may not call `screen.render()` directly.

Render scheduling must be coalesced and rate-limited during stream bursts.

## Persistence Model

Persistence is intentionally split by data shape.

### Project-Scoped Session State

Project session context stays file-based under project state directories:

- `.expecto-cli/state/events/*.jsonl`
- `.expecto-cli/state/snapshots/*.json`

### Non-Project Workspaces

If the current directory is not a valid project workspace, project-like state must be redirected under:

- `~/.expecto-cli/workspaces/<fingerprint>/`

This prevents polluting arbitrary directories such as `/tmp` or `~/Downloads`.

### Global Command History

Global command history lives in SQLite:

- `~/.expecto-cli/history/commands.sqlite`

### Draft Snapshot

Draft snapshots remain isolated JSON hot-state files with atomic write behavior.

Draft writes are allowed only on:

- debounced idle input
- focus or mode transitions
- process exit or crash boundaries

## Draft Recovery

### Draft Snapshot Truth

Draft snapshots must store:

- current buffer
- logical cursor offset
- history cursor state
- live draft checkpoint

Visual cursor coordinates may be cached, but they are not the source of truth.

### Recovery Priority

Explicit live user intent always wins:

- CLI prompt arguments override stale draft restore
- piped stdin overrides stale draft restore

Session and draft restore are separate concerns:

- session context restores the timeline
- draft snapshot restores the composer

### Stale Draft Quarantine

If a recovered draft is older than the latest session progress for the same workspace, it is stale.

Stale drafts must:

- not be auto-restored into the live composer
- be quarantined into a recoverable stale area
- be garbage-collected

Garbage collection rule:

- keep at most the latest 10 stale drafts per workspace
- hard-delete anything older than 14 days

## Command History Contract

Command history is a recall cache, not an audit log.

Audit completeness belongs to the structured session event log, not to `command_history`.

### Storage Goal

The history surfaced by `Up/Down` must be:

- replayable
- low-noise
- revision-aware

### Replayable Filtering

History entries that are not safe or useful to replay must not pollute linear history navigation.

Replayable false examples:

- blank input
- local UI commands
- stdin-only wrapped requests
- ultra-short context-bound noise such as `why`, `run`, `fix`, `继续`

### Dedupe And Revision Rules

History dedupe is exact only.

- normalize newlines to `\n`
- do not trim or collapse spaces
- compute hash from the canonical text

When the exact same replayable command is submitted again:

- do not insert a new replayable row
- update its recency and submit count

When a replayed history item is edited into a new replayable command:

- insert a new replayable row
- link it back to `source_history_id`
- mark the old row as superseded

When a replayed history item is edited into a non-replayable noise prompt:

- record the noise entry only if needed for local bookkeeping
- do not supersede the original replayable item

### History API Rule

The history storage service must remain stateless.

Database code must not store the presenter's navigation cursor. Cursor state lives only in:

- composer state
- draft snapshot state

## Execution Card Contract

Execution activity renders as its own timeline card type.

### Card Rules

- one execution lifecycle maps to one stable execution card
- cards are flat timeline nodes, not nested child trees
- the card has no inner scroll region
- timeline owns scrolling
- `Enter` toggles collapse

### Transcript Storage Rule

Execution transcript storage must never be a single growing string.

The transcript buffer must use a capped head-tail strategy:

- retain the first fixed block of lines
- retain the last fixed block of lines
- track omitted middle line count
- track trailing partial fragment separately

This avoids memory blowups and avoids repeated giant string churn during heavy process output.

### Unread Counter Rule

If an execution card is collapsed while new transcript lines arrive:

- unread committed line count increases

When the user expands that card:

- unread line count resets immediately

### Chunk Processing Performance Law

Transcript chunk ingestion must use batched append and single truncation logic.

It must not:

- loop over lines and rebuild large arrays per line
- repeatedly spread or slice a full tail buffer in a tight loop

## Remaining Follow-Up

The major remaining work is implementation-oriented rather than conceptual:

- upgrade the current runtime hooks into the typed envelope model described here
- replace the current flat `TimelineItem.body` execution transcript with the capped execution-card model
- implement the request ledger and request terminal event path in runtime and presenters
