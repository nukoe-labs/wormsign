#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatJson, formatSarif, formatText, isWormSign, scan, scanDirectory } from "./index.js";
/** The version printed in reports, kept equal to the one in package.json. */
export const VERSION = "1.0.0";
/** The exit code when no finding was found. */
export const EXIT_CLEAN = 0;
/** The exit code when at least one worm sign (critical or high) was found; notes to review alone keep 0. */
export const EXIT_FINDINGS = 1;
/** The exit code when the scan could not run. */
export const EXIT_ERROR = 2;
const USAGE = `Usage: wormsign <owner | owner/repo> [--json | --sarif] [--max-branches <n>]
       wormsign --path <folder> [--json | --sarif]

Scans GitHub repositories for agent worms (Miasma, Mini Shai-Hulud) through the API only:
nothing is cloned, nothing is run. Set GITHUB_TOKEN (for example: GITHUB_TOKEN=$(gh auth token)).
With --path, reads the agent configuration files of a local folder instead, before an agent opens it.`;
/** Reads the value of --max-branches and checks that it is a positive whole number. */
function readMaxBranches(value) {
    const maxBranches = Number(value);
    if (!Number.isInteger(maxBranches) || maxBranches < 1) {
        throw new RangeError("--max-branches needs a whole number of at least 1.");
    }
    return maxBranches;
}
/** Reads the value of --path and checks that a folder was given. */
function readPath(value) {
    if (value === undefined || value === "") {
        throw new RangeError("--path needs a folder.");
    }
    return value;
}
/** Reads the command line arguments, or throws a RangeError with the usage when they are wrong. */
export function parseArguments(argumentsList) {
    const commandLine = { target: "", format: "text" };
    for (let index = 0; index < argumentsList.length; index += 1) {
        const argument = argumentsList[index];
        if (argument === "--help" || argument === "-h") {
            return { target: "", format: "text", show: "help" };
        }
        else if (argument === "--version" || argument === "-V") {
            return { target: "", format: "text", show: "version" };
        }
        else if (argument === "--json" || argument === "--sarif") {
            commandLine.format = argument === "--json" ? "json" : "sarif";
        }
        else if (argument === "--max-branches") {
            index += 1;
            commandLine.maxBranches = readMaxBranches(argumentsList[index]);
        }
        else if (argument === "--path") {
            index += 1;
            commandLine.path = readPath(argumentsList[index]);
        }
        else if (commandLine.target === "" && argument !== undefined && !argument.startsWith("-")) {
            commandLine.target = argument;
        }
        else if (String(argument).startsWith("-")) {
            throw new RangeError(`Unknown option "${argument}".\n${USAGE}`);
        }
        else {
            throw new RangeError(`Only one target is scanned at a time, but "${argument}" comes after "${commandLine.target}".\n${USAGE}`);
        }
    }
    const hasOneTarget = (commandLine.target === "") !== (commandLine.path === undefined);
    if (!hasOneTarget) {
        throw new RangeError(USAGE);
    }
    return commandLine;
}
/** Writes the scan result in the format chosen on the command line. */
export function formatResult(result, format, useColor = false) {
    if (format === "json") {
        return formatJson(result.findings);
    }
    if (format === "sarif") {
        return formatSarif(result.findings, VERSION);
    }
    return formatText(result.findings, result.scannedRepositories, useColor);
}
/** Builds the scan options from the command line and the token found in the environment. */
export function buildScanOptions(commandLine, environment) {
    const options = {};
    const token = environment.GITHUB_TOKEN ?? environment.GH_TOKEN;
    if (token !== undefined) {
        options.token = token;
    }
    if (commandLine.maxBranches !== undefined) {
        options.maxBranches = commandLine.maxBranches;
    }
    return options;
}
/** Scans the local folder given with --path, or the GitHub owner or repository given as target. */
async function scanTarget(commandLine, environment) {
    if (commandLine.path !== undefined) {
        const findings = await scanDirectory(commandLine.path);
        return { findings, scannedRepositories: 1 };
    }
    const options = buildScanOptions(commandLine, environment);
    return scan(commandLine.target, options);
}
/** Runs the command and returns its exit code; errors are written, never thrown. */
export async function run(argumentsList, environment, output) {
    try {
        const commandLine = parseArguments(argumentsList);
        if (commandLine.show !== undefined) {
            output.write(commandLine.show === "help" ? USAGE : `wormsign ${VERSION}`);
            return EXIT_CLEAN;
        }
        const result = await scanTarget(commandLine, environment);
        output.write(formatResult(result, commandLine.format, output.useColor === true));
        const hasWormSign = result.findings.some(isWormSign);
        return hasWormSign ? EXIT_FINDINGS : EXIT_CLEAN;
    }
    catch (error) {
        output.error(error instanceof Error ? error.message : String(error));
        return EXIT_ERROR;
    }
}
/** Writes a text to the standard output. */
function writeToStandardOutput(text) {
    process.stdout.write(`${text}\n`);
}
/** Writes a text to the standard error. */
function writeToStandardError(text) {
    process.stderr.write(`${text}\n`);
}
/** Tells whether this file is the one started by node, and not a file imported by a test. */
export function isMainModule(moduleUrl, startedFile) {
    if (startedFile === undefined) {
        return false;
    }
    return realpathSync(startedFile) === fileURLToPath(moduleUrl);
}
/** Tells whether to color the report: only on a terminal, and never when NO_COLOR is set (https://no-color.org). */
export function shouldUseColor(isTerminal, environment) {
    const colorIsRefused = environment.NO_COLOR !== undefined && environment.NO_COLOR !== "";
    return isTerminal === true && !colorIsRefused;
}
/** Starts the command with the real arguments, environment and streams, and sets the exit code. */
export async function main() {
    const useColor = shouldUseColor(process.stdout.isTTY, process.env);
    const output = { write: writeToStandardOutput, error: writeToStandardError, useColor };
    process.exitCode = await run(process.argv.slice(2), process.env, output);
}
if (isMainModule(import.meta.url, process.argv[1])) {
    await main();
}
