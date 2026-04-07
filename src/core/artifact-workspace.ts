import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { currentAppPath } from "./brand.ts";
import { ArtifactStore } from "./artifact-store.ts";

const docsRoot = currentAppPath("docs");

const baselineDocuments = {
  requirements: {
    kind: "requirements" as const,
    path: `${docsRoot}/00-requirements.md`,
    title: "00-requirements",
    content: "# Requirements\n",
  },
  plan: {
    kind: "plan" as const,
    path: `${docsRoot}/01-plan.md`,
    title: "01-plan",
    content: "# Plan\n",
  },
  finding: {
    kind: "finding" as const,
    path: `${docsRoot}/findings.md`,
    title: "findings",
    content: "# Findings\n",
  },
};

export type WorkspaceInitResult = {
  created: string[];
  existing: string[];
};

export class ArtifactWorkspace {
  readonly projectRoot: string;
  private readonly store: ArtifactStore;

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
    this.store = new ArtifactStore(this.projectRoot);
  }

  async ensureInitialized(): Promise<WorkspaceInitResult> {
    await Promise.all([
      mkdir(join(this.projectRoot, docsRoot, "tasks"), { recursive: true }),
      mkdir(join(this.projectRoot, docsRoot, "summaries"), { recursive: true }),
    ]);

    const results = await Promise.all([
      this.ensureDocument("requirements", baselineDocuments.requirements.content),
      this.ensureDocument("plan", baselineDocuments.plan.content),
      this.ensureDocument("finding", baselineDocuments.finding.content),
    ]);

    const created: string[] = [];
    const existing: string[] = [];

    for (const result of results) {
      if (result.created) {
        created.push(result.path);
      } else {
        existing.push(result.path);
      }
    }

    return { created, existing };
  }

  private async ensureDocument(
    kind: keyof typeof baselineDocuments,
    fallbackContent: string,
  ): Promise<{ path: string; created: boolean }> {
    const document = baselineDocuments[kind];
    try {
      await readFile(join(this.projectRoot, document.path), "utf8");
      return { path: document.path, created: false };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await this.store.write({
      kind: document.kind,
      path: document.path,
      title: document.title,
      content: fallbackContent,
    });

    return { path: document.path, created: true };
  }
}
