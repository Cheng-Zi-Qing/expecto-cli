# Runtime Core Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real runtime spine behind `beta`: session identity, event logging, snapshot persistence, and a minimal turn loop shell that later provider adapters can plug into.

**Architecture:** Keep the runtime split into small modules with explicit contracts. `SessionManager` should orchestrate a `RuntimeSession`, which owns identifiers, state transitions, event emission, and snapshot persistence. Provider integration stays out of this phase; the runtime loop emits deterministic placeholder assistant output so the orchestration surface can be verified first.

**Tech Stack:** Node.js 22+, TypeScript, ESM, JSON snapshot/event persistence, existing zod contracts

---

## File Map

- Modify: `src/runtime/session-manager.ts`
- Create: `src/runtime/session-factory.ts`
- Create: `src/runtime/runtime-session.ts`
- Create: `src/runtime/event-log-store.ts`
- Create: `src/runtime/session-id.ts`
- Modify: `src/runtime/session-snapshot-store.ts`
- Modify: `src/runtime/resume.ts`
- Test: `tests/runtime/session-manager.test.ts`
- Test: `tests/runtime/event-log-store.test.ts`
- Test: `tests/runtime/resume.test.ts`

### Task 1: Add Session Identity and Event Log Persistence

**Files:**

- Create: `src/runtime/session-id.ts`
- Create: `src/runtime/event-log-store.ts`
- Test: `tests/runtime/event-log-store.test.ts`

- [x] **Step 1: Write the failing tests for session id generation and event persistence**
- [x] **Step 2: Run the event-log tests to verify they fail**
- [x] **Step 3: Implement `session-id.ts` and `event-log-store.ts` with minimal JSON persistence**
- [x] **Step 4: Run the event-log tests to verify they pass**

### Task 2: Add a Minimal Runtime Session Spine

**Files:**

- Create: `src/runtime/session-factory.ts`
- Create: `src/runtime/runtime-session.ts`
- Modify: `src/runtime/session-manager.ts`
- Test: `tests/runtime/session-manager.test.ts`

- [x] **Step 1: Write the failing tests for interactive and one-shot session execution**
- [x] **Step 2: Run the session-manager tests to verify they fail**
- [x] **Step 3: Implement a runtime session that emits `session:start`, `turn:start`, `turn:end`, and `session:stop` events**
- [x] **Step 4: Update `session-manager.ts` to use the runtime session instead of printing directly**
- [x] **Step 5: Run the session-manager tests to verify they pass**

### Task 3: Persist Snapshots From the Runtime Session

**Files:**

- Modify: `src/runtime/runtime-session.ts`
- Modify: `src/runtime/session-snapshot-store.ts`
- Modify: `src/runtime/resume.ts`
- Test: `tests/runtime/resume.test.ts`
- Test: `tests/runtime/session-manager.test.ts`

- [x] **Step 1: Write the failing tests for automatic snapshot persistence and latest-session resume lookup**
- [x] **Step 2: Run the affected runtime tests to verify they fail**
- [x] **Step 3: Persist a minimal snapshot at the end of each session**
- [x] **Step 4: Extend resume lookup to support recent-session recovery without an explicit id**
- [x] **Step 5: Run the runtime and resume tests to verify they pass**

### Task 4: Leave a Stable Hook Point for Providers

**Files:**

- Create: `src/runtime/runtime-session.ts`
- Modify: `src/runtime/session-manager.ts`
- Test: `tests/runtime/session-manager.test.ts`

- [x] **Step 1: Write the failing tests for a provider-agnostic assistant output step**
- [x] **Step 2: Run the session-manager tests to verify they fail**
- [x] **Step 3: Add a placeholder assistant output hook in the runtime session**
- [x] **Step 4: Run the session-manager tests to verify they pass**

## Notes

- Do not add provider SDK dependencies in this phase.
- Keep event emission and snapshot persistence explicit and synchronous for now.
- Prefer deterministic placeholder outputs over fake streaming complexity.
- This phase is only complete when tests and `tsc --noEmit` are green.
