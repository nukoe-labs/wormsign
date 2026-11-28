/**
 * This file holds every known worm signature. Adding a new worm usually means adding a line here, with its public
 * source, and a test in test/signatures.test.ts. The procedure is in docs/adding-a-worm.md.
 */

/** One signature with the public report that describes it. */
export interface Signature<T> {
  /** The marker itself: a pattern or an exact text. */
  value: T;
  /** The worm or campaign that leaves this marker. */
  worm: string;
  /** The public report where the marker was published. */
  source: string;
  /** The shape of the repository name, when the marker alone is too common to be trusted. */
  namePattern?: RegExp;
}

const BITDEFENDER = "https://www.bitdefender.com/en-us/blog/labs/how-ai-agents-become-new-targets-in-github-malware-campaign";
const SAFEDEP = "https://safedep.io/mini-shai-hulud-strikes-again-314-npm-packages-compromised/";
const SAFEDEP_MIASMA = "https://safedep.io/testmetest-npm-worm-miasma-variant/";
const SOCKET_NX = "https://socket.dev/blog/nx-packages-compromised";
const WIZ = "https://www.wiz.io/blog/shai-hulud-2-0-ongoing-supply-chain-attack";

/** The markers that worms write in the commit messages they push. */
export const COMMIT_MARKERS: Signature<RegExp>[] = [
  { value: /^AutoSyncComplete:/mu, worm: "Miasma", source: BITDEFENDER },
  { value: /^msync-[0-9a-f]{4}\s/mu, worm: "Miasma", source: SAFEDEP_MIASMA },
  { value: /DEVOPS-SEALED/u, worm: "Miasma", source: SAFEDEP_MIASMA },
];

/** The markers that worms write in the agent instruction files they plant (CLAUDE.md, AGENTS.md...). */
export const INSTRUCTION_MARKERS: Signature<RegExp>[] = [{ value: /DEVOPS-SEALED/u, worm: "Miasma", source: SAFEDEP_MIASMA }];

/** The descriptions that worms give to the repositories where they publish stolen secrets. */
export const DROP_DESCRIPTIONS: Signature<string>[] = [
  { value: "project-utils", worm: "Miasma", source: SAFEDEP_MIASMA, namePattern: /^[a-z]+-[a-z]+-\d{3,6}$/u },
  { value: "Sha1-Hulud: The Second Coming.", worm: "Shai-Hulud 2.0", source: WIZ },
  { value: "Shai-Hulud: Here We Go Again", worm: "Mini Shai-Hulud", source: SAFEDEP },
];

/** The names that worms give to the repositories where they publish stolen secrets, whatever the description. */
export const DROP_NAMES: Signature<RegExp>[] = [
  { value: /^s1ngularity-repository(?:-\d+)?$/u, worm: "s1ngularity (Nx)", source: SOCKET_NX },
];

/** The hook events that run as soon as an agent session starts in the folder, before any question to the user. */
export const SESSION_START_EVENTS = new Set(["SessionStart", "Setup", "sessionStart", "beforeSessionStart"]);

/** The phrases that tell an agent to skip the user or to hide what it does. */
export const INJECTION_PHRASES: RegExp[] = [
  /without (?:asking|prompting|confirmation|confirming)/iu,
  /do not (?:ask|prompt) (?:for|the user)/iu,
  /(?:hide|suppress|do not show) (?:the )?output/iu,
  /(?:run|execute) [\w./-]*setup[\w.-]* (?:first|before)/iu,
  /never mention (?:this|these)/iu,
];

/** The folders where agent worms store their payload, next to the agent configuration. */
export const PAYLOAD_FOLDER = /^(?:\.claude|\.cursor|\.gemini|\.vscode)\//u;

/**
 * The setup scripts that worm hooks start, at the root or in scripts/. `init.ps1` is the Windows twin of Miasma's
 * `.github/init.js`; it is the only PowerShell name a report has shown, so no other `.ps1` is read as a payload.
 */
export const SETUP_SCRIPT = /^(?:(?:scripts|\.github)\/)?(?:(?:setup|init)\.(?:c|m)?js|init\.ps1)$/u;

/** The commands that start a worm payload: a setup or init script, or a script downloaded and piped into a shell. */
export const PAYLOAD_COMMANDS: Signature<RegExp>[] = [
  { value: /(?:^|[\s"'/\\])(?:setup|init)\.(?:c|m)?js\b/u, worm: "Miasma, Mini Shai-Hulud", source: BITDEFENDER },
  { value: /\b(?:curl|wget)\b[^|]*\|\s*(?:ba|z)?sh\b/u, worm: "Miasma", source: SAFEDEP_MIASMA },
];
