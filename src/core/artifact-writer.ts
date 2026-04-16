import { stat } from "node:fs/promises";
import { join, parse as parsePath } from "node:path";

import {
  type ArtifactKind,
  type ArtifactRef,
} from "../contracts/artifact-schema.ts";
import { ArtifactStore } from "./artifact-store.ts";
import { currentAppPath } from "./brand.ts";

// ---------- public input ----------

export type ArtifactWriteServiceInput = {
  kind: ArtifactKind;
  title: string;
  content: string;
  status?: string;
  metadata?: Record<string, unknown>;
};

export type ArtifactWriterOptions = {
  store?: ArtifactStore;
  clock?: () => Date;
};

// ---------- constants ----------

const SUPPORTED_KINDS: ArtifactKind[] = ["task", "summary"];
const SUPPORTED_SUBTYPES = ["task", "session", "compact", "resume_catch_up"] as const;
type SupportedSubtype = (typeof SUPPORTED_SUBTYPES)[number];

// Matches T-NNN or T-NNN-<slug-segments>. Rejects trailing dash, double dash,
// leading non-letter-digit, uppercase slug, missing digits, etc.
const TASK_ID_PATTERN = /^T-\d{3,}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

const DOCS_TASKS_ACTIVE = currentAppPath("docs", "tasks", "active");
const DOCS_SUMMARIES = currentAppPath("docs", "summaries");

// ---------- errors ----------

class ArtifactWriterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactWriterError";
  }
}

// ---------- slug + id helpers ----------

export function slugifyTitle(title: string): string {
  let s = title.normalize("NFKD");
  // strip combining marks
  s = s.replace(/\p{M}/gu, "");
  s = s.toLowerCase();
  // whitespace + common separators -> dash
  s = s.replace(/[\s_/\\]+/g, "-");
  // drop any remaining non [a-z0-9-]
  s = s.replace(/[^a-z0-9-]/g, "");
  // collapse consecutive dashes
  s = s.replace(/-+/g, "-");
  // trim leading/trailing dashes
  s = s.replace(/^-+|-+$/g, "");
  // truncate to 40 chars
  if (s.length > 40) {
    s = s.slice(0, 40);
  }
  // trim any trailing dash produced by the truncation
  s = s.replace(/^-+|-+$/g, "");
  return s.length === 0 ? "untitled" : s;
}

function padSerial(n: number): string {
  return n.toString().padStart(3, "0");
}

function parseTaskKey(taskId: string): string {
  // taskId already matched TASK_ID_PATTERN; extract the T-<digits> prefix.
  const match = taskId.match(/^T-\d+/);
  if (!match) {
    throw new ArtifactWriterError(`Internal error: unable to parse taskKey from ${taskId}`);
  }
  return match[0];
}

function shortSessionId(sessionId: string): string {
  if (sessionId.length === 0) {
    throw new ArtifactWriterError("sessionId must be a non-empty string");
  }
  return sessionId.slice(0, 8);
}

