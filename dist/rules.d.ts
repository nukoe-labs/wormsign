import type { Severity, TreeEntry } from "./types.js";
/** The description of one detection rule. */
export interface Rule {
    id: string;
    severity: Severity;
    title: string;
}
/** Every rule of wormsign, with its stable identifier. */
export declare const RULES: {
    readonly agentHook: {
        readonly id: "WS001";
        readonly severity: "high";
        readonly title: "Agent hook starts a worm payload as soon as a session starts";
    };
    readonly folderOpenTask: {
        readonly id: "WS002";
        readonly severity: "high";
        readonly title: "Editor task starts a worm payload when the folder is opened";
    };
    readonly mcpServer: {
        readonly id: "WS003";
        readonly severity: "medium";
        readonly title: "Repository declares a local MCP server command";
    };
    readonly largeScript: {
        readonly id: "WS004";
        readonly severity: "high";
        readonly title: "Large script next to the agent configuration";
    };
    readonly invisibleUnicode: {
        readonly id: "WS005";
        readonly severity: "high";
        readonly title: "Invisible characters in an agent instruction file";
    };
    readonly agentInjection: {
        readonly id: "WS006";
        readonly severity: "medium";
        readonly title: "Instruction file tells the agent to skip checks";
    };
    readonly wormMarker: {
        readonly id: "WS007";
        readonly severity: "critical";
        readonly title: "Commit message carries a known worm marker";
    };
    readonly dropRepository: {
        readonly id: "WS008";
        readonly severity: "critical";
        readonly title: "Repository looks like a worm exfiltration drop";
    };
    readonly backdatedCommit: {
        readonly id: "WS009";
        readonly severity: "medium";
        readonly title: "Head commit is dated long before the last push";
    };
    readonly toolHook: {
        readonly id: "WS010";
        readonly severity: "medium";
        readonly title: "Agent hook runs a command";
    };
    readonly instructionMarker: {
        readonly id: "WS011";
        readonly severity: "critical";
        readonly title: "Instruction file carries a known worm marker";
    };
    readonly folderOpenCommand: {
        readonly id: "WS012";
        readonly severity: "medium";
        readonly title: "Editor task runs a command when the folder is opened";
    };
};
/** The smallest size, in bytes, of a script considered as a hidden payload. */
export declare const LARGE_SCRIPT_BYTES = 500000;
/** The number of days between a commit date and the last push above which the commit is called backdated. */
export declare const BACKDATED_DAYS = 30;
/** The files that an agent reads as instructions from the repository owner. */
export declare const INSTRUCTION_FILES: Set<string>;
/** The files where Claude Code, Gemini CLI and Cursor read hooks. */
export declare const HOOK_FILES: Set<string>;
/** The files where agents and editors read MCP servers. */
export declare const MCP_FILES: Set<string>;
/** The file where Codex CLI reads MCP servers, written in TOML rather than JSON. */
export declare const MCP_TOML_FILES: Set<string>;
/** The file where VS Code and its forks read tasks. */
export declare const TASKS_FILE = ".vscode/tasks.json";
/** Tells whether a path is an instruction file, at the root or as a Cursor rule. */
export declare function isInstructionFile(path: string): boolean;
/** Reads a JSON text and returns its value, or undefined when the text is not valid JSON. */
export declare function parseJson(text: string): unknown;
/** Collects every "command" string found anywhere inside a JSON value. */
export declare function collectCommands(value: unknown): string[];
/** The commands of the agent hooks, split between the start of a session and the other agent events. */
export interface HookCommands {
    sessionStart: string[];
    otherEvents: string[];
}
/** Returns the commands that agent hooks would run, from the text of a settings file, split by the moment they run. */
export declare function findHookCommands(settingsText: string): HookCommands;
/** Returns the labels of the VS Code tasks that run when the folder is opened. */
export declare function findFolderOpenTasks(tasksText: string): string[];
/** Returns the commands of the local MCP servers declared in a configuration file. */
export declare function findMcpCommands(configText: string): string[];
/**
 * Returns the commands of the local MCP servers declared in a Codex TOML file.
 * Every spelling of the same key counts: a dotted key, a quoted key, spaces around the dot, a
 * multi-line string, an inline table. Only a command key three levels deep under mcp_servers
 * counts, so the same key inside a sub-table such as [mcp_servers.<name>.env] is not mistaken
 * for one, and a table header broken over two lines credits nothing to the server above it.
 */
export declare function findMcpTomlCommands(text: string): string[];
/** Tells whether a text contains invisible or text-direction characters. */
export declare function hasInvisibleCharacters(text: string): boolean;
/** Returns the phrases of a text that tell an agent to skip confirmation or hide what it does. */
export declare function findInjectionPhrases(text: string): string[];
/** Tells whether a tree entry is a large script stored where agent payloads hide. */
export declare function isLargeScript(entry: TreeEntry): boolean;
/** Tells whether a command starts a worm payload: a setup or init script, or a downloaded script piped into a shell. */
export declare function isPayloadCommand(command: string): boolean;
/** Tells whether an instruction file carries a marker written by a known worm. */
export declare function hasInstructionMarker(text: string): boolean;
/** Tells whether a commit message carries a marker written by a known worm. */
export declare function hasWormMarker(message: string): boolean;
/** Tells whether a repository has the description, and when needed the name shape, of a worm exfiltration repository. */
export declare function isDropDescription(description: string | null, name?: string): boolean;
/** Returns how many whole days a commit date is older than the last push, or 0 when it is not older. */
export declare function daysBeforePush(commitDate: string, pushedAt: string): number;
