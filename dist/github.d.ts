import type { BranchInfo, CommitInfo, RepositoryInfo, ScanOptions, TreeEntry } from "./types.js";
/** The default longest wait, in seconds, for the rate limit to reset before giving up. */
export declare const DEFAULT_MAX_WAIT_SECONDS = 300;
/** The error thrown when the GitHub API refuses a request or cannot be reached. */
export declare class GitHubError extends Error {
    readonly status: number | undefined;
    /** Builds the error with its message and, when GitHub answered, its HTTP status. */
    constructor(message: string, status?: number);
}
/** A small read-only client for the GitHub REST API. */
export interface GitHubClient {
    getJson: <T>(path: string) => Promise<T>;
}
/** Returns how many milliseconds GitHub asks to wait before the next request, or undefined when it is not a rate limit. */
export declare function readWaitMilliseconds(response: Response, now: number): number | undefined;
/** Creates a client that reads the GitHub REST API with the given options, and waits when the rate limit is reached. */
export declare function createGitHubClient(options: ScanOptions): GitHubClient;
/** Lists every public repository of a user or an organization, page by page. */
export declare function listRepositories(client: GitHubClient, owner: string): Promise<RepositoryInfo[]>;
/** Reads one repository written owner/name. */
export declare function getRepository(client: GitHubClient, fullName: string): Promise<RepositoryInfo>;
/** Lists the branches of a repository, at most the given number, and always includes the default branch. */
export declare function listBranches(client: GitHubClient, fullName: string, maxBranches: number, defaultBranch?: string): Promise<BranchInfo[]>;
/** Reads the full file tree of a commit, without downloading any file; a tree that GitHub cannot find is empty. */
export declare function getTree(client: GitHubClient, fullName: string, sha: string): Promise<TreeEntry[]>;
/** Turns the base64 content sent by GitHub into text, the same way in Node.js and in a browser. */
export declare function decodeBase64Text(content: string): string;
/** Reads a small text file at a commit and returns its text, or undefined when the file is missing or is a symbolic link. */
export declare function getFileText(client: GitHubClient, fullName: string, path: string, sha: string): Promise<string | undefined>;
/** Reads one commit of a repository. */
export declare function getCommit(client: GitHubClient, fullName: string, sha: string): Promise<CommitInfo>;
