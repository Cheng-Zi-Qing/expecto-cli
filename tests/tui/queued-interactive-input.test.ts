import test from "node:test";
import assert from "node:assert/strict";

import { QueuedInteractiveInput } from "../../src/tui/queued-interactive-input.ts";

test("queued interactive input delivers submitted prompts in order and closes pending readers", async () => {
  const input = new QueuedInteractiveInput();

  const firstRead = input.readLine();
  input.submit("inspect auth");

  assert.equal(await firstRead, "inspect auth");

  input.submit("run tests");
  assert.equal(await input.readLine(), "run tests");

  const pendingRead = input.readLine();
  input.close();

  assert.equal(await pendingRead, null);
  assert.equal(await input.readLine(), null);
});
