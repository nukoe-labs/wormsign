import { type GitHubClient } from "./github.js";
import type { Finding, RepositoryInfo } from "./types.js";
/** The default highest number of branches read per repository. */
export declare const DEFAULT_MAX_BRANCHES = 20;
/** The place in a repository where a finding was seen. */
interface Place {
    repository: string;
    branch: string;
    path?: string;
    commit?: string;
}
/** Builds the note for an agent file that was too large to be read, so that a skipped file never looks clean. */
export declare function createUnreadFileFinding(path: string, size: number, place: Place): Finding;
/** Checks the text of one configuration or instruction file and returns its findings. */
export declare function checkFileText(path: string, text: string, place: Place): Finding[];
/** Scans every branch of a repository once per head commit, at most the given number, and checks whether it is a worm drop. */
export declare function scanRepository(client: GitHubClient, repository: RepositoryInfo, maxBranches: number): Promise<Finding[]>;
export {};
