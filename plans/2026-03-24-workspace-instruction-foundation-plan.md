# Workspace And Instruction Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `.expecto-cli/docs/`, active artifacts, layered instructions, and resume summaries into real runtime behavior so `expecto` starts acting like a Markdown-driven agent instead of a TUI shell with mostly static bootstrap context.

**Architecture:** Keep the current runtime shell and fullscreen TUI intact. Strengthen the foundation underneath it by adding explicit workspace lifecycle helpers, a real instruction resolver, richer session/task summaries, and bootstrap wiring that keeps renderer logic isolated from runtime, provider, and memory layers.

**Tech Stack:** Node.js 22+, TypeScript, ESM, Zod schemas, Node test runner, existing `ArtifactStore`, `SessionManager`, provider runner, fullscreen TUI adapter

---

## File Map

- Create: `specs/2026-03-24-workspace-instruction-foundation.md`
- Create: `src/runtime/instruction-resolver.ts`
- Create: `src/core/artifact-workspace.ts`
- Create: `tests/runtime/instruction-resolver.test.ts`
- Create: `tests/core/artifact-workspace.test.ts`
- Modify: `src/contracts/artifact-schema.ts`
- Modify: `src/contracts/session-snapshot-schema.ts`
- Modify: `src/core/artifact-store.ts`
- Modify: `src/core/active-artifact-resolver.ts`
- Modify: `src/runtime/bootstrap-context.ts`
- Modify: `src/runtime/instruction-loader.ts`
- Modify: `src/runtime/resume.ts`
- Modify: `src/memory/session-summary.ts`
- Modify: `src/runtime/runtime-session.ts`
- Modify: `tests/core/artifact-store.test.ts`
- Modify: `tests/runtime/bootstrap-context.test.ts`
- Modify: `tests/runtime/resume.test.ts`
- Modify: `tests/providers/http-provider.test.ts`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

### Task 1: Freeze The Foundation Contracts

**Files:**
- Create: `specs/2026-03-24-workspace-instruction-foundation.md`
- Modify: `src/contracts/artifact-schema.ts`
- Modify: `src/contracts/session-snapshot-schema.ts`
- Test: `tests/contracts/schema.test.ts`

- [x] **Step 1: Write failing schema tests for the new artifact/session contract fields**

Add tests that cover:
- artifact refs/documents carrying lifecycle metadata needed by workspace orchestration
- active artifact sets remaining split into `required`, `optional`, `onDemand`
- session snapshots carrying enough structured summary metadata for resume/catch-up

- [x] **Step 2: Run the targeted schema tests and verify they fail for the expected missing fields**

Run: `node --experimental-strip-types --test tests/contracts/schema.test.ts`
Expected: FAIL on missing artifact/session contract fields or stricter schema expectations

- [x] **Step 3: Implement the minimal contract updates and write the supporting spec note**

Update:
- `src/contracts/artifact-schema.ts`
- `src/contracts/session-snapshot-schema.ts`

Document:
- what belongs in Markdown artifacts
- what belongs in structured session state
- what the bootstrap/runtime layers are allowed to assume

- [x] **Step 4: Re-run the schema tests and verify they pass**

Run: `node --experimental-strip-types --test tests/contracts/schema.test.ts`
Expected: PASS

### Task 2: Add Workspace Lifecycle Helpers For `.expecto-cli/docs/`

**Files:**
- Create: `src/core/artifact-workspace.ts`
- Modify: `src/core/artifact-store.ts`
- Modify: `src/core/active-artifact-resolver.ts`
- Test: `tests/core/artifact-workspace.test.ts`
- Test: `tests/core/artifact-store.test.ts`

- [x] **Step 1: Write failing tests for workspace initialization and active artifact selection**

Cover:
- initializing the standard docs skeleton under `.expecto-cli/docs/`
- creating the baseline `00-requirements.md` and `01-plan.md` when missing
- resolving an active task plus the latest relevant summary
- keeping research-only findings out of `required` unless explicitly requested

- [x] **Step 2: Run the targeted core tests and verify they fail**

Run: `node --experimental-strip-types --test tests/core/artifact-store.test.ts tests/core/artifact-workspace.test.ts`
Expected: FAIL for missing workspace helper and missing lifecycle behavior

- [x] **Step 3: Implement the minimal workspace helper and resolver updates**

Implement:
- `src/core/artifact-workspace.ts` to create/ensure the docs skeleton
- `src/core/artifact-store.ts` support for lifecycle-oriented metadata read/write
- `src/core/active-artifact-resolver.ts` to make active artifact decisions explicit and testable

- [x] **Step 4: Re-run the targeted core tests and verify they pass**

Run: `node --experimental-strip-types --test tests/core/artifact-store.test.ts tests/core/artifact-workspace.test.ts`
Expected: PASS

### Task 3: Replace The Simple Loader With A Real Instruction Resolver

**Files:**
- Create: `src/runtime/instruction-resolver.ts`
- Modify: `src/runtime/instruction-loader.ts`
- Modify: `src/runtime/bootstrap-context.ts`
- Test: `tests/runtime/instruction-resolver.test.ts`
- Test: `tests/runtime/bootstrap-context.test.ts`

