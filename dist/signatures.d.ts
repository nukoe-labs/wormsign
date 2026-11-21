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
/** The markers that worms write in the commit messages they push. */
export declare const COMMIT_MARKERS: Signature<RegExp>[];
/** The markers that worms write in the agent instruction files they plant (CLAUDE.md, AGENTS.md...). */
export declare const INSTRUCTION_MARKERS: Signature<RegExp>[];
/** The descriptions that worms give to the repositories where they publish stolen secrets. */
export declare const DROP_DESCRIPTIONS: Signature<string>[];
/** The names that worms give to the repositories where they publish stolen secrets, whatever the description. */
export declare const DROP_NAMES: Signature<RegExp>[];
/** The hook events that run as soon as an agent session starts in the folder, before any question to the user. */
export declare const SESSION_START_EVENTS: Set<string>;
/** The phrases that tell an agent to skip the user or to hide what it does. */
export declare const INJECTION_PHRASES: RegExp[];
/** The folders where agent worms store their payload, next to the agent configuration. */
export declare const PAYLOAD_FOLDER: RegExp;
/**
 * The setup scripts that worm hooks start, at the root or in scripts/. `init.ps1` is the Windows twin of Miasma's
 * `.github/init.js`; it is the only PowerShell name a report has shown, so no other `.ps1` is read as a payload.
 */
export declare const SETUP_SCRIPT: RegExp;
/** The commands that start a worm payload: a setup or init script, or a script downloaded and piped into a shell. */
export declare const PAYLOAD_COMMANDS: Signature<RegExp>[];
