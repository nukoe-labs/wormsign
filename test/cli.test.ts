import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildScanOptions, shouldUseColor, EXIT_CLEAN, EXIT_ERROR, EXIT_FINDINGS, formatResult, isMainModule, parseArguments, run, VERSION } from "../src/cli.js";
import { formatText, RESPONSE_STEPS } from "../src/report.js";
import type { Finding } from "../src/types.js";
import { createFakeFetch, encodeFile, WORM_SETTINGS } from "./fake-github.js";

const CLI_FILE = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

const HOOK_FINDING: Finding = {
  rule: "WS001",
  severity: "high",
  repository: "victim/infected",
  branch: "main",
  path: ".claude/settings.json",
  message: "Agent hook runs a command when the folder is opened.",
};

const DROP_FINDING: Finding = { rule: "WS008", severity: "critical", repository: "victim/drop", message: "Drop." };

/** Builds the fake API of one repository whose only file is the worm hook. */
function createHookAnswers(): Record<string, { body: unknown }> {
  const repository = { full_name: "victim/infected", name: "infected", description: null, default_branch: "main", pushed_at: "2026-11-08T15:10:13Z", archived: false };
  return {
    "/repos/victim/infected": { body: repository },
    "/repos/victim/infected/branches?per_page=20": { body: [{ name: "main", commit: { sha: "abc" } }] },
    "/repos/victim/infected/git/trees/abc?recursive=1": { body: { tree: [{ path: ".claude/settings.json", type: "blob", size: 342 }] } },
    "/repos/victim/infected/contents/.claude/settings.json?ref=abc": { body: encodeFile(WORM_SETTINGS) },
    "/repos/victim/infected/commits/abc": { body: { sha: "abc", commit: { message: "x", committer: { date: "2026-11-08T15:10:13Z" } } } },
  };
}

/** Builds an output that keeps what the command writes. */
function createRecordedOutput(): { written: string[]; errors: string[]; write: (text: string) => void; error: (text: string) => void } {
  const written: string[] = [];
  const errors: string[] = [];
  /** Keeps a text written to the standard output. */
  function write(text: string): void {
    written.push(text);
  }
  /** Keeps a text written to the standard error. */
  function error(text: string): void {
    errors.push(text);
  }
  return { written, errors, write, error };
}

/** Checks every accepted form of the command line. */
function readsTheCommandLine(): void {
  expect(parseArguments(["victim"])).toEqual({ target: "victim", format: "text" });
  expect(parseArguments(["--json", "victim/repo"])).toEqual({ target: "victim/repo", format: "json" });
  expect(parseArguments(["victim", "--sarif", "--max-branches", "5"])).toEqual({ target: "victim", format: "sarif", maxBranches: 5 });
}

/** Checks that wrong command lines are refused with the usage. */
function refusesWrongCommandLines(): void {
  expect(parseArguments.bind(undefined, [])).toThrow("Usage: wormsign");
  expect(parseArguments.bind(undefined, ["a", "b"])).toThrow("Usage: wormsign");
  expect(parseArguments.bind(undefined, ["--unknown"])).toThrow('Unknown option "--unknown".\nUsage: wormsign');
  expect(parseArguments.bind(undefined, ["a", "b"])).toThrow('Only one target is scanned at a time, but "b" comes after "a".');
  expect(parseArguments.bind(undefined, ["a", "--max-branches", "0"])).toThrow("--max-branches");
  expect(parseArguments.bind(undefined, ["a", "--max-branches"])).toThrow("--max-branches");
  expect(parseArguments.bind(undefined, ["--path"])).toThrow("--path needs a folder.");
  expect(parseArguments.bind(undefined, ["--path", "--json"])).toThrow("--path needs a folder.");
  expect(parseArguments.bind(undefined, ["--json", "--path", "--sarif"])).toThrow("--path needs a folder.");
}