function formatDateYMD(date: Date): string {
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ---------- filesystem helpers ----------

async function pathExists(absolute: string): Promise<boolean> {
  try {
    await stat(absolute);
    return true;
  } catch {
    return false;
  }
}

async function pickNonCollidingPath(
  projectRoot: string,
  relativePath: string,
): Promise<string> {
  if (!(await pathExists(join(projectRoot, relativePath)))) {
    return relativePath;
  }

  const parsed = parsePath(relativePath);
  let suffix = 2;
  while (true) {
    const candidateRelative = join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`);
    if (!(await pathExists(join(projectRoot, candidateRelative)))) {
      return candidateRelative;
    }
    suffix += 1;
  }
}

// ---------- metadata validators ----------

function requireSubtype(metadata: Record<string, unknown> | undefined): SupportedSubtype {
  const subtype = metadata?.artifact_subtype;
  if (typeof subtype !== "string") {
    throw new ArtifactWriterError(
      "summary requires metadata.artifact_subtype (one of task|session|compact|resume_catch_up)",
    );
  }
  if (!(SUPPORTED_SUBTYPES as readonly string[]).includes(subtype)) {
    throw new ArtifactWriterError(
      `summary has unsupported artifact_subtype: ${subtype}. Expected one of task|session|compact|resume_catch_up`,
    );
  }
  return subtype as SupportedSubtype;
}

function requireValidTaskId(metadata: Record<string, unknown> | undefined): string {
  const taskId = metadata?.taskId;
  if (typeof taskId !== "string" || taskId.length === 0) {
    throw new ArtifactWriterError(
      "summary(task) requires metadata.taskId (e.g. 'T-001-auth-flow' or 'T-001')",
    );
  }
  if (!TASK_ID_PATTERN.test(taskId)) {
    throw new ArtifactWriterError(
      `summary(task) metadata.taskId '${taskId}' does not match the expected format T-<NNN>[-<slug-segments>]`,
    );
  }
  return taskId;
}

function requireSessionId(metadata: Record<string, unknown> | undefined, subtype: string): string {
  const sessionId = metadata?.sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new ArtifactWriterError(
      `summary(${subtype}) requires metadata.sessionId`,
    );
  }
  return sessionId;
}

// ---------- task serial scan ----------

async function nextTaskSerial(store: ArtifactStore): Promise<number> {
  const refs = await store.list("task");
  let max = 0;
  for (const ref of refs) {
    const match = ref.title.match(/^T-(\d+)/);
    if (match && match[1]) {
      const n = Number.parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > max) {
        max = n;
      }
    }
  }
  return max + 1;
}

// ---------- public service ----------

export class ArtifactWriter {
  private readonly projectRoot: string;
  private readonly store: ArtifactStore;
  private readonly clock: () => Date;

  constructor(projectRoot: string, options: ArtifactWriterOptions = {}) {
    this.projectRoot = projectRoot;
    this.store = options.store ?? new ArtifactStore(projectRoot);
    this.clock = options.clock ?? (() => new Date());
  }

  async write(input: ArtifactWriteServiceInput): Promise<ArtifactRef> {
    if (!SUPPORTED_KINDS.includes(input.kind)) {
      throw new ArtifactWriterError(
        `kind=${input.kind} is not supported by ArtifactWriter. Supported: ${SUPPORTED_KINDS.join(", ")}`,
      );
    }

    if (input.kind === "task") {
      return this.writeTask(input);
    }

    return this.writeSummary(input);
  }

  private async writeTask(input: ArtifactWriteServiceInput): Promise<ArtifactRef> {
    if (input.metadata && "taskId" in input.metadata) {
      throw new ArtifactWriterError(
        "kind=task does not accept metadata.taskId — the writer derives the task serial",
      );
    }

    const serial = await nextTaskSerial(this.store);
    const slug = slugifyTitle(input.title);
    const taskTitle = `T-${padSerial(serial)}-${slug}`;
    const relativePath = `${DOCS_TASKS_ACTIVE}/${taskTitle}.md`;
    const finalPath = await pickNonCollidingPath(this.projectRoot, relativePath);

    return this.commitWrite({
      kind: "task",
      path: finalPath,
      title: taskTitle,
      content: input.content,
      ...(input.status !== undefined ? { status: input.status } : {}),
      baseMetadata: input.metadata,
    });
  }

  private async writeSummary(input: ArtifactWriteServiceInput): Promise<ArtifactRef> {
    const subtype = requireSubtype(input.metadata);
    const date = formatDateYMD(this.clock());

    let stem: string;
    if (subtype === "task") {
      const taskId = requireValidTaskId(input.metadata);
      const taskKey = parseTaskKey(taskId);
      stem = `${taskKey}-${date}`;
    } else {
      const sessionId = requireSessionId(input.metadata, subtype);
      const sid8 = shortSessionId(sessionId);
      const prefix = subtype === "resume_catch_up" ? "resume-catch-up" : subtype;
      stem = `${prefix}-${sid8}-${date}`;
    }

    const relativePath = `${DOCS_SUMMARIES}/${stem}.md`;
    const finalPath = await pickNonCollidingPath(this.projectRoot, relativePath);
    const finalTitle = parsePath(finalPath).name;

    return this.commitWrite({
      kind: "summary",
      path: finalPath,
      title: finalTitle,
      content: input.content,
      ...(input.status !== undefined ? { status: input.status } : {}),
      baseMetadata: input.metadata,
    });
  }

  private async commitWrite(params: {
    kind: ArtifactKind;
    path: string;
    title: string;
    content: string;
    status?: string;
    baseMetadata: Record<string, unknown> | undefined;
  }): Promise<ArtifactRef> {
    const updatedAt = this.clock().toISOString();
    const metadata: Record<string, unknown> = {
      ...(params.baseMetadata ?? {}),
      updatedAt,
    };

    return this.store.write({
      kind: params.kind,
      path: params.path,
      title: params.title,
      content: params.content,
      ...(params.status !== undefined ? { status: params.status } : {}),
      metadata,
    });
  }
}
