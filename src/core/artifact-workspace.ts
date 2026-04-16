import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { currentAppPath } from "./brand.ts";
import { ArtifactStore } from "./artifact-store.ts";

const docsRoot = currentAppPath("docs");

const INDEX_TEMPLATE = `# Project Workspace

## Current Goal

(describe what you're working on)

## Active Tasks

(tasks/active/ files listed here)

## Backlog

(tasks/backlog/ titles listed here)

## Directory

- \`specs/\` — project requirements and plan (read when you need architectural context)
- \`decisions/\` — decision records (read when tracing why a choice was made)
- \`summaries/\` — session and task summaries
- \`findings.md\` — research notes

## Strategy Notes

(recent direction changes, constraints, important decisions)
`;

const baselineDocuments = {
  requirements: {
    kind: "requirements" as const,
    path: `${docsRoot}/specs/00-requirements.md`,
    title: "00-requirements",
    content: "# Requirements\n",
  },
  plan: {
    kind: "plan" as const,
    path: `${docsRoot}/specs/01-plan.md`,
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

export type InitFileResult = {
  path: string;
  action: "created" | "exists";
};

export type InitResult = {
  files: InitFileResult[];
};

export class ArtifactWorkspace {
  readonly projectRoot: string;
  private readonly store: ArtifactStore;

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
    this.store = new ArtifactStore(this.projectRoot);
  }

  async ensureInitialized(): Promise<InitResult> {
    await Promise.all([
      mkdir(join(this.projectRoot, docsRoot, "specs"), { recursive: true }),
      mkdir(join(this.projectRoot, docsRoot, "tasks", "active"), { recursive: true }),
      mkdir(join(this.projectRoot, docsRoot, "tasks", "backlog"), { recursive: true }),
      mkdir(join(this.projectRoot, docsRoot, "decisions"), { recursive: true }),
      mkdir(join(this.projectRoot, docsRoot, "summaries"), { recursive: true }),
    ]);

    const results: InitFileResult[] = [];

    results.push(await this.ensureFile(
      join(docsRoot, "index.md"),
      INDEX_TEMPLATE,
    ));
    results.push(await this.ensureDocument("requirements", baselineDocuments.requirements.content));
    results.push(await this.ensureDocument("plan", baselineDocuments.plan.content));
    results.push(await this.ensureDocument("finding", baselineDocuments.finding.content));

    return { files: results };
  }

  private async ensureFile(
    relativePath: string,
    fallbackContent: string,
  ): Promise<InitFileResult> {
    const absolutePath = join(this.projectRoot, relativePath);
    try {
      await readFile(absolutePath, "utf8");
      return { path: relativePath, action: "exists" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await writeFile(absolutePath, fallbackContent, "utf8");
    return { path: relativePath, action: "created" };
  }

  private async ensureDocument(
    kind: keyof typeof baselineDocuments,
    fallbackContent: string,
  ): Promise<InitFileResult> {
    const document = baselineDocuments[kind];
    try {
      await readFile(join(this.projectRoot, document.path), "utf8");
      return { path: document.path, action: "exists" };
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
    return { path: document.path, action: "created" };
  }
}
