#!/usr/bin/env node
import type { ScanOptions, ScanResult } from "./index.js";
/** The version printed in reports, kept equal to the one in package.json. */
export declare const VERSION = "1.0.0";
/** The exit code when no finding was found. */
export declare const EXIT_CLEAN = 0;
/** The exit code when at least one worm sign (critical or high) was found; notes to review alone keep 0. */
export declare const EXIT_FINDINGS = 1;
/** The exit code when the scan could not run. */
export declare const EXIT_ERROR = 2;
/** The options read from the command line. */
export interface CommandLine {
    target: string;
    format: "text" | "json" | "sarif";
    maxBranches?: number;
    /** The local folder to scan instead of GitHub, given with --path. */
    path?: string;
}
/** Reads the command line arguments, or throws a RangeError with the usage when they are wrong. */
export declare function parseArguments(argumentsList: string[]): CommandLine;
/** Writes the scan result in the format chosen on the command line. */
export declare function formatResult(result: ScanResult, format: CommandLine["format"], useColor?: boolean): string;
/** The streams the command writes to, replaceable in tests. */
export interface Output {
    write: (text: string) => void;
    error: (text: string) => void;
    /** Tells whether the text report may use terminal colors. */
    useColor?: boolean;
}
/** Builds the scan options from the command line and the token found in the environment. */
export declare function buildScanOptions(commandLine: CommandLine, environment: NodeJS.ProcessEnv): ScanOptions;
/** Runs the command and returns its exit code; errors are written, never thrown. */
export declare function run(argumentsList: string[], environment: NodeJS.ProcessEnv, output: Output): Promise<number>;
/** Tells whether this file is the one started by node, and not a file imported by a test. */
export declare function isMainModule(moduleUrl: string, startedFile: string | undefined): boolean;
/** Tells whether to color the report: only on a terminal, and never when NO_COLOR is set (https://no-color.org). */
export declare function shouldUseColor(isTerminal: boolean | undefined, environment: NodeJS.ProcessEnv): boolean;
/** Starts the command with the real arguments, environment and streams, and sets the exit code. */
export declare function main(): Promise<void>;
