import type { BranchInfo, CommitInfo, FetchFunction, RepositoryInfo, ScanOptions, TreeEntry } from "./types.js";

const DEFAULT_API_URL = "https://api.github.com";
const PAGE_SIZE = 100;
const NOT_FOUND_STATUS = 404;
const LIMIT_STATUSES = new Set([403, 429]);
const LIMIT_HINT = " The rate limit may be reached: set GITHUB_TOKEN, for example GITHUB_TOKEN=$(gh auth token).";
const NO_TOKEN_HINT = " Without a token GitHub allows 60 requests per hour; with GITHUB_TOKEN=$(gh auth token) it allows 5,000.";
const MILLISECONDS_PER_SECOND = 1000;
/** The default longest wait, in seconds, for the rate limit to reset before giving up. */
export const DEFAULT_MAX_WAIT_SECONDS = 300;
const MAX_ATTEMPTS = 4;
/** The extra wait after the announced reset, because the clocks of GitHub and of the computer differ a little. */
const CLOCK_MARGIN_MILLISECONDS = 1000;

/** The error thrown when the GitHub API refuses a request or cannot be reached. */
export class GitHubError extends Error {
  readonly status: number | undefined;

  /** Builds the error with its message and, when GitHub answered, its HTTP status. */
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

/** A small read-only client for the GitHub REST API. */
export interface GitHubClient {
  getJson: <T>(path: string) => Promise<T>;
}

/** Builds the headers sent with every request, with the token when one is given. */
function buildHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "wormsign",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token !== undefined && token !== "") {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** Sends one GET request and returns the response, or throws a GitHubError when the network fails. */
async function sendRequest(fetchFunction: FetchFunction, url: string, headers: Record<string, string>): Promise<Response> {
  try {
    return await fetchFunction(url, { headers });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new GitHubError(`GitHub cannot be reached: ${reason}`);
  }
}

/** Tells the caller how many requests GitHub still allows, when GitHub sends the numbers. */
function reportRateLimit(response: Response, onRateLimit: ScanOptions["onRateLimit"]): void {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const limit = response.headers.get("x-ratelimit-limit");
  if (onRateLimit === undefined || remaining === null || limit === null) {
    return;
  }
  onRateLimit(Number(remaining), Number(limit));
}

/** Returns how many milliseconds GitHub asks to wait before the next request, or undefined when it is not a rate limit. */
export function readWaitMilliseconds(response: Response, now: number): number | undefined {
  if (!LIMIT_STATUSES.has(response.status)) {
    return undefined;
  }
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    return Number(retryAfter) * MILLISECONDS_PER_SECOND;
  }
  const reset = response.headers.get("x-ratelimit-reset");
  if (response.headers.get("x-ratelimit-remaining") !== "0" || reset === null) {
    return undefined;
  }
  return Math.max(0, Number(reset) * MILLISECONDS_PER_SECOND - now) + CLOCK_MARGIN_MILLISECONDS;
}

/** Waits for the given number of milliseconds. */
function sleep(milliseconds: number): Promise<void> {
  return new Promise<void>(function waitThenResolve(resolve: () => void): void {
    setTimeout(resolve, milliseconds);
  });
}

/** Builds the error of a refused request, with a hint on the rate limit when it may be the cause. */
function buildRefusalError(response: Response, path: string, hasToken: boolean): GitHubError {
  const isLimit = LIMIT_STATUSES.has(response.status);
  const hint = isLimit && !hasToken ? NO_TOKEN_HINT : "";
  const limitHint = isLimit && hasToken ? LIMIT_HINT : hint;
  return new GitHubError(`GitHub answered ${response.status} for ${path}.${limitHint}`, response.status);
}

/** Creates a client that reads the GitHub REST API with the given options, and waits when the rate limit is reached. */
export function createGitHubClient(options: ScanOptions): GitHubClient {
  const fetchFunction = options.fetch ?? globalThis.fetch;
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  const headers = buildHeaders(options.token);
  const hasToken = options.token !== undefined && options.token !== "";
  const maxWait = (options.maxWaitSeconds ?? DEFAULT_MAX_WAIT_SECONDS) * MILLISECONDS_PER_SECOND;
  const wait = options.sleep ?? sleep;

  /** Reads one API path and returns its JSON body, or throws a GitHubError with the HTTP status. */
  async function getJson<T>(path: string): Promise<T> {
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      const response = await sendRequest(fetchFunction, `${apiUrl}${path}`, headers);
      reportRateLimit(response, options.onRateLimit);
      if (response.ok) {
        return (await response.json()) as T;
      }
      const waitMilliseconds = readWaitMilliseconds(response, Date.now());
      if (waitMilliseconds === undefined || waitMilliseconds > maxWait) {
        throw buildRefusalError(response, path, hasToken);
      }
      options.onWait?.(Math.ceil(waitMilliseconds / MILLISECONDS_PER_SECOND));
      await wait(waitMilliseconds);
    }
    throw new GitHubError(`GitHub kept refusing ${path} after waiting three times for the rate limit.${LIMIT_HINT}`);
  }

  return { getJson };
}

