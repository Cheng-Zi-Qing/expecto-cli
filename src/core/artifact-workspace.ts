import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { ArtifactStore } from "./artifact-store.ts";

const docsRoot = ".beta-agent/docs";

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

export class ArtifactWorkspace {
  readonly projectRoot: string;
  private readonly store: ArtifactStore;

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
    this.store = new ArtifactStore(this.projectRoot);
  }

  async ensureInitialized(): Promise<void> {
    await Promise.all([
      mkdir(join(this.projectRoot, docsRoot, "tasks"), { recursive: true }),
      mkdir(join(this.projectRoot, docsRoot, "summaries"), { recursive: true }),
    ]);

    await this.ensureDocument("requirements", baselineDocuments.requirements.content);
    await this.ensureDocument("plan", baselineDocuments.plan.content);
    await this.ensureDocument("finding", baselineDocuments.finding.content);
  }

  async ensureDocument(
    kind: keyof typeof baselineDocuments,
    fallbackContent: string,
  ): Promise<void> {
    const document = baselineDocuments[kind];
    const absolutePath = join(this.projectRoot, document.path);

    try {
      await readFile(absolutePath, "utf8");
      return;
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
  }
}
