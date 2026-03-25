import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { globby } from "globby";

import { sessionSnapshotSchema, type SessionSnapshot } from "../contracts/session-snapshot-schema.ts";

const snapshotDirectory = ".beta-agent/state/snapshots";

function ensureValidSnapshotId(id: string): string {
  if (id.includes("/") || id.includes("\\")) {
    throw new Error(`Snapshot ids must not contain path separators: ${id}`);
  }

  return id;
}

export class SessionSnapshotStore {
  readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
  }

  async save(snapshot: SessionSnapshot): Promise<SessionSnapshot> {
    const parsed = sessionSnapshotSchema.parse(snapshot);

    await mkdir(join(this.projectRoot, snapshotDirectory), { recursive: true });
    await writeFile(
      this.toSnapshotPath(parsed.id),
      `${JSON.stringify(parsed, null, 2)}\n`,
      "utf8",
    );

    return parsed;
  }

  async load(id: string): Promise<SessionSnapshot> {
    const content = await readFile(this.toSnapshotPath(id), "utf8");
    return sessionSnapshotSchema.parse(JSON.parse(content));
  }

  async list(sessionId?: string): Promise<SessionSnapshot[]> {
    const snapshotPaths = await globby(`${snapshotDirectory}/*.json`, {
      cwd: this.projectRoot,
      onlyFiles: true,
    });
    const snapshots = await Promise.all(
      snapshotPaths.map((path) => this.load(basename(path, ".json"))),
    );

    return snapshots
      .filter((snapshot) => !sessionId || snapshot.sessionId === sessionId)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  }

  async findLatest(sessionId?: string): Promise<SessionSnapshot | null> {
    const snapshots = await this.list(sessionId);
    return snapshots.at(-1) ?? null;
  }

  private toSnapshotPath(id: string): string {
    const snapshotId = ensureValidSnapshotId(id);
    return join(this.projectRoot, snapshotDirectory, `${snapshotId}.json`);
  }
}
