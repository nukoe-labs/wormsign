import { COMMIT_MARKERS, DROP_DESCRIPTIONS, DROP_NAMES, INSTRUCTION_MARKERS, PAYLOAD_COMMANDS, INJECTION_PHRASES, PAYLOAD_FOLDER, SESSION_START_EVENTS, SETUP_SCRIPT } from "./signatures.js";
/** Every rule of wormsign, with its stable identifier. */
export const RULES = {
    agentHook: { id: "WS001", severity: "high", title: "Agent hook starts a worm payload as soon as a session starts" },
    folderOpenTask: { id: "WS002", severity: "high", title: "Editor task starts a worm payload when the folder is opened" },
    mcpServer: { id: "WS003", severity: "medium", title: "Repository declares a local MCP server command" },
    largeScript: { id: "WS004", severity: "high", title: "Large script next to the agent configuration" },
    invisibleUnicode: { id: "WS005", severity: "high", title: "Invisible characters in an agent instruction file" },
    agentInjection: { id: "WS006", severity: "medium", title: "Instruction file tells the agent to skip checks" },
    wormMarker: { id: "WS007", severity: "critical", title: "Commit message carries a known worm marker" },
    dropRepository: { id: "WS008", severity: "critical", title: "Repository looks like a worm exfiltration drop" },
    backdatedCommit: { id: "WS009", severity: "medium", title: "Head commit is dated long before the last push" },
    toolHook: { id: "WS010", severity: "medium", title: "Agent hook runs a command" },
    instructionMarker: { id: "WS011", severity: "critical", title: "Instruction file carries a known worm marker" },
    folderOpenCommand: { id: "WS012", severity: "medium", title: "Editor task runs a command when the folder is opened" },
    unreadFile: { id: "WS013", severity: "medium", title: "Agent file too large to be read" },
};
/** The smallest size, in bytes, of a script considered as a hidden payload. */
export const LARGE_SCRIPT_BYTES = 500_000;
/** The number of days between a commit date and the last push above which the commit is called backdated. */
export const BACKDATED_DAYS = 30;
const MILLISECONDS_PER_DAY = 86_400_000;
const SCRIPT_EXTENSION = /\.(?:c|m)?js$/u;
const INVISIBLE_CHARACTERS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]|[\u{E0000}-\u{E007F}]/u;
/** The files that an agent reads as instructions from the repository owner. */
export const INSTRUCTION_FILES = new Set([
    "CLAUDE.md",
    "AGENTS.md",
    "AGENT.md",
    "GEMINI.md",
    ".cursorrules",
    ".windsurfrules",
    ".clinerules",
    ".github/copilot-instructions.md",
]);
/** The files where Claude Code, Gemini CLI and Cursor read hooks. */
export const HOOK_FILES = new Set([".claude/settings.json", ".claude/settings.local.json", ".gemini/settings.json", ".cursor/hooks.json"]);
/** The files where agents and editors read MCP servers. */
export const MCP_FILES = new Set([".mcp.json", ".cursor/mcp.json", ".vscode/mcp.json", ".roo/mcp.json", ".gemini/settings.json"]);
/** The file where Codex CLI reads MCP servers, written in TOML rather than JSON. */
export const MCP_TOML_FILES = new Set([".codex/config.toml"]);
/** The file where VS Code and its forks read tasks. */
export const TASKS_FILE = ".vscode/tasks.json";
/** Tells whether a path is an instruction file, at the root or as a Cursor rule. */
export function isInstructionFile(path) {
    const isCursorRule = path.startsWith(".cursor/rules/");
    return INSTRUCTION_FILES.has(path) || isCursorRule;
}
/** Reads a JSON text and returns its value, or undefined when the text is not valid JSON. */
export function parseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
    }
}
/** Tells whether a value is a plain object that can be read by key. */
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Collects every "command" string found anywhere inside a JSON value. */
export function collectCommands(value) {
    if (typeof value === "string" || value === null || typeof value !== "object") {
        return [];
    }
    const commands = [];
    for (const [key, child] of Object.entries(value)) {
        if (key === "command" && typeof child === "string") {
            commands.push(child);
            continue;
        }
        commands.push(...collectCommands(child));
    }
    return commands;
}
/** Returns the commands that agent hooks would run, from the text of a settings file, split by the moment they run. */
export function findHookCommands(settingsText) {
    const hookCommands = { sessionStart: [], otherEvents: [] };
    const settings = parseJson(settingsText);
    if (!isRecord(settings) || !isRecord(settings.hooks)) {
        return hookCommands;
    }
    for (const [event, eventHooks] of Object.entries(settings.hooks)) {
        const commands = collectCommands(eventHooks);
        const list = SESSION_START_EVENTS.has(event) ? hookCommands.sessionStart : hookCommands.otherEvents;
        list.push(...commands);
    }
    return hookCommands;
}
/** Tells whether one VS Code task runs when the folder is opened. */
function runsOnFolderOpen(task) {
    if (!isRecord(task) || !isRecord(task.runOptions)) {
        return false;
    }
    return task.runOptions.runOn === "folderOpen";
}
/** Returns the labels of the VS Code tasks that run when the folder is opened. */
export function findFolderOpenTasks(tasksText) {
    const tasks = parseJson(tasksText);
    if (!isRecord(tasks) || !Array.isArray(tasks.tasks)) {
        return [];
    }
    const autoRunTasks = tasks.tasks.filter(runsOnFolderOpen);
    return autoRunTasks.map(describeTask);
}
/** Returns a short readable name for a VS Code task. */
function describeTask(task) {
    const label = typeof task.label === "string" ? task.label : "unnamed task";
    const command = typeof task.command === "string" ? task.command : "";
    return `${label}: ${command}`.trim();
}
/** Returns the commands of the local MCP servers declared in a configuration file. */
export function findMcpCommands(configText) {
    const config = parseJson(configText);
    if (!isRecord(config)) {
        return [];
    }
    const servers = config.mcpServers ?? config.servers;
    return collectCommands(servers);
}
/** The characters a TOML bare key is made of. */
const TOML_BARE_KEY = /[A-Za-z0-9_-]/u;
/** The shape of the hexadecimal digits of a TOML unicode escape. */
const TOML_HEX_ESCAPE = /^[0-9A-Fa-f]+$/u;
/** The characters a basic string escape stands for, other than the unicode ones. */
const TOML_ESCAPES = {
    b: "\b",
    t: "\t",
    n: "\n",
    f: "\f",
    r: "\r",
    '"': '"',
    "\\": "\\",
};
/** The deepest chain of inline tables the reader looks into; a Codex server needs one. */
const TOML_INLINE_DEPTH = 8;
/** The whitespace a line-ending backslash of a multi-line string swallows. */
const TOML_BLANK = /[ \t\r\n]/u;
/**
 * Reads the text of a Codex TOML file one key path and value at a time, so that every spelling of a
 * key is read the same way: quoted keys, dotted keys, keys with spaces around the dot, multi-line
 * strings and inline tables.
 */
