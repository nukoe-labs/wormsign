import { describe, expect, it, vi } from "vitest";
import { createGitHubClient, decodeBase64Text, getFileText, getTree, readWaitMilliseconds } from "../src/github.js";
import { scan } from "../src/index.js";
import { createFakeFetch } from "./fake-github.js";

const RESET_IN_TEN_SECONDS = { "x-ratelimit-remaining": "0", "x-ratelimit-limit": "60", "x-ratelimit-reset": "1010" };

/** Returns a fetch function that refuses the first request with the given headers, then answers. */
function createFetchThatRefusesOnce(headers: Record<string, string>, status = 403): (url: string) => Promise<Response> {
  let calls = 0;
  /** Refuses the first call, then answers with an empty list and the remaining requests. */
  async function fetchOnce(): Promise<Response> {
    calls += 1;
    if (calls === 1) {
      return new Response("{}", { status, headers });
    }
    return new Response("[]", { status: 200, headers: { "x-ratelimit-remaining": "59", "x-ratelimit-limit": "60" } });
  }
  return fetchOnce;
}

/** A wait function that returns at once, so that tests do not sleep. */
async function skipWait(): Promise<void> {
  return undefined;
}

/** Checks how long GitHub asks to wait, from retry-after or from the reset time. */
function readsTheWaitTime(): void {
  const now = 1_000_000;
  expect(readWaitMilliseconds(new Response("{}", { status: 429, headers: { "retry-after": "7" } }), now)).toBe(7000);
  expect(readWaitMilliseconds(new Response("{}", { status: 403, headers: RESET_IN_TEN_SECONDS }), now)).toBe(11_000);
  expect(readWaitMilliseconds(new Response("{}", { status: 403, headers: { ...RESET_IN_TEN_SECONDS, "x-ratelimit-reset": "1" } }), now)).toBe(1000);
  expect(readWaitMilliseconds(new Response("{}", { status: 403 }), now)).toBeUndefined();
  expect(readWaitMilliseconds(new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } }), now)).toBeUndefined();
  expect(readWaitMilliseconds(new Response("{}", { status: 500 }), now)).toBeUndefined();
}

/** Checks that the client waits for a short reset, tells the caller, and then retries. */
async function waitsThenRetries(): Promise<void> {
  const waits: number[] = [];
  const limits: number[] = [];
  /** Keeps the announced wait. */
  function recordWait(seconds: number): void {
    waits.push(seconds);
  }
  /** Keeps the remaining requests. */
  function recordLimit(remaining: number): void {
    limits.push(remaining);
  }
  const fetchFunction = createFetchThatRefusesOnce({ "retry-after": "2" }, 429);
  const client = createGitHubClient({ fetch: fetchFunction, sleep: skipWait, onWait: recordWait, onRateLimit: recordLimit });
  expect(await client.getJson("/users/a/repos")).toEqual([]);
  expect(waits).toEqual([2]);
  expect(limits).toEqual([59]);
}

/** Checks that a reset too far away stops the scan with a clear message, with or without a token. */
async function stopsWhenTheResetIsTooFar(): Promise<void> {
  vi.useFakeTimers({ now: 0 });
  const headers = { "x-ratelimit-remaining": "0", "x-ratelimit-limit": "60", "x-ratelimit-reset": "3600" };
  const withoutToken = createGitHubClient({ fetch: createFetchThatRefusesOnce(headers), sleep: skipWait });
  await expect(withoutToken.getJson("/x")).rejects.toThrow("Without a token GitHub allows 60 requests per hour");
  const withToken = createGitHubClient({ fetch: createFetchThatRefusesOnce(headers), sleep: skipWait, token: "t", maxWaitSeconds: 60 });
  await expect(withToken.getJson("/x")).rejects.toThrow("The rate limit may be reached");
  vi.useRealTimers();
}

/** Checks that the client gives up after waiting three times. */
async function givesUpAfterThreeWaits(): Promise<void> {
  const fetchFunction = createFakeFetch({ "/x": { status: 429, headers: { "retry-after": "1" } } });
  const client = createGitHubClient({ fetch: fetchFunction, sleep: skipWait });
  await expect(client.getJson("/x")).rejects.toThrow("GitHub kept refusing /x after waiting three times for the rate limit.");
}

/** Checks that the real wait function waits before the retry. */
async function waitsWithTheRealTimer(): Promise<void> {
  vi.useFakeTimers();
  const client = createGitHubClient({ fetch: createFetchThatRefusesOnce({ "retry-after": "1" }, 429) });
  const answer = client.getJson("/x");
  await vi.advanceTimersByTimeAsync(1000);
  expect(await answer).toEqual([]);
  vi.useRealTimers();
}

/** Checks that base64 text with line breaks and accents is decoded. */
function decodesBase64Text(): void {
  expect(decodeBase64Text("w6l0w6k=\n")).toBe("été");
}

/** Checks that a symbolic link, which the contents API returns without content, is skipped. */
async function skipsSymbolicLinks(): Promise<void> {
  const answers = { "/repos/o/r/contents/CLAUDE.md?ref=abc": { body: { type: "symlink", target: "AGENTS.md" } } };
  const client = createGitHubClient({ fetch: createFakeFetch(answers) });
  expect(await getFileText(client, "o/r", "CLAUDE.md", "abc")).toBeUndefined();
  expect(await getTree(client, "o/r", "missing")).toEqual([]);
  const failing = createGitHubClient({ fetch: createFakeFetch({ "/repos/o/r/git/trees/x?recursive=1": { status: 500 } }) });
  await expect(getTree(failing, "o/r", "x")).rejects.toThrow("GitHub answered 500");
}

/** Checks that the scan reports each repository before reading it. */
async function reportsProgress(): Promise<void> {
  const repositories = [{ full_name: "a/one", name: "one", description: null, default_branch: "main", pushed_at: "2026-01-01T00:00:00Z", archived: false }];
  const answers = { "/users/a/repos?per_page=100&page=1&type=owner": { body: repositories }, "/repos/a/one/branches?per_page=20": { body: [] } };
  const progress: string[] = [];
  /** Keeps the progress of the scan. */
  function recordProgress(fullName: string, position: number, total: number): void {
    progress.push(`${position}/${total} ${fullName}`);
  }
  await scan("a", { fetch: createFakeFetch(answers), onRepository: recordProgress });
  expect(progress).toEqual(["1/1 a/one"]);
}

/** Groups the tests of the rate limit and of the browser-ready helpers. */
function describeLimits(): void {
  it("reads the wait time", readsTheWaitTime);
  it("waits then retries", waitsThenRetries);
  it("stops when the reset is too far", stopsWhenTheResetIsTooFar);
  it("gives up after three waits", givesUpAfterThreeWaits);
  it("waits with the real timer", waitsWithTheRealTimer);
  it("decodes base64 text", decodesBase64Text);
  it("reports progress", reportsProgress);
  it("skips symbolic links", skipsSymbolicLinks);
}

describe("rate limit and progress", describeLimits);
