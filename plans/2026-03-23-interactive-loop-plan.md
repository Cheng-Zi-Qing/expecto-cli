# Interactive Loop Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `beta` from a one-shot wrapper into a real multi-turn interactive CLI session with persisted session state, conversation carry-forward, and first slash commands.

**Architecture:** Keep the public `beta` entry unchanged, but add a small terminal input abstraction and let `RuntimeSession` own the interactive turn loop. Conversation state lives in the runtime session and is passed to the provider runner on each turn. Slash commands are handled in the runtime layer before the provider is called.

**Tech Stack:** Node.js 22+, TypeScript, ESM, existing runtime/provider layer, Node readline for live terminal input

---

## File Map

- Modify: `src/cli/entry.ts`
- Modify: `src/runtime/runtime-session.ts`
- Modify: `src/runtime/session-manager.ts`
- Create: `src/runtime/interactive-input.ts`
- Modify: `src/providers/provider-runner.ts`
- Test: `tests/runtime/interactive-session.test.ts`
- Test: `tests/runtime/session-manager.test.ts`
- Test: `tests/cli/entry.test.ts`

### Task 1: Add Interactive Input Abstraction

**Files:**

- Create: `src/runtime/interactive-input.ts`
- Test: `tests/runtime/interactive-session.test.ts`

- [x] **Step 1: Write the failing tests for supplying scripted interactive input**
- [x] **Step 2: Run the interactive-session tests to verify they fail**
- [x] **Step 3: Implement a minimal line-reader abstraction for runtime sessions**
- [x] **Step 4: Run the interactive-session tests to verify they pass**

### Task 2: Add Multi-Turn Interactive Session Flow

**Files:**

- Modify: `src/runtime/runtime-session.ts`
- Modify: `src/runtime/session-manager.ts`
- Test: `tests/runtime/interactive-session.test.ts`

- [x] **Step 1: Extend the tests for multiple interactive turns and explicit `/exit`**
- [x] **Step 2: Run the runtime tests to verify they fail**
- [x] **Step 3: Implement the interactive turn loop and turn counting**
- [x] **Step 4: Run the runtime tests to verify they pass**

### Task 3: Carry Conversation History Into Provider Requests

**Files:**

- Modify: `src/providers/provider-runner.ts`
- Modify: `src/runtime/runtime-session.ts`
- Test: `tests/runtime/interactive-session.test.ts`

- [x] **Step 1: Extend the tests to verify previous user/assistant turns are sent back to the provider**
- [x] **Step 2: Run the runtime tests to verify they fail**
- [x] **Step 3: Persist conversation messages in the runtime session and pass them to the assistant step**
- [x] **Step 4: Run the runtime tests to verify they pass**

### Task 4: Add `/clear` and `/exit`

**Files:**

- Modify: `src/runtime/runtime-session.ts`
- Test: `tests/runtime/interactive-session.test.ts`

- [x] **Step 1: Extend the tests for `/clear` resetting conversation state and `/exit` ending the loop**
- [x] **Step 2: Run the runtime tests to verify they fail**
- [x] **Step 3: Implement slash command handling before provider dispatch**
- [x] **Step 4: Run the runtime tests to verify they pass**

## Notes

- Do not add rich TUI rendering in this phase.
- Keep interactive command handling minimal: `/exit` and `/clear` only.
- Do not implement tool calls in the interactive loop yet.
- This phase is only complete when tests and `tsc --noEmit` are green.

## Verification

- [x] `npm test`
- [x] `npm run check`