class TomlReader {
    text;
    index = 0;
    /** Takes the text to read. */
    constructor(text) {
        this.text = text;
    }
    /** Returns every entry of the file, with the table path that encloses it in front of its own key. */
    readDocument() {
        const entries = [];
        let tablePath = [];
        while (this.index < this.text.length) {
            this.skipInsignificant();
            if (this.index >= this.text.length) {
                return entries;
            }
            if (this.text.charAt(this.index) === "[") {
                tablePath = this.readTableHeader() ?? [];
                continue;
            }
            const entry = this.readAssignment(0);
            if (entry === undefined) {
                this.skipToNextLine();
                continue;
            }
            entries.push({ path: tablePath.concat(entry.path), value: entry.value });
        }
        return entries;
    }
    /** Reads a table header and returns its key path, or undefined when this line does not hold one. */
    readTableHeader() {
        this.index += 1;
        if (this.text.charAt(this.index) === "[") {
            this.skipToNextLine();
            return undefined;
        }
        const path = this.readKeyPath();
        if (path === undefined || this.text.charAt(this.index) !== "]") {
            this.skipToNextLine();
            return undefined;
        }
        this.index += 1;
        if (!this.atLineEnd()) {
            this.skipToNextLine();
            return undefined;
        }
        return path;
    }
    /** Tells whether only spaces and an optional comment remain on the current line. */
    atLineEnd() {
        this.skipSpaces();
        const character = this.text.charAt(this.index);
        return character === "" || character === "\n" || character === "\r" || character === "#";
    }
    /** Reads one key = value statement of the given inline table depth, or returns undefined when the text here does not hold one. */
    readAssignment(depth) {
        const path = this.readKeyPath();
        if (path === undefined || this.text.charAt(this.index) !== "=") {
            return undefined;
        }
        this.index += 1;
        this.skipSpaces();
        const value = this.readValue(depth);
        return value === undefined ? undefined : { path, value };
    }
    /** Reads a key path of one or more segments, separated by dots with any spaces around them. */
    readKeyPath() {
        const path = [];
        while (true) {
            this.skipSpaces();
            const segment = this.readKeySegment();
            if (segment === undefined) {
                return undefined;
            }
            path.push(segment);
            this.skipSpaces();
            if (this.text.charAt(this.index) !== ".") {
                return path;
            }
            this.index += 1;
        }
    }
    /** Reads one key segment: a bare key, or a quoted one that may hold dots and spaces. */
    readKeySegment() {
        const opener = this.text.charAt(this.index);
        if (opener === '"' || opener === "'") {
            return this.readSingleLineString();
        }
        let end = this.index;
        while (TOML_BARE_KEY.test(this.text.charAt(end))) {
            end += 1;
        }
        if (end === this.index) {
            return undefined;
        }
        const segment = this.text.slice(this.index, end);
        this.index = end;
        return segment;
    }
    /** Reads one value at the given inline table depth, keeping the text of a string and the entries of an inline table. */
    readValue(depth) {
        const opener = this.text.charAt(this.index);
        if (opener === '"' || opener === "'") {
            if (this.text.startsWith(opener.repeat(3), this.index)) {
                return this.readMultiLineString();
            }
            const value = this.readSingleLineString();
            return value === undefined ? undefined : { kind: "string", value };
        }
        if (opener === "{") {
            if (depth >= TOML_INLINE_DEPTH) {
                this.skipInlineTable(depth);
                return { kind: "other" };
            }
            return this.readInlineTable(depth);
        }
        this.skipBareValue(depth);
        return { kind: "other" };
    }
    /** Reads a basic or literal string that has to close on this line, or returns undefined. */
    readSingleLineString() {
        const delimiter = this.text.charAt(this.index);
        const isBasic = delimiter === '"';
        this.index += 1;
        let result = "";
        while (this.index < this.text.length) {
            const step = this.readLineStringStep(delimiter, isBasic);
            if (step.status === "unterminated") {
                return undefined;
            }
            result += step.text;
            if (step.status === "closed") {
                return result;
            }
        }
        return undefined;
    }
    /** Reads one character of a single-line string, or its closing quote, and reports what it added. */
    readLineStringStep(delimiter, isBasic) {
        const character = this.text.charAt(this.index);
        if (character === "" || character === "\n" || character === "\r") {
            return { text: "", status: "unterminated" };
        }
        if (character === delimiter) {
            this.index += 1;
            return { text: "", status: "closed" };
        }
        if (isBasic && character === "\\") {
            const escaped = this.readEscapeInLine();
            if (escaped === undefined) {
                return { text: "", status: "unterminated" };
            }
            return { text: escaped, status: "inside" };
        }
        this.index += 1;
        return { text: character, status: "inside" };
    }
    /** Reads one escape sequence of a single-line string, or returns undefined when it runs off the line. */
    readEscapeInLine() {
        const escaped = this.text.charAt(this.index + 1);
        if (escaped === "" || escaped === "\n" || escaped === "\r") {
            return undefined;
        }
        return this.readEscape();
    }
    /** Reads one escape sequence and returns the characters it stands for, keeping an escape TOML does not define as written. */
    readEscape() {
        const escaped = this.text.charAt(this.index + 1);
        if (escaped === "u") {
            return this.readUnicodeEscape(4);
        }
        if (escaped === "U") {
            return this.readUnicodeEscape(8);
        }
        this.index += 2;
        const shared = TOML_ESCAPES[escaped];
        return shared === undefined ? "\\" + escaped : shared;
    }
    /** Reads a unicode escape of four or eight hexadecimal digits, so an escaped letter still spells the same key. */
    readUnicodeEscape(digits) {
        const marker = this.text.charAt(this.index + 1);
        const hex = this.text.slice(this.index + 2, this.index + 2 + digits);
        const code = Number.parseInt(hex, 16);
        if (hex.length !== digits || !TOML_HEX_ESCAPE.test(hex) || isNotScalar(code)) {
            this.index += 2;
            return "\\" + marker;
        }
        this.index += 2 + digits;
        return String.fromCodePoint(code);
    }
    /** Reads a string that opens with three quotes and may run over several lines, or returns undefined when it never closes. */
    readMultiLineString() {
        const delimiter = this.text.charAt(this.index);
        const isBasic = delimiter === '"';
        this.index += 3;
        this.skipOpeningLineBreak();
        const value = this.readMultiLinePart(delimiter, isBasic);
        return value === undefined ? undefined : { kind: "string", value };
    }
    /** Reads the text of a multi-line string up to and including its closing three quotes, or returns undefined at the end of the file. */
    readMultiLinePart(delimiter, isBasic) {
        let result = "";
        while (this.index < this.text.length) {
            const step = this.readMultiLineStep(delimiter, isBasic);
            result += step.text;
            if (step.status === "closed") {
                return result;
            }
        }
        return undefined;
    }
    /** Reads one character of a multi-line string, or its closing quotes, and reports what it added. */
    readMultiLineStep(delimiter, isBasic) {
        const character = this.text.charAt(this.index);
        if (isBasic && character === "\\") {
            const escaped = this.text.charAt(this.index + 1);
            if (escaped === "\n" || escaped === "\r") {
                this.skipContinuation();
                return { text: "", status: "inside" };
            }
            return { text: this.readEscape(), status: "inside" };
        }
        if (character !== delimiter) {
            this.index += 1;
            return { text: character, status: "inside" };
        }
        const quotes = this.countQuotes(delimiter);
        this.index += quotes;
        if (quotes >= 3) {
            return { text: delimiter.repeat(quotes - 3), status: "closed" };
        }
        return { text: delimiter.repeat(quotes), status: "inside" };
    }
    /** Skips a line-ending backslash and the whitespace after it, which TOML drops from a multi-line string. */
    skipContinuation() {
        this.index += 1;
        while (TOML_BLANK.test(this.text.charAt(this.index))) {
            this.index += 1;
        }
    }
    /** Counts the quote characters at the cursor, where three of them close a multi-line string. */
    countQuotes(delimiter) {
        let quotes = 0;
        while (this.text.charAt(this.index + quotes) === delimiter) {
            quotes += 1;
        }
        return quotes;
    }
    /** Drops the line break that may follow the opening quotes of a multi-line string, as TOML does. */
    skipOpeningLineBreak() {
        if (this.text.charAt(this.index) === "\r") {
            this.index += 1;
        }
        if (this.text.charAt(this.index) === "\n") {
            this.index += 1;
        }
    }
    /** Reads an inline table of the given depth, whose keys keep their own paths inside it. */
    readInlineTable(depth) {
        this.index += 1;
        const entries = [];
        while (this.index < this.text.length) {
            this.skipInsignificant();
            if (this.text.charAt(this.index) === "}") {
                this.index += 1;
                return { kind: "table", entries };
            }
            const entry = this.readAssignment(depth + 1);
            if (entry === undefined) {
                this.skipToNextLine();
                continue;
            }
            entries.push(entry);
            this.skipSeparator();
        }
        return { kind: "table", entries };
    }
    /** Skips the comma that separates two entries of an inline table. */
    skipSeparator() {
        this.skipInsignificant();
        if (this.text.charAt(this.index) === ",") {
            this.index += 1;
        }
    }
    /** Skips one inline table without reading it, so a key written after it stays readable. */
    skipInlineTable(depth) {
        let opened = 0;
        while (this.index < this.text.length) {
            const character = this.text.charAt(this.index);
            if (character === '"' || character === "'") {
                this.readValue(depth);
                continue;
            }
            if (character === "#") {
                this.skipToNextLine();
                continue;
            }
            if (character === "{") {
                opened += 1;
            }
            if (character === "}") {
                opened -= 1;
            }
            this.index += 1;
            if (opened === 0) {
                return;
            }
        }
    }
    /** Skips a value that is neither a string nor an inline table, to the end of its line or past the array it opens. */
    skipBareValue(depth) {
        let opened = 0;
        while (this.index < this.text.length) {
            const character = this.text.charAt(this.index);
            if (character === "\n" && opened === 0) {
                return;
            }
            if (character === "#" && opened === 0) {
                return;
            }
            if (character === "#") {
                this.skipToNextLine();
                continue;
            }
            if (character === '"' || character === "'") {
                this.readValue(depth);
                continue;
            }
            if (character === "[" || character === "{") {
                opened += 1;
            }
            if (character === "]" || character === "}") {
                opened -= 1;
            }
            this.index += 1;
        }
    }
    /** Skips the spaces and tabs that separate two tokens on one line. */
    skipSpaces() {
        while (this.text.charAt(this.index) === " " || this.text.charAt(this.index) === "\t") {
            this.index += 1;
        }
    }
    /** Skips the spaces, line breaks and comments between two statements. */
    skipInsignificant() {
        while (this.index < this.text.length) {
            const character = this.text.charAt(this.index);
            if (character === "#") {
                this.skipToNextLine();
                continue;
            }
            if (character !== "\n" && character !== "\r" && character !== " " && character !== "\t") {
                return;
            }
            this.index += 1;
        }
    }
    /** Skips the rest of the current line and the line break after it. */
    skipToNextLine() {
        while (this.index < this.text.length && this.text.charAt(this.index) !== "\n") {
            this.index += 1;
        }
        this.index += 1;
    }
}
/** Tells whether a code point is one TOML cannot spell in an escape: above the last one, or a surrogate. */
function isNotScalar(code) {
    return code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff);
}
/** Tells whether a key path is the command of one local MCP server, and not of a sub-table such as its env. */
function isServerCommand(path) {
    return path.length === 3 && path[0] === "mcp_servers" && path[2] === "command";
}
/** Adds the commands a list of TOML entries declares, looking inside the inline tables it holds. */
function collectTomlCommands(entries, prefix, commands) {
    for (const entry of entries) {
        const path = prefix.concat(entry.path);
        if (entry.value.kind === "table") {
            collectTomlCommands(entry.value.entries, path, commands);
            continue;
        }
        if (entry.value.kind === "string" && entry.value.value !== "" && isServerCommand(path)) {
            commands.push(entry.value.value);
        }
    }
}
/**
 * Returns the commands of the local MCP servers declared in a Codex TOML file.
 * Every spelling of the same key counts: a dotted key, a quoted key, spaces around the dot, a
 * multi-line string, an inline table. Only a command key three levels deep under mcp_servers
 * counts, so the same key inside a sub-table such as [mcp_servers.<name>.env] is not mistaken
 * for one, and a table header broken over two lines credits nothing to the server above it.
 */
