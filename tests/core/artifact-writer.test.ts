import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import matter from "gray-matter";

import { currentAppPath } from "../../src/core/brand.ts";
import { ArtifactWriter } from "../../src/core/artifact-writer.ts";

async function makeProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "expecto-writer-"));
  await mkdir(join(root, currentAppPath("docs", "tasks", "active")), { recursive: true });
  await mkdir(join(root, currentAppPath("docs", "tasks", "backlog")), { recursive: true });
  await mkdir(join(root, currentAppPath("docs", "summaries")), { recursive: true });
  return root;
}

function fixedClock(iso: string): () => Date {
  return () => new Date(iso);
}

async function readMd(projectRoot: string, relative: string): Promise<{ data: Record<string, unknown>; content: string }> {
  const raw = await readFile(join(projectRoot, relative), "utf8");
  const parsed = matter(raw);
  return { data: parsed.data as Record<string, unknown>, content: parsed.content };
}

// ---------- kind=task ----------

test("ArtifactWriter writes a new task to tasks/active with derived T-001-slug path", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot);

  const ref = await writer.write({
    kind: "task",
    title: "implement auth flow",
    content: "# Task\n",
  });

  assert.equal(ref.kind, "task");
  assert.equal(ref.path, `${currentAppPath("docs", "tasks", "active")}/T-001-implement-auth-flow.md`);
  assert.equal(ref.title, "T-001-implement-auth-flow");

  const file = await readMd(projectRoot, ref.path);
  assert.match(file.content, /# Task/);
});

test("ArtifactWriter increments task serial across successive writes", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot);

  const first = await writer.write({ kind: "task", title: "first", content: "a" });
  const second = await writer.write({ kind: "task", title: "second", content: "b" });
  const third = await writer.write({ kind: "task", title: "third", content: "c" });

  assert.match(first.title, /^T-001-/);
  assert.match(second.title, /^T-002-/);
  assert.match(third.title, /^T-003-/);
});

test("ArtifactWriter serial scan includes backlog tasks", async () => {
  const projectRoot = await makeProjectRoot();
  await writeFile(
    join(projectRoot, currentAppPath("docs", "tasks", "backlog"), "T-042-old.md"),
    "# Old\n",
  );

  const writer = new ArtifactWriter(projectRoot);
  const ref = await writer.write({ kind: "task", title: "new", content: "x" });

  assert.equal(ref.title, "T-043-new");
});

test("ArtifactWriter rejects metadata.taskId from caller on kind=task", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot);

  await assert.rejects(
    () =>
      writer.write({
        kind: "task",
        title: "foo",
        content: "x",
        metadata: { taskId: "T-999-forced" },
      }),
    /taskId/i,
  );
});

test("ArtifactWriter slug normalizes unicode NFKD, strips combining marks, lowercases, collapses dashes", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot);

  const ref = await writer.write({
    kind: "task",
    title: "Café éàü — Test!",
    content: "x",
  });

  assert.equal(ref.title, "T-001-cafe-eau-test");
});

test("ArtifactWriter slug truncates to 40 chars and trims trailing dash", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot);

  const ref = await writer.write({
    kind: "task",
    title: "aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd eee",
    content: "x",
  });

  const slug = ref.title.replace(/^T-\d{3}-/, "");
  assert.ok(slug.length <= 40, `expected slug <= 40 chars, got ${slug.length}: ${slug}`);
  assert.doesNotMatch(slug, /-$/);
});

test("ArtifactWriter slug falls back to 'untitled' when title produces empty slug", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot);

  const ref = await writer.write({ kind: "task", title: "@@@ !!!", content: "x" });

  assert.equal(ref.title, "T-001-untitled");
});

// ---------- kind=summary ----------

test("ArtifactWriter summary requires metadata.artifact_subtype", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot);

  await assert.rejects(
    () => writer.write({ kind: "summary", title: "x", content: "y" }),
    /artifact_subtype/,
  );
});

test("ArtifactWriter summary(task) requires metadata.taskId", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot);

  await assert.rejects(
    () =>
      writer.write({
        kind: "summary",
        title: "x",
        content: "y",
        metadata: { artifact_subtype: "task" },
      }),
    /taskId/,
  );
});

test("ArtifactWriter summary(task) rejects malformed taskId (T-1, T-001-, T-001--auth)", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot);

  for (const bad of ["T-1", "T-001-", "T-001--auth", "t-001", "T001", "T-01a"]) {
    await assert.rejects(
      () =>
        writer.write({
          kind: "summary",
          title: "x",
          content: "y",
          metadata: { artifact_subtype: "task", taskId: bad },
        }),
      new RegExp(`taskId`),
      `expected rejection for ${bad}`,
    );
  }
});

test("ArtifactWriter summary(task) derives path from taskKey prefix and date", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot, { clock: fixedClock("2026-04-17T09:00:00.000Z") });

  const ref = await writer.write({
    kind: "summary",
    title: "Auth summary",
    content: "done",
    metadata: { artifact_subtype: "task", taskId: "T-001-auth-flow" },
  });

  assert.equal(ref.path, `${currentAppPath("docs", "summaries")}/T-001-2026-04-17.md`);

  // taskKey parse works for bare prefix too
  const ref2 = await writer.write({
    kind: "summary",
    title: "Bare",
    content: "done",
    metadata: { artifact_subtype: "task", taskId: "T-002" },
  });
  assert.equal(ref2.path, `${currentAppPath("docs", "summaries")}/T-002-2026-04-17.md`);
});