/** Lists every public repository of a user or an organization, page by page. */
export async function listRepositories(client: GitHubClient, owner: string): Promise<RepositoryInfo[]> {
  const repositories: RepositoryInfo[] = [];
  let page = 1;
  let pageIsFull = true;
  while (pageIsFull) {
    const path = `/users/${encodeURIComponent(owner)}/repos?per_page=${PAGE_SIZE}&page=${page}&type=owner`;
    const pageOfRepositories = await client.getJson<RepositoryInfo[]>(path);
    repositories.push(...pageOfRepositories);
    pageIsFull = pageOfRepositories.length === PAGE_SIZE;
    page += 1;
  }
  return repositories;
}

/** Reads one repository written owner/name. */
export async function getRepository(client: GitHubClient, fullName: string): Promise<RepositoryInfo> {
  return client.getJson<RepositoryInfo>(`/repos/${fullName}`);
}

/** Lists the branches of a repository, at most the given number, and always includes the default branch. */
export async function listBranches(client: GitHubClient, fullName: string, maxBranches: number, defaultBranch?: string): Promise<BranchInfo[]> {
  const pageSize = Math.min(maxBranches, PAGE_SIZE);
  const branches = await client.getJson<BranchInfo[]>(`/repos/${fullName}/branches?per_page=${pageSize}`);
  const firstBranches = branches.slice(0, maxBranches);
  const repositoryIsEmpty = firstBranches.length === 0;
  const defaultBranchIsListed = defaultBranch === undefined || repositoryIsEmpty || firstBranches.some(hasName, defaultBranch);
  if (defaultBranchIsListed) {
    return firstBranches;
  }
  const defaultHead = await client.getJson<BranchInfo>(`/repos/${fullName}/branches/${encodeURIComponent(defaultBranch)}`);
  return [defaultHead, ...firstBranches.slice(0, maxBranches - 1)];
}

/** Tells whether a branch has the name given as this. */
function hasName(this: string, branch: BranchInfo): boolean {
  return branch.name === this;
}

/** Reads the full file tree of a commit, without downloading any file; a tree that GitHub cannot find is empty. */
export async function getTree(client: GitHubClient, fullName: string, sha: string): Promise<TreeEntry[]> {
  try {
    const tree = await client.getJson<{ tree: TreeEntry[] }>(`/repos/${fullName}/git/trees/${sha}?recursive=1`);
    return tree.tree;
  } catch (error) {
    const treeIsMissing = error instanceof GitHubError && error.status === NOT_FOUND_STATUS;
    if (treeIsMissing) {
      return [];
    }
    throw error;
  }
}

/** Turns the base64 content sent by GitHub into text, the same way in Node.js and in a browser. */
export function decodeBase64Text(content: string): string {
  const binary = atob(content.replace(/\s/gu, ""));
  const bytes = Uint8Array.from(binary, readCharacterCode);
  return new TextDecoder().decode(bytes);
}

/** Returns the code of one character of a binary string, which is the value of one byte. */
function readCharacterCode(character: string): number {
  return character.charCodeAt(0);
}

/** Reads a small text file at a commit and returns its text, or undefined when the file is missing or is a symbolic link. */
export async function getFileText(client: GitHubClient, fullName: string, path: string, sha: string): Promise<string | undefined> {
  try {
    const file = await client.getJson<{ content?: string }>(`/repos/${fullName}/contents/${encodeURI(path)}?ref=${sha}`);
    if (typeof file.content !== "string") {
      return undefined;
    }
    return decodeBase64Text(file.content);
  } catch (error) {
    const fileIsMissing = error instanceof GitHubError && error.status === NOT_FOUND_STATUS;
    if (fileIsMissing) {
      return undefined;
    }
    throw error;
  }
}

/** Reads one commit of a repository. */
export async function getCommit(client: GitHubClient, fullName: string, sha: string): Promise<CommitInfo> {
  return client.getJson<CommitInfo>(`/repos/${fullName}/commits/${sha}`);
}