/** Checks that the options with a value also accept the --name=value form, with the same checks on the value. */
function readsOptionsWrittenWithAnEqualSign(): void {
  expect(parseArguments(["--path=/tmp/project", "--json"])).toEqual({ target: "", format: "json", path: "/tmp/project" });
  expect(parseArguments(["octo", "--max-branches=5"])).toEqual({ target: "octo", format: "text", maxBranches: 5 });
  expect(parseArguments(["--path=./a=b"])).toEqual({ target: "", format: "text", path: "./a=b" });
  expect(parseArguments.bind(undefined, ["--path="])).toThrow("--path needs a folder.");
  expect(parseArguments.bind(undefined, ["--path=--json"])).toThrow("--path needs a folder.");
  expect(parseArguments.bind(undefined, ["a", "--max-branches=0"])).toThrow("--max-branches");
  expect(parseArguments.bind(undefined, ["a", "--max-branches="])).toThrow("--max-branches");
  expect(parseArguments.bind(undefined, ["a", "--json=1"])).toThrow('Unknown option "--json=1".');
  expect(parseArguments.bind(undefined, ["a=b"])).not.toThrow();
}

/** Checks that a folder named like an option is still reachable with a leading ./ . */
function readsAFolderWhoseNameStartsWithADash(): void {
  expect(parseArguments(["--path", "./-name", "--json"])).toEqual({ target: "", format: "json", path: "./-name" });
}

/** Checks that the token comes from GITHUB_TOKEN, then GH_TOKEN, and that nothing is set without one. */
function buildsScanOptionsFromTheEnvironment(): void {
  const commandLine = { target: "a", format: "text" as const, maxBranches: 3 };
  expect(buildScanOptions(commandLine, { GITHUB_TOKEN: "one", GH_TOKEN: "two" })).toEqual({ token: "one", maxBranches: 3 });
  expect(buildScanOptions({ target: "a", format: "text" }, { GH_TOKEN: "two" })).toEqual({ token: "two" });
  expect(buildScanOptions({ target: "a", format: "text" }, {})).toEqual({});
}

/** Checks the three output formats. */
function writesTheThreeFormats(): void {
  const result = { findings: [HOOK_FINDING, DROP_FINDING], scannedRepositories: 2 };
  const text = formatResult(result, "text");
  expect(text).toContain("[HIGH] WS001 victim/infected@main:.claude/settings.json");
  expect(text).toContain("[CRITICAL] WS008 victim/drop\n");
  expect(text).toContain(`1. ${RESPONSE_STEPS[0]}`);
  expect(JSON.parse(formatResult(result, "json"))).toEqual({ findings: [HOOK_FINDING, DROP_FINDING] });
  const sarif = JSON.parse(formatResult(result, "sarif"));
  expect(sarif.runs[0].tool.driver.version).toBe(VERSION);
  expect(sarif.runs[0].results[0]).toMatchObject({ ruleId: "WS001", level: "error" });
  expect(sarif.runs[0].results[1].locations[0].physicalLocation.artifactLocation.uri).toBe("victim/drop");
  expect(formatText([], 4)).toBe("wormsign: 0 of 4 repositories show worm signs (0 finding(s)).\nNo sign of an agent worm was found.");
}

/** Checks that a SARIF warning is written for a medium finding. */
function writesMediumFindingsAsWarnings(): void {
  const result = { findings: [{ ...DROP_FINDING, severity: "medium" as const }], scannedRepositories: 1 };
  const sarif = JSON.parse(formatResult(result, "sarif"));
  expect(sarif.runs[0].results[0].level).toBe("warning");
}

/** Checks that --help and --version print to the standard output and succeed, wherever they stand. */
async function printsHelpAndVersion(): Promise<void> {
  for (const [flag, expected] of [["--help", "Usage: wormsign"], ["-h", "Usage: wormsign"], ["--version", `wormsign ${VERSION}`], ["-V", `wormsign ${VERSION}`]] as const) {
    const output = createRecordedOutput();
    expect(await run([flag], {}, output)).toBe(EXIT_CLEAN);
    expect(output.written[0]).toContain(expected);
    expect(output.errors).toEqual([]);
  }
  const output = createRecordedOutput();
  expect(await run(["victim", "--json", "--help"], {}, output)).toBe(EXIT_CLEAN);
  expect(output.written[0]).toContain("Usage: wormsign");
  expect(await run(["--unknown"], {}, output)).toBe(EXIT_ERROR);
  expect(output.errors[0]).toContain('Unknown option "--unknown"');
}

/** Checks the exit codes of a scan with findings and of a scan that cannot run. */
async function returnsTheRightExitCodes(): Promise<void> {
  vi.stubGlobal("fetch", createFakeFetch(createHookAnswers()));
  const output = createRecordedOutput();
  expect(await run(["victim/infected", "--json"], {}, output)).toBe(EXIT_FINDINGS);
  expect(output.written[0]).toContain("WS001");
  expect(await run(["victim/missing"], {}, output)).toBe(EXIT_ERROR);
  expect(output.errors[0]).toBe("GitHub answered 404 for /repos/victim/missing.");
}

