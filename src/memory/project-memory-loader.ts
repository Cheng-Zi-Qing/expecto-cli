import { currentAppPath } from "../core/brand.ts";
import { loadTextDocuments, type LoadedTextDocument } from "../runtime/instruction-loader.ts";

export async function loadProjectMemoryDocuments(projectRoot: string): Promise<LoadedTextDocument[]> {
  return loadTextDocuments(projectRoot, [currentAppPath("memory", "INDEX.md")]);
}
