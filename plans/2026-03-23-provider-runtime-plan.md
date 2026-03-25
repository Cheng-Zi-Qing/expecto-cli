# Provider Runtime Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-agnostic model layer that can route by role and drive the existing runtime assistant hook without introducing provider-specific branching into `SessionManager`.

**Architecture:** Define provider contracts first, then implement a small in-process registry and router. Build the runtime integration around an `assistantStep` adapter so the CLI/runtime path stays stable while providers evolve independently. Start with deterministic test providers only; native SDK adapters come later.

**Tech Stack:** Node.js 22+, TypeScript, ESM, existing runtime/session contracts, no SDK dependencies in this phase

---

## File Map

- Create: `src/providers/provider-types.ts`
- Create: `src/providers/provider-registry.ts`
- Create: `src/providers/provider-router.ts`
- Create: `src/providers/provider-runner.ts`
- Create: `src/providers/static-provider.ts`
- Modify: `src/runtime/session-manager.ts`
- Modify: `src/runtime/session-factory.ts`
- Modify: `src/runtime/runtime-session.ts`
- Test: `tests/providers/provider-runner.test.ts`
- Test: `tests/runtime/session-manager.test.ts`

### Task 1: Define Provider Contracts and Routing Types

**Files:**

- Create: `src/providers/provider-types.ts`
- Test: `tests/providers/provider-runner.test.ts`

- [x] **Step 1: Write the failing tests for provider request/response handling and role routing assumptions**
- [x] **Step 2: Run the provider tests to verify they fail**
- [x] **Step 3: Implement provider roles, request/response types, and provider capability contracts**
- [x] **Step 4: Run the provider tests to verify the contract layer is importable**

### Task 2: Implement Registry, Router, and Deterministic Test Provider

**Files:**

- Create: `src/providers/provider-registry.ts`
- Create: `src/providers/provider-router.ts`
- Create: `src/providers/static-provider.ts`
- Test: `tests/providers/provider-runner.test.ts`

- [x] **Step 1: Extend the provider tests for registration and role-based routing**
- [x] **Step 2: Run the provider tests to verify they fail**
- [x] **Step 3: Implement the registry, router, and a deterministic static provider**
- [x] **Step 4: Run the provider tests to verify they pass**

### Task 3: Build the Runtime Provider Runner

**Files:**

- Create: `src/providers/provider-runner.ts`
- Test: `tests/providers/provider-runner.test.ts`
- Test: `tests/runtime/session-manager.test.ts`

- [x] **Step 1: Add failing tests for converting runtime assistant-step input into a provider completion request**
- [x] **Step 2: Run the provider/runtime tests to verify they fail**
- [x] **Step 3: Implement a provider runner that resolves a routed provider and returns assistant output**
- [x] **Step 4: Run the provider/runtime tests to verify they pass**

### Task 4: Wire Provider Runner Into the Runtime Without Breaking the Public CLI

**Files:**

- Modify: `src/runtime/session-manager.ts`
- Modify: `src/runtime/session-factory.ts`
- Modify: `src/runtime/runtime-session.ts`
- Test: `tests/runtime/session-manager.test.ts`

- [x] **Step 1: Add failing runtime tests for default provider-backed assistant output**
- [x] **Step 2: Run the runtime tests to verify they fail**
- [x] **Step 3: Wire the provider runner through the existing assistant hook boundary**
- [x] **Step 4: Run the runtime tests to verify they pass**

## Notes

- Keep provider registration explicit; no implicit global singleton.
- Route by role, not by model name, inside runtime code.
- Do not add Anthropic/OpenAI SDK calls in this phase.
- Keep one-shot completion synchronous and deterministic for tests.
- This phase is only complete when tests and `tsc --noEmit` are green.
