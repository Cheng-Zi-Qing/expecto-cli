import { execa } from "execa";

export type GitBranchResolution = {
  label: string;
  detail: string;
};

type GitCommandResult = {
  args: string[];
  exitCode: number;
  stdout: string;
};

async function runGit(projectRoot: string, args: string[]): Promise<GitCommandResult> {
  try {
    const result = await execa("git", args, {
      cwd: projectRoot,
      reject: false,
    });

    return {
      args,
      exitCode: result.exitCode ?? 1,
      stdout: result.stdout.trim(),
    };
  } catch {
    return {
      args,
      exitCode: 1,
      stdout: "",
    };
  }
}

function formatDetail(results: GitCommandResult[]): string {
  return results
    .map((result) => {
      const output = result.stdout.length > 0
        ? result.stdout
        : result.exitCode === 0
          ? "<empty>"
          : `<exit ${result.exitCode}>`;
      return `$ git ${result.args.join(" ")}\n${output}`;
    })
    .join("\n");
}

function formatResolvedDetail(results: GitCommandResult[], label: string): string {
  return `${formatDetail(results)}\nresolved: ${label}`;
}

export async function resolveGitBranch(projectRoot: string): Promise<GitBranchResolution> {
  const branchResult = await runGit(projectRoot, ["branch", "--show-current"]);

  if (branchResult.exitCode === 0 && branchResult.stdout.length > 0) {
    return {
      label: branchResult.stdout,
      detail: formatResolvedDetail([branchResult], branchResult.stdout),
    };
  }

  const headResult = await runGit(projectRoot, ["rev-parse", "--short", "HEAD"]);

  if (headResult.exitCode !== 0 || headResult.stdout.length === 0) {
    return {
      label: "no-git",
      detail: formatResolvedDetail([branchResult, headResult], "no-git"),
    };
  }

  const candidates = [
    { ref: "refs/heads/main", label: "main" },
    { ref: "refs/remotes/origin/main", label: "main" },
    { ref: "refs/heads/master", label: "master" },
    { ref: "refs/remotes/origin/master", label: "master" },
  ] as const;

  for (const candidate of candidates) {
    const candidateResult = await runGit(projectRoot, ["rev-parse", "--short", candidate.ref]);

    if (candidateResult.exitCode === 0 && candidateResult.stdout === headResult.stdout) {
      return {
        label: candidate.label,
        detail: formatResolvedDetail([branchResult, headResult, candidateResult], candidate.label),
      };
    }
  }

  return {
    label: `detached@${headResult.stdout}`,
    detail: formatResolvedDetail([branchResult, headResult], `detached@${headResult.stdout}`),
  };
}
