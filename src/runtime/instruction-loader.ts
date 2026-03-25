import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type LoadedTextDocument = {
  path: string;
  content: string;
};

async function readOptionalTextDocument(
  projectRoot: string,
  relativePath: string,
): Promise<LoadedTextDocument | null> {
  try {
    const content = await readFile(join(projectRoot, relativePath), "utf8");

    return {
      path: relativePath,
      content,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function loadTextDocuments(
  projectRoot: string,
  relativePaths: string[],
): Promise<LoadedTextDocument[]> {
  const documents = await Promise.all(
    relativePaths.map((relativePath) => readOptionalTextDocument(projectRoot, relativePath)),
  );

  return documents.filter((document): document is LoadedTextDocument => document !== null);
}

export async function loadInstructionDocuments(projectRoot: string): Promise<LoadedTextDocument[]> {
  return loadTextDocuments(projectRoot, ["AGENTS.md"]);
}
