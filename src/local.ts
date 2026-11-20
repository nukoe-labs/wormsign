import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { HOOK_FILES, INSTRUCTION_FILES, MCP_FILES, MCP_TOML_FILES, TASKS_FILE } from "./rules.js";
import { checkFileText } from "./scanner.js";
import type { Finding } from "./types.js";

/** The branch name written in findings that come from a local folder, which has no branch. */
export const LOCAL_BRANCH = "working tree";

/** The largest file read, so that a huge file planted in the folder cannot exhaust the memory. */
export const LARGEST_LOCAL_FILE_BYTES = 1_000_000;

/** The folder where Cursor reads its rule files. */
const CURSOR_RULES_FOLDER = ".cursor/rules";

/** Lists the paths, relative to the folder, of every agent configuration and instruction file that the rules read. */
function listFixedPaths(): string[] {
  const allPaths = new Set<string>([...HOOK_FILES, ...MCP_FILES, ...MCP_TOML_FILES, TASKS_FILE, ...INSTRUCTION_FILES]);
  return [...allPaths];
}

/**
 * Reads a file as text when it is a regular file of a reasonable size, reached without any symbolic link,
 * and returns undefined otherwise.
 */
async function readRegularFile(fullPath: string): Promise<string | undefined> {
  try {
    const realPath = await realpath(fullPath);
    const information = await lstat(fullPath);
    const isReachedWithoutLink = realPath === fullPath;
    const isReadable = isReachedWithoutLink && information.isFile() && information.size <= LARGEST_LOCAL_FILE_BYTES;
    if (!isReadable) {
      return undefined;
    }
    return await readFile(fullPath, "utf8");
  } catch {
    return undefined;
  }
}

/** Lists the Cursor rule files of the folder, or nothing when the rules folder does not exist. */
async function listCursorRulePaths(folder: string): Promise<string[]> {
  try {
    const names = await readdir(join(folder, CURSOR_RULES_FOLDER));
    return names.map(prefixWithCursorRulesFolder);
  } catch {
    return [];
  }
}

/** Writes the path of one Cursor rule file relative to the scanned folder. */
function prefixWithCursorRulesFolder(name: string): string {
  return `${CURSOR_RULES_FOLDER}/${name}`;
}

/** Checks that the folder exists and is a real folder, and returns its absolute path without symbolic links. */
async function checkFolder(folder: string): Promise<string> {
  const absoluteFolder = resolve(folder);
  const information = await lstat(absoluteFolder).catch(returnUndefined);
  if (information?.isDirectory() !== true) {
    throw new RangeError(`"${folder}" is not a folder.`);
  }
  return realpath(absoluteFolder);
}

/** Returns undefined, used when a missing file is an expected case. */
function returnUndefined(): undefined {
  return undefined;
}

/**
 * Scans the agent configuration and instruction files of a local folder with the same file rules as the API scan.
 * Nothing is run, and symbolic links are never followed.
 */
export async function scanDirectory(folder: string): Promise<Finding[]> {
  const absoluteFolder = await checkFolder(folder);
  const cursorRulePaths = await listCursorRulePaths(absoluteFolder);
  const paths = [...listFixedPaths(), ...cursorRulePaths];
  const place = { repository: basename(absoluteFolder), branch: LOCAL_BRANCH };
  const findings: Finding[] = [];
  for (const path of paths) {
    const text = await readRegularFile(join(absoluteFolder, path));
    if (text === undefined) {
      continue;
    }
    findings.push(...checkFileText(path, text, place));
  }
  return findings;
}
