import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import { globby } from "globby";
import matter from "gray-matter";

import {
  artifactDocumentSchema,
  artifactKindSchema,
  artifactRefSchema,
  artifactWriteInputSchema,
  type ArtifactDocument,
  type ArtifactKind,
  type ArtifactRef,
  type ArtifactWriteInput,
} from "../contracts/artifact-schema.ts";
import { currentAppPath } from "./brand.ts";

const artifactPatterns: Partial<Record<ArtifactKind, string[]>> = {
  requirements: [currentAppPath("docs", "00-requirements.md")],
  plan: [currentAppPath("docs", "01-plan.md")],
  task: [currentAppPath("docs", "tasks", "*.md")],
  summary: [currentAppPath("docs", "summaries", "*.md")],
  finding: [currentAppPath("docs", "findings.md")],
};

const knownKinds: ArtifactKind[] = [
  "requirements",
  "plan",
  "task",
  "summary",
  "finding",
];

function normalizeRelativePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function titleFromPath(path: string): string {
  const fileName = basename(path);
  return fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
}

function parseArtifactFile(content: string): {
  content: string;
  metadata: Record<string, unknown> | undefined;
  status: string | undefined;
} {
  const parsed = matter(content);
  const data = parsed.data as Record<string, unknown>;
  const status = typeof data.status === "string" ? data.status : undefined;
  const metadataEntries = Object.entries(data).filter(([key]) => key !== "status");
  const metadata =
    metadataEntries.length > 0 ? Object.fromEntries(metadataEntries) : undefined;

  return {
    content: parsed.content,
    metadata,
    status,
  };
}

function serializeArtifactFile(input: {
  content: string;
  status?: string;
  metadata?: Record<string, unknown>;
}): string {
  const data: Record<string, unknown> = {
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.metadata ?? {}),
  };

  if (Object.keys(data).length === 0) {
    return input.content;
  }

  return matter.stringify(input.content, data);
}

function classifyArtifactPath(path: string): ArtifactKind | null {
  const normalizedPath = normalizeRelativePath(path);
  const currentDocsRoot = currentAppPath("docs");

  if (normalizedPath === `${currentDocsRoot}/00-requirements.md`) {
    return "requirements";
  }

  if (normalizedPath === `${currentDocsRoot}/01-plan.md`) {
    return "plan";
  }

  if (normalizedPath === `${currentDocsRoot}/findings.md`) {
    return "finding";
  }

  if (
    normalizedPath.startsWith(`${currentDocsRoot}/tasks/`) &&
    normalizedPath.endsWith(".md")
  ) {
    return "task";
  }

  if (
    normalizedPath.startsWith(`${currentDocsRoot}/summaries/`) &&
    normalizedPath.endsWith(".md")
  ) {
    return "summary";
  }

  return null;
}

export class ArtifactStore {
  readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
  }

  async list(kind: ArtifactKind): Promise<ArtifactRef[]> {
    artifactKindSchema.parse(kind);

    const patterns = artifactPatterns[kind];

    if (!patterns) {
      return [];
    }

    const matches = await globby(patterns, {
      cwd: this.projectRoot,
      onlyFiles: true,
    });

    const refs = await Promise.all(matches.map((path) => this.createRef(path, kind)));

    return refs.sort((left, right) => left.path.localeCompare(right.path));
  }

  async read(id: string): Promise<ArtifactDocument> {
    const ref = await this.findRef(id);

    if (!ref) {
      throw new Error(`Unknown artifact: ${id}`);
    }

    const fileContent = await readFile(this.toAbsolutePath(ref.path), "utf8");
    const parsed = parseArtifactFile(fileContent);

    return artifactDocumentSchema.parse({
      ...ref,
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
      ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
      content: parsed.content,
    });
  }

  async write(input: ArtifactWriteInput): Promise<ArtifactRef> {
    const parsed = artifactWriteInputSchema.parse(input);
    const absolutePath = this.toAbsolutePath(parsed.path);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(
      absolutePath,
      serializeArtifactFile({
        content: parsed.content,
        ...(parsed.status !== undefined ? { status: parsed.status } : {}),
        ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
      }),
      "utf8",
    );

    return artifactRefSchema.parse({
      id: this.toArtifactId(parsed.path),
      kind: parsed.kind,
      path: normalizeRelativePath(parsed.path),
      title: parsed.title,
      status: parsed.status,
      ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
    });
  }

  private async findRef(id: string): Promise<ArtifactRef | null> {
    const normalizedId = normalizeRelativePath(id);
    const classifiedKind = classifyArtifactPath(normalizedId);

    if (classifiedKind) {
      const absolutePath = this.toAbsolutePath(normalizedId);

      try {
        const file = await stat(absolutePath);

        if (file.isFile()) {
          return this.createRef(normalizedId, classifiedKind);
        }
      } catch {
        return null;
      }
    }

    const artifacts = await this.listAll();

    return artifacts.find((artifact) => artifact.id === normalizedId || artifact.title === normalizedId) ?? null;
  }

  private async listAll(): Promise<ArtifactRef[]> {
    const allRefs = await Promise.all(knownKinds.map((kind) => this.list(kind)));
    return allRefs.flat();
  }

  private async createRef(path: string, kind: ArtifactKind): Promise<ArtifactRef> {
    const normalizedPath = normalizeRelativePath(path);
    const content = await readFile(this.toAbsolutePath(normalizedPath), "utf8");
    const parsed = parseArtifactFile(content);

    return artifactRefSchema.parse({
      id: this.toArtifactId(normalizedPath),
      kind,
      path: normalizedPath,
      title: titleFromPath(normalizedPath),
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
      ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
    });
  }

  private toArtifactId(path: string): string {
    return normalizeRelativePath(path);
  }

  private toAbsolutePath(path: string): string {
    const normalizedPath = normalizeRelativePath(path);

    if (isAbsolute(normalizedPath)) {
      throw new Error(`Artifact paths must be project-relative: ${path}`);
    }

    const absolutePath = resolve(this.projectRoot, normalizedPath);
    const relativePath = relative(this.projectRoot, absolutePath);

    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error(`Artifact path escapes project root: ${path}`);
    }

    return absolutePath;
  }
}
