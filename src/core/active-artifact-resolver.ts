import { activeArtifactSetSchema, type ActiveArtifactSet, type ArtifactRef } from "../contracts/artifact-schema.ts";
import { ArtifactStore } from "./artifact-store.ts";

export type ResolveActiveArtifactsInput = {
  activeTaskId?: string;
};

function deriveTaskKey(taskId: string): string {
  const parts = taskId.split("-");

  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`;
  }

  return taskId;
}

function pickLatestSummary(summaries: ArtifactRef[], activeTaskId: string | undefined): ArtifactRef | undefined {
  if (summaries.length === 0) {
    return undefined;
  }

  if (!activeTaskId) {
    return summaries.at(-1);
  }

  const taskKey = deriveTaskKey(activeTaskId);
  const relevantSummaries = summaries.filter(
    (summary) =>
      summary.metadata?.taskId === activeTaskId ||
      summary.title === taskKey ||
      summary.title.startsWith(`${taskKey}-`),
  );

  const sortValue = (summary: ArtifactRef): string =>
    typeof summary.metadata?.updatedAt === "string" ? summary.metadata.updatedAt : summary.path;

  return (relevantSummaries.length > 0 ? relevantSummaries : summaries)
    .slice()
    .sort((left, right) => sortValue(left).localeCompare(sortValue(right)))
    .at(-1);
}

export class ActiveArtifactResolver {
  private readonly store: ArtifactStore;

  constructor(store: ArtifactStore) {
    this.store = store;
  }

  async resolve(input: ResolveActiveArtifactsInput): Promise<ActiveArtifactSet> {
    const [requirements, plans, tasks, summaries, findings] = await Promise.all([
      this.store.list("requirements"),
      this.store.list("plan"),
      this.store.list("task"),
      this.store.list("summary"),
      this.store.list("finding"),
    ]);

    const activeTask = input.activeTaskId
      ? tasks.find((task) => task.title === input.activeTaskId || task.id === input.activeTaskId)
      : undefined;

    const required: ArtifactRef[] = [];

    if (requirements[0]) {
      required.push(requirements[0]);
    }

    if (plans[0]) {
      required.push(plans[0]);
    }

    if (activeTask) {
      required.push(activeTask);
    }

    const latestSummary = pickLatestSummary(summaries, input.activeTaskId);

    return activeArtifactSetSchema.parse({
      required,
      optional: latestSummary ? [latestSummary] : [],
      onDemand: findings,
    });
  }
}
