import { getCommit, getFileText, getTree, listBranches } from "./github.js";
import { BACKDATED_DAYS, HOOK_FILES, MCP_FILES, MCP_TOML_FILES, RULES, TASKS_FILE, daysBeforePush, findFolderOpenTasks, findHookCommands, findInjectionPhrases, findMcpCommands, findMcpTomlCommands, hasInstructionMarker, hasInvisibleCharacters, hasWormMarker, isDropDescription, isDropName, isInstructionFile, isLargeScript, isPayloadCommand, } from "./rules.js";
/** The default highest number of branches read per repository. */
export const DEFAULT_MAX_BRANCHES = 20;
/** The rules whose findings mean that code can run when the folder is opened. */
const AUTORUN_RULES = new Set([RULES.agentHook.id, RULES.folderOpenTask.id, RULES.largeScript.id]);
/** Builds one finding from a rule, the place where it was seen and the explanation. */
function createFinding(rule, place, message) {
    return { rule: rule.id, severity: rule.severity, ...place, message };
}
/** Builds the note for an agent file that was too large to be read, so that a skipped file never looks clean. */
export function createUnreadFileFinding(path, size, place) {
    const message = `${RULES.unreadFile.title}: ${size} bytes, so it was not checked. Read it by hand: padding hides a hook from a scan.`;
    return createFinding(RULES.unreadFile, { ...place, path }, message);
}
/** Joins a list of commands or phrases into a short quoted text. */
function quote(items) {
    return items.map(quoteOne).join(", ");
}
/** Puts one item between quotes, cut to a readable length. */
function quoteOne(item) {
    const maximumLength = 120;
    const shortItem = item.length > maximumLength ? `${item.slice(0, maximumLength)}…` : item;
    return `"${shortItem}"`;
}
/** Checks the text of one configuration or instruction file and returns its findings. */
export function checkFileText(path, text, place) {
    const filePlace = { ...place, path };
    const findings = [];
    if (HOOK_FILES.has(path)) {
        const hookCommands = findHookCommands(text);
        const payloadHooks = hookCommands.sessionStart.filter(isPayloadCommand);
        const otherHooks = [...hookCommands.sessionStart.filter(isOrdinaryCommand), ...hookCommands.otherEvents];
        findings.push(...checkCommands(RULES.agentHook, payloadHooks, filePlace));
        findings.push(...checkCommands(RULES.toolHook, otherHooks, filePlace));
    }
    if (path === TASKS_FILE) {
        const tasks = findFolderOpenTasks(text);
        findings.push(...checkCommands(RULES.folderOpenTask, tasks.filter(isPayloadCommand), filePlace));
        findings.push(...checkCommands(RULES.folderOpenCommand, tasks.filter(isOrdinaryCommand), filePlace));
    }
    if (MCP_FILES.has(path)) {
        findings.push(...checkCommands(RULES.mcpServer, findMcpCommands(text), filePlace));
    }
    if (MCP_TOML_FILES.has(path)) {
        findings.push(...checkCommands(RULES.mcpServer, findMcpTomlCommands(text), filePlace));
    }
    if (isInstructionFile(path)) {
        findings.push(...checkInstructionText(text, filePlace));
    }
    return findings;
}
/** Tells whether a command does not start a known worm payload. */
function isOrdinaryCommand(command) {
    return !isPayloadCommand(command);
}
/** Returns one finding listing the commands, or nothing when there is no command. */
function checkCommands(rule, commands, place) {
    if (commands.length === 0) {
        return [];
    }
    return [createFinding(rule, place, `${rule.title}: ${quote(commands)}.`)];
}
/** Checks an instruction file for invisible characters and for orders that skip the user. */
function checkInstructionText(text, place) {
    const findings = [];
    if (hasInvisibleCharacters(text)) {
        const message = `${RULES.invisibleUnicode.title}: a human reviewer cannot see what the agent reads.`;
        findings.push(createFinding(RULES.invisibleUnicode, place, message));
    }
    if (hasInstructionMarker(text)) {
        findings.push(createFinding(RULES.instructionMarker, place, `${RULES.instructionMarker.title}: the file was planted by a worm.`));
    }
    const phrases = findInjectionPhrases(text);
    if (phrases.length > 0) {
        findings.push(createFinding(RULES.agentInjection, place, `${RULES.agentInjection.title}: ${quote(phrases)}.`));
    }
    return findings;
}
/** Tells whether the text of this file must be read to check it. */
function mustReadFile(entry) {
    const isConfiguration = HOOK_FILES.has(entry.path) || MCP_FILES.has(entry.path) || MCP_TOML_FILES.has(entry.path) || entry.path === TASKS_FILE;
    return entry.type === "blob" && (isConfiguration || isInstructionFile(entry.path));
}
/** Returns a finding for each large script hidden next to the agent configuration. */
function checkLargeScripts(tree, place) {
    const largeScripts = tree.filter(isLargeScript);
    return largeScripts.map(createLargeScriptFinding, place);
}
/** Builds the finding of one large script, at the place given as this. */
function createLargeScriptFinding(entry) {
    const message = `${RULES.largeScript.title}: ${entry.size} bytes, a common shape for an obfuscated payload.`;
    return createFinding(RULES.largeScript, { ...this, path: entry.path }, message);
}
/** Reads and checks every configuration and instruction file of a tree. */
async function checkTreeFiles(client, tree, place) {
    const findings = [];
    const filesToRead = tree.filter(mustReadFile);
    for (const entry of filesToRead) {
        const text = await getFileText(client, place.repository, entry.path, place.commit);
        if (text !== undefined) {
            findings.push(...checkFileText(entry.path, text, place));
        }
    }
    return findings;
}
/** Checks the head commit of a branch: worm marker in its message, and date far older than the last push. */
async function checkHeadCommit(client, repository, place, hasAutorun) {
    const commit = await getCommit(client, repository.full_name, place.commit);
    const findings = [];
    if (hasWormMarker(commit.commit.message)) {
        findings.push(createFinding(RULES.wormMarker, place, `${RULES.wormMarker.title}: the commit was written by a worm.`));
    }
    const commitDate = commit.commit.committer?.date ?? repository.pushed_at;
    const days = daysBeforePush(commitDate, repository.pushed_at);
    const isBackdated = hasAutorun && place.branch === repository.default_branch && days >= BACKDATED_DAYS;
    if (isBackdated) {
        const message = `${RULES.backdatedCommit.title}: dated ${days} days before the push, a trick used to hide worm commits.`;
        findings.push(createFinding(RULES.backdatedCommit, place, message));
    }
    return findings;
}
/** Tells whether a finding means that code can run when the folder is opened. */
function isAutorunFinding(finding) {
    return AUTORUN_RULES.has(finding.rule);
}
/** Scans the head of one branch of a repository. */
async function scanBranch(client, repository, branch) {
    const place = { repository: repository.full_name, branch: branch.name, commit: branch.commit.sha };
    const tree = await getTree(client, repository.full_name, branch.commit.sha);
    const findings = checkLargeScripts(tree, place);
    findings.push(...(await checkTreeFiles(client, tree, place)));
    const hasAutorun = findings.some(isAutorunFinding);
    findings.push(...(await checkHeadCommit(client, repository, place, hasAutorun)));
    return findings;
}
/** Scans every branch of a repository once per head commit, at most the given number, and checks whether it is a worm drop. */
export async function scanRepository(client, repository, maxBranches) {
    const findings = [];
    const place = { repository: repository.full_name, branch: repository.default_branch };
    if (isDropDescription(repository.description, repository.name)) {
        const message = `${RULES.dropRepository.title}: description "${repository.description}".`;
        findings.push(createFinding(RULES.dropRepository, place, message));
    }
    else if (isDropName(repository.name)) {
        const message = `${RULES.dropRepository.title}: name "${repository.name}".`;
        findings.push(createFinding(RULES.dropRepository, place, message));
    }
    const branches = await listBranches(client, repository.full_name, maxBranches, repository.default_branch);
    const scannedCommits = new Set();
    for (const branch of branches) {
        if (scannedCommits.has(branch.commit.sha)) {
            continue;
        }
        scannedCommits.add(branch.commit.sha);
        findings.push(...(await scanBranch(client, repository, branch)));
    }
    return findings;
}
