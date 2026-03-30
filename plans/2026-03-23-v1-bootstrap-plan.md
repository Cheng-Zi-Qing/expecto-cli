# Expecto Cli V1 Bootstrap Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the initial `expecto-cli` repository with frozen contracts, a markdown-driven artifact workspace, and a minimal Claude-like CLI entrypoint.

**Architecture:** Build the project from contracts inward. Define stable schemas first, then implement the artifact/document layer, then add the CLI/runtime skeleton that consumes those contracts. Delay heavier workflow and observer behavior until the base path is testable.

**Tech Stack:** Node.js 22+, TypeScript, ESM, Markdown + SQLite/JSON

---

## File Map

- Create: `README.md`
- Create: `specs/2026-03-23-bootstrap-decisions.md`
- Create: `plans/2026-03-23-v1-bootstrap-plan.md`
- Create: `src/contracts/`
- Create: `src/cli/`
- Create: `src/runtime/`
- Create: `src/memory/`
- Create: `src/workflow/`
- Create: `src/roles/`
- Create: `src/events/`
- Create: `tests/`

---

### Task 1: Define Core Contracts

**Files:**

- Create: `src/contracts/artifact-schema.ts`
- Create: `src/contracts/tool-result-schema.ts`
- Create: `src/contracts/task-packet-schema.ts`
- Create: `src/contracts/event-schema.ts`
- Create: `src/contracts/session-snapshot-schema.ts`
- Test: `tests/contracts/*.test.ts`

- [x] **Step 1: Define the artifact schema**
- [x] **Step 2: Define the tool result schema**
- [x] **Step 3: Define the task packet schema**
- [x] **Step 4: Define the event schema**
- [x] **Step 5: Define the session snapshot schema**
- [x] **Step 6: Add contract validation tests**
- [x] **Step 7: Run the contract tests**

---

### Task 2: Establish the Project Artifact Workspace

**Files:**

- Create: `.expecto-cli/docs/00-requirements.md`
- Create: `.expecto-cli/docs/01-plan.md`
- Create: `.expecto-cli/docs/tasks/`
- Create: `.expecto-cli/docs/summaries/`
- Create: `.expecto-cli/memory/INDEX.md`
- Create: `src/core/artifact-store.ts`
- Create: `src/core/active-artifact-resolver.ts`
- Test: `tests/core/artifact-store.test.ts`

- [x] **Step 1: Create the `.expecto-cli` workspace templates**
- [x] **Step 2: Implement artifact-store read/write/list APIs**
- [x] **Step 3: Implement active-artifact-resolver**
- [x] **Step 4: Add tests for active artifact selection**
- [x] **Step 5: Run the artifact workspace tests**

---

### Task 3: Implement the Minimal CLI Entry Surface

**Files:**

- Create: `src/cli/entry.ts`
- Create: `src/cli/arg-parser.ts`
- Create: `src/runtime/session-manager.ts`
- Create: `src/runtime/bootstrap-context.ts`
- Test: `tests/cli/entry.test.ts`

- [x] **Step 1: Implement `expecto` with no args as interactive entry**
- [x] **Step 2: Implement `expecto \"<prompt>\"` as interactive-with-initial-message**
- [x] **Step 3: Implement `expecto -p \"<prompt>\"` as one-shot mode**
- [x] **Step 4: Add tests for the public CLI surface**
- [x] **Step 5: Run the CLI tests**

---

### Task 4: Implement Context Loading and Session Bootstrap

**Files:**

- Create: `src/runtime/instruction-loader.ts`
- Create: `src/memory/project-memory-loader.ts`
- Create: `src/memory/session-summary.ts`
- Test: `tests/runtime/bootstrap-context.test.ts`

- [x] **Step 1: Load `AGENTS.md` when present**
- [x] **Step 2: Load `.expecto-cli/memory/INDEX.md` when present**
- [x] **Step 3: Resolve active docs from the artifact workspace**
- [x] **Step 4: Build the minimal bootstrap context**
- [x] **Step 5: Add tests for context selection and bootstrap**
- [x] **Step 6: Run the runtime bootstrap tests**

---

### Task 5: Add Session Snapshot and Resume Basics

**Files:**

- Create: `src/runtime/session-snapshot-store.ts`
- Create: `src/runtime/resume.ts`
- Test: `tests/runtime/resume.test.ts`

- [x] **Step 1: Persist minimal session snapshots**
- [x] **Step 2: Implement resume metadata lookup**
- [x] **Step 3: Generate a small resume summary**
- [x] **Step 4: Add tests for snapshot save/load**
- [x] **Step 5: Run the resume tests**

---

### Task 6: Prepare the Next Layer

**Files:**

- Create: `specs/v1-cli-spec.md`
- Create: `specs/v1-memory-architecture.md`
- Create: `specs/v1-observer-lite-boundary.md`

- [x] **Step 1: Write the formal `v1` CLI spec**
- [x] **Step 2: Write the memory architecture spec**
- [x] **Step 3: Write the observer-lite boundary spec**
- [x] **Step 4: Review the contracts against these specs**

---

## Notes

- Build from contracts first, not from runtime loops.
- Do not let markdown files become implicit system instructions; loading must stay explicit.
- Keep `v1` subagent support read-only.
- Treat full automatic evolution as out of scope until the observer boundary is explicitly specified.
