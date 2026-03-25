import test from "node:test";
import assert from "node:assert/strict";

import {
  findBuiltinCommand,
  listBuiltinCommands,
} from "../../src/commands/builtin-commands.ts";
import { parseSlashCommand } from "../../src/commands/command-parser.ts";

test("builtin command registry exposes the first session command set", () => {
  const commands = listBuiltinCommands();

  assert.deepEqual(
    commands.map((command) => command.id),
    ["help", "clear", "status", "branch", "exit"],
  );
  assert.equal(commands[0]?.name, "/help");
  assert.match(commands[1]?.description ?? "", /conversation/i);
});

test("builtin command lookup resolves commands by slash name", () => {
  const command = findBuiltinCommand("status");

  assert.equal(command?.id, "status");
  assert.equal(command?.name, "/status");
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