/** A fetch function that fails with a value that is not an error. */
async function failWithText(): Promise<Response> {
  throw "offline";
}

/** Checks the exit code of a clean scan and the message of a failure that is not an Error. */
async function reportsCleanScansAndOddFailures(): Promise<void> {
  const answers = createHookAnswers();
  answers["/repos/victim/infected/git/trees/abc?recursive=1"] = { body: { tree: [] } };
  vi.stubGlobal("fetch", createFakeFetch(answers));
  const output = createRecordedOutput();
  expect(await run(["victim/infected"], {}, output)).toBe(EXIT_CLEAN);
  vi.stubGlobal("fetch", failWithText);
  expect(await run(["victim/infected"], {}, output)).toBe(EXIT_ERROR);
  expect(output.errors[0]).toBe("GitHub cannot be reached: offline");
}

/** Checks that a thrown value which is not an Error is still written. */
async function writesNonErrorFailures(): Promise<void> {
  const output = createRecordedOutput();
  /** Throws a plain text, as some libraries do. */
  function throwText(): never {
    throw "plain failure";
  }
  const brokenOutput = { ...output, write: throwText };
  vi.stubGlobal("fetch", createFakeFetch(createHookAnswers()));
  expect(await run(["victim/infected"], {}, brokenOutput)).toBe(EXIT_ERROR);
  expect(output.errors).toEqual(["plain failure"]);
}

/** Checks that the main module is recognized only when node started this file. */
function recognizesTheMainModule(): void {
  const moduleUrl = new URL("../src/cli.ts", import.meta.url).href;
  expect(isMainModule(moduleUrl, CLI_FILE)).toBe(true);
  expect(isMainModule(moduleUrl, undefined)).toBe(false);
  expect(isMainModule(moduleUrl, fileURLToPath(import.meta.url))).toBe(false);
}

/** Checks that starting the file as a command writes to the real streams and sets the exit code. */
async function startsAsACommand(): Promise<void> {
  const standardOutput = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const standardError = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  vi.stubGlobal("fetch", createFakeFetch(createHookAnswers()));
  vi.stubGlobal("process", { ...process, argv: ["node", CLI_FILE, "victim/infected"], exitCode: undefined });
  vi.resetModules();
  const cli = await import("../src/cli.js");
  expect(process.exitCode).toBe(EXIT_FINDINGS);
  expect(standardOutput).toHaveBeenCalled();
  process.argv = ["node", CLI_FILE];
  await cli.main();
  expect(process.exitCode).toBe(EXIT_ERROR);
  expect(standardError).toHaveBeenCalled();
}

/** Restores the global objects replaced by a test. */
function restoreGlobals(): void {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}

/** Checks that colors are used only on a terminal and never with NO_COLOR. */
function usesColorOnlyOnATerminal(): void {
  expect(shouldUseColor(true, {})).toBe(true);
  expect(shouldUseColor(true, { NO_COLOR: "" })).toBe(true);
  expect(shouldUseColor(true, { NO_COLOR: "1" })).toBe(false);
  expect(shouldUseColor(undefined, {})).toBe(false);
}

/** Groups the tests of the command line. */
function describeCommandLine(): void {
  afterEach(restoreGlobals);
  it("reads the command line", readsTheCommandLine);
  it("refuses wrong command lines", refusesWrongCommandLines);
  it("reads a folder whose name starts with a dash", readsAFolderWhoseNameStartsWithADash);
  it("reads options written with an equal sign", readsOptionsWrittenWithAnEqualSign);
  it("builds scan options from the environment", buildsScanOptionsFromTheEnvironment);
  it("writes the three formats", writesTheThreeFormats);
  it("writes medium findings as warnings", writesMediumFindingsAsWarnings);
  it("prints the help and the version and succeeds", printsHelpAndVersion);
  it("returns the right exit codes", returnsTheRightExitCodes);
  it("reports clean scans and odd failures", reportsCleanScansAndOddFailures);
  it("writes failures that are not errors", writesNonErrorFailures);
  it("recognizes the main module", recognizesTheMainModule);
  it("starts as a command", startsAsACommand);
  it("uses color only on a terminal", usesColorOnlyOnATerminal);
}

describe("command line", describeCommandLine);
