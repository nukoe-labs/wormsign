import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { HOOK_FILES, INSTRUCTION_FILES, MCP_FILES, MCP_TOML_FILES, TASKS_FILE } from "./rules.js";
import { checkFileText, createUnreadFileFinding } from "./scanner.js";
/** The branch name written in findings that come from a local folder, which has no branch. */
export const LOCAL_BRANCH = "working tree";
/** The largest file read, so that a huge file planted in the folder cannot exhaust the memory. */
export const LARGEST_LOCAL_FILE_BYTES = 1_000_000;
/** The folder where Cursor reads its rule files. */
const CURSOR_RULES_FOLDER = ".cursor/rules";
/** Lists the paths, relative to the folder, of every agent configuration and instruction file that the rules read. */
function listFixedPaths() {
    const allPaths = new Set([...HOOK_FILES, ...MCP_FILES, ...MCP_TOML_FILES, TASKS_FILE, ...INSTRUCTION_FILES]);
    return [...allPaths];
}
/**
 * Reads a file as text when it is a regular file of a reasonable size, reached without any symbolic link,
 * and returns undefined otherwise.
 */
async function readRegularFile(fullPath) {
    try {
        const realPath = await realpath(fullPath);
        const information = await lstat(fullPath);
        const isReachedWithoutLink = realPath === fullPath;
        const isReadable = isReachedWithoutLink && information.isFile() && information.size <= LARGEST_LOCAL_FILE_BYTES;
        if (!isReadable) {
            return undefined;
        }
        return await readFile(fullPath, "utf8");
    }
    catch {
        return undefined;
    }
}
/** Returns the size of a regular file that is larger than the reading limit, and undefined for any other file or a missing one. */
async function findOversizedFileSize(fullPath) {
    const information = await lstat(fullPath).catch(returnUndefined);
    const isOversized = information?.isFile() === true && information.size > LARGEST_LOCAL_FILE_BYTES;
    return isOversized ? information.size : undefined;
}
/** How many folders deep below .cursor/rules the walk goes, so that a planted tree cannot keep it busy. */
export const DEEPEST_RULE_FOLDER = 8;
/** How many entries of .cursor/rules the walk reads at most. */
export const MOST_RULE_ENTRIES = 1000;
/** Lists the Cursor rule files of the folder, in the rules folder and in the folders below it, never through a link. */
async function listCursorRulePaths(folder) {
    const found = [];
    await walkRuleFolder(folder, CURSOR_RULES_FOLDER, 0, { found, entriesLeft: MOST_RULE_ENTRIES });
    return found;
}
/** Adds the files below one rules folder to the walk, and goes into its sub-folders up to the depth and entry limits. */
async function walkRuleFolder(folder, relativePath, depth, walk) {
    const entries = await readdir(join(folder, relativePath), { withFileTypes: true }).catch(returnNothing);
    entries.sort(compareNames);
    for (const entry of entries) {
        if (walk.entriesLeft === 0) {
            return;
        }
        walk.entriesLeft -= 1;
        const entryPath = `${relativePath}/${entry.name}`;
        if (entry.isDirectory() && depth < DEEPEST_RULE_FOLDER) {
            await walkRuleFolder(folder, entryPath, depth + 1, walk);
        }
        else if (!entry.isDirectory()) {
            walk.found.push(entryPath);
        }
    }
}
/** Orders two folder entries by name, so that the walk and its limit do not depend on the file system. */
function compareNames(left, right) {
    return left.name.localeCompare(right.name, "en");
}
/** Returns no entries, used when the rules folder does not exist or cannot be read. */
function returnNothing() {
    return [];
}
/** Checks that the folder exists and is a real folder, and returns its absolute path without symbolic links. */
async function checkFolder(folder) {
    const absoluteFolder = resolve(folder);
    const information = await lstat(absoluteFolder).catch(returnUndefined);
    if (information?.isDirectory() !== true) {
        throw new RangeError(`"${folder}" is not a folder.`);
    }
    return realpath(absoluteFolder);
}
/** Returns undefined, used when a missing file is an expected case. */
function returnUndefined() {
    return undefined;
}
/**
 * Scans the agent configuration and instruction files of a local folder with the same file rules as the API scan.
 * Nothing is run, and symbolic links are never followed.
 */
export async function scanDirectory(folder) {
    const absoluteFolder = await checkFolder(folder);
    const cursorRulePaths = await listCursorRulePaths(absoluteFolder);
    const paths = [...listFixedPaths(), ...cursorRulePaths];
    const place = { repository: basename(absoluteFolder), branch: LOCAL_BRANCH };
    const findings = [];
    for (const path of paths) {
        const fullPath = join(absoluteFolder, path);
        const text = await readRegularFile(fullPath);
        if (text !== undefined) {
            findings.push(...checkFileText(path, text, place));
            continue;
        }
        const oversizedSize = await findOversizedFileSize(fullPath);
        if (oversizedSize !== undefined) {
            findings.push(createUnreadFileFinding(path, oversizedSize, place));
        }
    }
    return findings;
}
