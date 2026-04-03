import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { globby } from "globby";

import { sessionSnapshotSchema, type SessionSnapshot } from "../contracts/session-snapshot-schema.ts";
import { currentAppPath } from "../core/brand.ts";

const snapshotDirectory = currentAppPath("state", "snapshots");

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

    await this.pruneOldSnapshots(3);

    return parsed;
  }

  private async pruneOldSnapshots(maxCount: number): Promise<void> {
    const all = await this.list();

    if (all.length <= maxCount) {
      return;
    }

    const { unlink } = await import("node:fs/promises");
    const toDelete = all.slice(0, all.length - maxCount);
    await Promise.all(
      toDelete.map((s) => unlink(this.toSnapshotPath(s.id))),
    );
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
    const results = await Promise.all(
      snapshotPaths.map((path) =>
        this.load(basename(path, ".json")).catch(() => null),
      ),
    );
    const snapshots = results.filter((s): s is SessionSnapshot => s !== null);

    return snapshots
      .filter((snapshot) => !sessionId || snapshot.sessionId === sessionId)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  }

  async findLatest(sessionId?: string): Promise<SessionSnapshot | null> {
    const snapshots = await this.list(sessionId);
    return snapshots.at(-1) ?? null;
  }

  private toSnapshotPath(id: string, directory = snapshotDirectory): string {
    const snapshotId = ensureValidSnapshotId(id);
    return join(this.projectRoot, directory, `${snapshotId}.json`);
  }
}
