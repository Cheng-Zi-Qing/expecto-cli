import { loadTextDocuments, type LoadedTextDocument } from "../runtime/instruction-loader.ts";

export async function loadProjectMemoryDocuments(projectRoot: string): Promise<LoadedTextDocument[]> {
  return loadTextDocuments(projectRoot, [".beta-agent/memory/INDEX.md"]);
}
