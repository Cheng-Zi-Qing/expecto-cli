# Expecto Cli Bootstrap Plan

## Current Goal

Bootstrap the repository so implementation can proceed from stable contracts and a markdown-driven workspace.

## Current Phase

Phase 0: repository bootstrap

## Immediate Objectives

1. Create the repository structure.
2. Freeze initial architectural decisions in repo-local specs.
3. Define the first contract set.
4. Build the artifact/document workspace.
5. Implement the minimal CLI entry surface.

## Active Tasks

- Create repo-local specs for CLI and memory architecture
- Add `.expecto-cli` workspace templates
- Define the first contract modules

## Risks

- prematurely hard-freezing the toolchain
- letting markdown files become implicit instructions
- overbuilding the observer/evolution subsystem before the core path works

## Next Step

Write the `v1` CLI spec and memory architecture spec, then scaffold the contract files.