test("ArtifactWriter summary(session|compact|resume_catch_up) requires metadata.sessionId", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot);

  for (const subtype of ["session", "compact", "resume_catch_up"] as const) {
    await assert.rejects(
      () =>
        writer.write({
          kind: "summary",
          title: "x",
          content: "y",
          metadata: { artifact_subtype: subtype },
        }),
      /sessionId/,
      `expected rejection for subtype ${subtype}`,
    );
  }
});

test("ArtifactWriter summary(session) derives session-<sid8>-<date>.md", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot, { clock: fixedClock("2026-04-17T09:00:00.000Z") });

  const ref = await writer.write({
    kind: "summary",
    title: "Session recap",
    content: "done",
    metadata: { artifact_subtype: "session", sessionId: "abcdef1234567890" },
  });

  assert.equal(ref.path, `${currentAppPath("docs", "summaries")}/session-abcdef12-2026-04-17.md`);
});

test("ArtifactWriter summary(compact) derives compact-<sid8>-<date>.md", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot, { clock: fixedClock("2026-04-17T09:00:00.000Z") });

  const ref = await writer.write({
    kind: "summary",
    title: "Compact",
    content: "done",
    metadata: { artifact_subtype: "compact", sessionId: "zzzz8888yyyy" },
  });

  assert.equal(ref.path, `${currentAppPath("docs", "summaries")}/compact-zzzz8888-2026-04-17.md`);
});

test("ArtifactWriter summary(resume_catch_up) derives resume-catch-up-<sid8>-<date>.md", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot, { clock: fixedClock("2026-04-17T09:00:00.000Z") });

  const ref = await writer.write({
    kind: "summary",
    title: "Resume",
    content: "done",
    metadata: { artifact_subtype: "resume_catch_up", sessionId: "abcdefgh00000000" },
  });

  assert.equal(ref.path, `${currentAppPath("docs", "summaries")}/resume-catch-up-abcdefgh-2026-04-17.md`);
});

test("ArtifactWriter summary rejects unknown artifact_subtype", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot);

  await assert.rejects(
    () =>
      writer.write({
        kind: "summary",
        title: "x",
        content: "y",
        metadata: { artifact_subtype: "bogus" },
      }),
    /artifact_subtype/,
  );
});

// ---------- kind rejection ----------

test("ArtifactWriter rejects kind=requirements|plan|finding in initial version", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot);

  for (const kind of ["requirements", "plan", "finding"] as const) {
    await assert.rejects(
      () => writer.write({ kind, title: "x", content: "y" }),
      /not supported/,
      `expected rejection for kind=${kind}`,
    );
  }
});

// ---------- collision ----------

test("ArtifactWriter appends -2, -3 suffix on path collision instead of overwriting", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot, { clock: fixedClock("2026-04-17T09:00:00.000Z") });

  const first = await writer.write({
    kind: "summary",
    title: "Auth",
    content: "first write",
    metadata: { artifact_subtype: "task", taskId: "T-001-auth" },
  });
  const second = await writer.write({
    kind: "summary",
    title: "Auth",
    content: "second write",
    metadata: { artifact_subtype: "task", taskId: "T-001-auth" },
  });
  const third = await writer.write({
    kind: "summary",
    title: "Auth",
    content: "third write",
    metadata: { artifact_subtype: "task", taskId: "T-001-auth" },
  });

  assert.equal(first.path, `${currentAppPath("docs", "summaries")}/T-001-2026-04-17.md`);
  assert.equal(second.path, `${currentAppPath("docs", "summaries")}/T-001-2026-04-17-2.md`);
  assert.equal(third.path, `${currentAppPath("docs", "summaries")}/T-001-2026-04-17-3.md`);

  const firstFile = await readMd(projectRoot, first.path);
  assert.match(firstFile.content, /first write/);
});

// ---------- updatedAt auto-fill ----------

test("ArtifactWriter auto-fills metadata.updatedAt with ISO timestamp", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot, { clock: fixedClock("2026-04-17T09:00:00.000Z") });

  const ref = await writer.write({
    kind: "summary",
    title: "Session",
    content: "x",
    metadata: { artifact_subtype: "session", sessionId: "abcdef1234" },
  });

  const file = await readMd(projectRoot, ref.path);
  assert.equal(file.data.updatedAt, "2026-04-17T09:00:00.000Z");
  assert.equal(file.data.artifact_subtype, "session");
  assert.equal(file.data.sessionId, "abcdef1234");
});

test("ArtifactWriter preserves caller-provided status in frontmatter", async () => {
  const projectRoot = await makeProjectRoot();
  const writer = new ArtifactWriter(projectRoot);

  const ref = await writer.write({
    kind: "task",
    title: "Active task",
    content: "x",
    status: "active",
  });

  const file = await readMd(projectRoot, ref.path);
  assert.equal(file.data.status, "active");
  assert.equal(ref.status, "active");
});
