import type { Finding } from "./types.js";
/** The branch name written in findings that come from a local folder, which has no branch. */
export declare const LOCAL_BRANCH = "working tree";
/** The largest file read, so that a huge file planted in the folder cannot exhaust the memory. */
export declare const LARGEST_LOCAL_FILE_BYTES = 1000000;
/** How many folders deep below .cursor/rules the walk goes, so that a planted tree cannot keep it busy. */
export declare const DEEPEST_RULE_FOLDER = 8;
/** How many entries of .cursor/rules the walk reads at most. */
export declare const MOST_RULE_ENTRIES = 1000;
/**
 * Scans the agent configuration and instruction files of a local folder with the same file rules as the API scan.
 * Nothing is run, and symbolic links are never followed.
 */
export declare function scanDirectory(folder: string): Promise<Finding[]>;