export function findMcpTomlCommands(text) {
    const commands = [];
    collectTomlCommands(new TomlReader(text).readDocument(), [], commands);
    return commands;
}
/** Tells whether a text contains invisible or text-direction characters. */
export function hasInvisibleCharacters(text) {
    return INVISIBLE_CHARACTERS.test(text);
}
/** Returns the phrases of a text that tell an agent to skip confirmation or hide what it does. */
export function findInjectionPhrases(text) {
    const phrases = [];
    for (const pattern of INJECTION_PHRASES) {
        const match = pattern.exec(text);
        if (match !== null) {
            phrases.push(match[0]);
        }
    }
    return phrases;
}
/** Tells whether a tree entry is a large script stored where agent payloads hide. */
export function isLargeScript(entry) {
    const isScript = entry.type === "blob" && (SCRIPT_EXTENSION.test(entry.path) || SETUP_SCRIPT.test(entry.path));
    const isInPayloadPlace = PAYLOAD_FOLDER.test(entry.path) || SETUP_SCRIPT.test(entry.path);
    const isLarge = (entry.size ?? 0) >= LARGE_SCRIPT_BYTES;
    return isScript && isInPayloadPlace && isLarge;
}
/** Tells whether a command starts a worm payload: a setup or init script, or a downloaded script piped into a shell. */
export function isPayloadCommand(command) {
    return PAYLOAD_COMMANDS.some(matchesMessage, command);
}
/** Tells whether an instruction file carries a marker written by a known worm. */
export function hasInstructionMarker(text) {
    return INSTRUCTION_MARKERS.some(matchesMessage, text);
}
/** Tells whether a commit message carries a marker written by a known worm. */
export function hasWormMarker(message) {
    return COMMIT_MARKERS.some(matchesMessage, message);
}
/** Tells whether one marker pattern matches the message given as this. */
function matchesMessage(marker) {
    return marker.value.test(this);
}
/** Tells whether a repository has the description, and when needed the name shape, of a worm exfiltration repository. */
export function isDropDescription(description, name = "") {
    if (description === null) {
        return false;
    }
    const repository = { description: description.trim(), name };
    return DROP_DESCRIPTIONS.some(matchesDrop, repository);
}
/** Tells whether a repository name is one that a worm gives to its exfiltration repositories. */
export function isDropName(name) {
    return DROP_NAMES.some(matchesDropName, name);
}
/** Tells whether a drop name signature matches the repository name given as this. */
function matchesDropName(signature) {
    return signature.value.test(this);
}
/** Tells whether a drop signature matches the repository given as this. */
function matchesDrop(signature) {
    const nameMatches = signature.namePattern === undefined || signature.namePattern.test(this.name);
    return signature.value === this.description && nameMatches;
}
/** Returns how many whole days a commit date is older than the last push, or 0 when it is not older. */
export function daysBeforePush(commitDate, pushedAt) {
    const gap = Date.parse(pushedAt) - Date.parse(commitDate);
    if (!Number.isFinite(gap) || gap <= 0) {
        return 0;
    }
    return Math.floor(gap / MILLISECONDS_PER_DAY);
}
