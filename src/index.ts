import { createGitHubClient, getRepository, listRepositories } from "./github.js";
import { DEFAULT_MAX_BRANCHES, scanRepository } from "./scanner.js";
import type { Finding, RepositoryInfo, ScanOptions } from "./types.js";

export { createGitHubClient, getRepository, GitHubError, listRepositories } from "./github.js";
export type { GitHubClient } from "./github.js";
export { DEFAULT_MAX_BRANCHES, scanRepository } from "./scanner.js";
export { RULES } from "./rules.js";
export { DEEPEST_RULE_FOLDER, LARGEST_LOCAL_FILE_BYTES, LOCAL_BRANCH, MOST_RULE_ENTRIES, scanDirectory } from "./local.js";
export { countAffectedRepositories, formatJson, formatMarkdown, formatSarif, formatSummary, formatText, isWormSign, RESPONSE_STEPS } from "./report.js";
export type { Finding, RepositoryInfo, ScanOptions, Severity } from "./types.js";

/** The result of a scan: the findings and how many repositories were read. */
export interface ScanResult {
  findings: Finding[];
  scannedRepositories: number;
}

const TARGET_PATTERN = /^[A-Za-z0-9-]+(?:\/[A-Za-z0-9._-]+)?$/u;

/** Checks that a target is a GitHub owner or an owner/name repository, and returns it trimmed. */
export function checkTarget(target: string): string {
  const trimmed = target.trim();
  if (!TARGET_PATTERN.test(trimmed)) {
    throw new RangeError(`"${target}" is not a GitHub owner or an owner/name repository.`);
  }
  return trimmed;
}

/** Tells whether a repository is not archived, since archived repositories cannot receive new pushes. */
function isActive(repository: RepositoryInfo): boolean {
  return !repository.archived;
}

/** Scans one repository (owner/name) or every active repository of a user or an organization, through the API only. */
export async function scan(target: string, options: ScanOptions = {}): Promise<ScanResult> {
  const checkedTarget = checkTarget(target);
  const client = createGitHubClient(options);
  const maxBranches = options.maxBranches ?? DEFAULT_MAX_BRANCHES;
  const repositories = await readTargetRepositories(client, checkedTarget);
  const findings: Finding[] = [];
  for (const [index, repository] of repositories.entries()) {
    options.onRepository?.(repository.full_name, index + 1, repositories.length);
    findings.push(...(await scanRepository(client, repository, maxBranches)));
  }
  return { findings, scannedRepositories: repositories.length };
}

/** Reads the repository named by the target, or the active repositories of the owner. */
async function readTargetRepositories(client: ReturnType<typeof createGitHubClient>, target: string): Promise<RepositoryInfo[]> {
  if (target.includes("/")) {
    return [await getRepository(client, target)];
  }
  const repositories = await listRepositories(client, target);
  return repositories.filter(isActive);
}