- [x] **Step 1: Write failing tests for layered instruction assembly**

Cover:
- `AGENTS.md` remains project entrypoint
- memory index/topic docs stay distinct from instructions
- active artifacts are summarized and classified before loading
- mode and identity layers appear ahead of project/user/task layers
- optional docs are not always loaded into the bootstrap context

- [x] **Step 2: Run the targeted runtime tests and verify they fail**

Run: `node --experimental-strip-types --test tests/runtime/instruction-resolver.test.ts tests/runtime/bootstrap-context.test.ts`
Expected: FAIL because there is no resolver and bootstrap still loads only the old simple instruction set

- [x] **Step 3: Implement the resolver and wire bootstrap through it**

Implement:
- `src/runtime/instruction-resolver.ts`
- a small, explicit output shape for resolved instruction layers
- `src/runtime/bootstrap-context.ts` updates so active artifacts, memory docs, and layered instructions are assembled in one place
- `src/runtime/instruction-loader.ts` reduced to file-loading primitives instead of owning instruction policy

- [x] **Step 4: Re-run the targeted runtime tests and verify they pass**

Run: `node --experimental-strip-types --test tests/runtime/instruction-resolver.test.ts tests/runtime/bootstrap-context.test.ts`
Expected: PASS

### Task 4: Stabilize Assistant Identity And Provider Request Assembly

**Files:**
- Modify: `src/runtime/runtime-session.ts`
- Modify: `src/providers/provider-runner.ts`
- Modify: `tests/providers/http-provider.test.ts`

- [x] **Step 1: Write failing tests that prove assistant identity is explicit across provider paths**

Cover:
- Anthropic requests receive a stable system identity layer when none was explicitly provided by the task
- OpenAI-compatible requests keep the same identity
- the default assistant name is `beta`, not a gateway/provider default

- [x] **Step 2: Run the targeted provider tests and verify they fail**

Run: `node --experimental-strip-types --test tests/providers/http-provider.test.ts`
Expected: FAIL because the identity layer is missing or inconsistent

- [x] **Step 3: Implement the minimal identity injection in the runtime/provider assembly seam**

Implement:
- a single identity source tied to resolved instructions
- request assembly updates so both Anthropic and OpenAI-style paths receive the same base identity unless explicitly overridden

- [x] **Step 4: Re-run the targeted provider tests and verify they pass**

Run: `node --experimental-strip-types --test tests/providers/http-provider.test.ts`
Expected: PASS

### Task 5: Make Session Summary And Resume Catch-Up Useful

**Files:**
- Modify: `src/memory/session-summary.ts`
- Modify: `src/runtime/resume.ts`
- Modify: `src/runtime/bootstrap-context.ts`
- Modify: `src/runtime/runtime-session.ts`
- Modify: `tests/runtime/resume.test.ts`
- Modify: `tests/runtime/bootstrap-context.test.ts`

- [x] **Step 1: Write failing tests for richer summaries and catch-up output**

Cover:
- session summaries include active docs, current mode, and useful document scope
- resume summaries distinguish active artifacts from compacted text
- latest task summary is preferred over a generic older summary when resuming
- session bootstrap can surface a compact but structured catch-up string

- [x] **Step 2: Run the targeted runtime tests and verify they fail**

Run: `node --experimental-strip-types --test tests/runtime/resume.test.ts tests/runtime/bootstrap-context.test.ts`
Expected: FAIL because current summaries are too shallow

- [x] **Step 3: Implement the minimal richer summary and resume builders**

Implement:
- `src/memory/session-summary.ts` richer structured rendering
- `src/runtime/resume.ts` better catch-up formatting
- runtime/snapshot write path updates so summaries remain useful for future resumes

- [x] **Step 4: Re-run the targeted runtime tests and verify they pass**

Run: `node --experimental-strip-types --test tests/runtime/resume.test.ts tests/runtime/bootstrap-context.test.ts`
Expected: PASS

### Task 6: Verify End-To-End And Update Project Working Memory

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Modify: `plans/2026-03-24-workspace-instruction-foundation-plan.md`

- [x] **Step 1: Run the full automated verification suite**

Run:
- `npm test`
- `npm run check`
- `npm run build`

Expected: all PASS

- [x] **Step 2: Run a manual smoke test that exercises bootstrap and resume behavior**

Run:
- `beta`
- `beta -c`

Expected:
- interactive path still opens the fullscreen TUI
- bootstrap context reflects active workspace artifacts
- resume path produces a more useful catch-up summary

- [x] **Step 3: Update planning memory and mark completed items in this plan**

Update:
- `task_plan.md`
- `findings.md`
- `progress.md`

## Notes

- Do not leak `neo-blessed` outside `src/tui/renderer-blessed/*`.
- Do not collapse Markdown artifacts and structured runtime state into one storage mechanism.
- Keep instruction policy in a resolver, not in ad-hoc file loaders.
- Do not overbuild artifact orchestration; initialize the minimum standard skeleton first.
- Keep summary generation structured and compact so it can support both context display and resume catch-up.
