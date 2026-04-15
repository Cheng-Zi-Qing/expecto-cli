import test from "node:test";
import assert from "node:assert/strict";

import {
  createHelpSections,
  findCommandByInput,
  listAllCommands,
  listImplementedCommands,
  listImplementedCommandsByCategory,
} from "../../src/commands/command-registry.ts";
import {
  findBuiltinCommand,
  listBuiltinCommands,
} from "../../src/commands/builtin-commands.ts";
import { parseSlashCommand } from "../../src/commands/command-parser.ts";

test("listAllCommands exposes namespaced ids with category and availability metadata", () => {
  const commands = listAllCommands();

  assert.deepEqual(
    commands.map((command) => command.id),
    [
      "session.help",
      "session.status",
      "session.clear",
      "session.theme",
      "session.exit",
      "project.branch",
      "project.init",
      "debug.inspect",
      "debug.stack",
    ],
  );
  assert.equal(
    commands.find((command) => command.id === "debug.inspect")?.availability,
    "hidden",
  );
  assert.equal(
    commands.find((command) => command.id === "project.branch")?.category,
    "project",
  );
});

test("listImplementedCommandsByCategory exposes only the first formal command set", () => {
  const sections = listImplementedCommandsByCategory();

  assert.deepEqual(
    sections.map((section) => ({
      category: section.category,
      commands: section.commands.map((command) => command.name),
    })),
    [
      {
        category: "session",
        commands: ["/help", "/status", "/clear", "/theme", "/exit"],
      },
      {
        category: "project",
        commands: ["/branch", "/init"],
      },
      {
        category: "debug",
        commands: ["/stack"],
      },
    ],
  );
});

test("createHelpSections keeps visible implemented commands grouped by category", () => {
  const sections = createHelpSections();

  assert.deepEqual(
    sections.map((section) => ({
      category: section.category,
      commands: section.commands.map((command) => command.name),
    })),
    [
      {
        category: "session",
        commands: ["/help", "/status", "/clear", "/theme", "/exit"],
      },
      {
        category: "project",
        commands: ["/branch", "/init"],
      },
      {
        category: "debug",
        commands: ["/stack"],
      },
    ],
  );
  assert.ok(
    sections.every((section) =>
      section.commands.every((command) => command.availability === "implemented"),
    ),
  );
});

test("findCommandByInput resolves hidden /inspect without exposing it in visible listings", () => {
  assert.equal(findCommandByInput("/inspect")?.id, "debug.inspect");
  assert.ok(!listImplementedCommands().some((command) => command.name === "/inspect"));
});

test("builtin compatibility layer preserves legacy command ids for existing consumers", () => {
  assert.deepEqual(
    listBuiltinCommands().map((command) => command.id),
    ["help", "clear", "status", "branch", "init", "inspect", "theme", "exit", "stack"],
  );
});

test("findBuiltinCommand resolves to legacy ids including hidden compatibility command", () => {
  assert.equal(findBuiltinCommand("theme")?.id, "theme");
  assert.equal(findBuiltinCommand("/inspect")?.id, "inspect");
});

test("registry returns defensive copies so external mutation cannot corrupt later reads", () => {
  const firstRead = listAllCommands();
  const sessionHelp = firstRead.find((command) => command.id === "session.help");

  assert.ok(sessionHelp);
  sessionHelp.description = "mutated description";
  sessionHelp.aliases.push("/mutated-alias");

  const secondRead = listAllCommands();
  const freshSessionHelp = secondRead.find((command) => command.id === "session.help");

  assert.ok(freshSessionHelp);
  assert.equal(freshSessionHelp.description, "Show the built-in session commands.");
  assert.deepEqual(freshSessionHelp.aliases, []);
  assert.equal(findCommandByInput("/mutated-alias"), undefined);
});

test("parseSlashCommand parses the command name and arguments", () => {
  const parsed = parseSlashCommand("/branch main");

  assert.deepEqual(parsed, {
    raw: "/branch main",
    name: "branch",
    args: ["main"],
  });
});

test("parseSlashCommand ignores normal prompts and blank slash input", () => {
  assert.equal(parseSlashCommand("hello"), null);
  assert.equal(parseSlashCommand("/"), null);
  assert.equal(parseSlashCommand("   /   "), null);
});
