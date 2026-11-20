# Adding a new worm in less than an hour

New worms appear every few weeks. Most of them reuse the same tricks and only change their markers, so adding one
is usually a one-line change in [`src/signatures.ts`](../src/signatures.ts).

## 1. Find a public source (10 minutes)

A signature needs a public report that shows the marker in a real attack: a security vendor blog, a GitHub
advisory, or a public infected repository. Copy the link; it goes into the `source` field. No source, no signature.

## 2. Pick the kind of marker (5 minutes)

| What the worm leaves | List to edit in `src/signatures.ts` | Rule |
|---|---|---|
| A text in its commit messages | `COMMIT_MARKERS` | WS007 |
| A text in the CLAUDE.md or AGENTS.md it plants | `INSTRUCTION_MARKERS` | WS011 |
| The description of the repository where it publishes stolen secrets | `DROP_DESCRIPTIONS` (add `namePattern` when the text is common) | WS008 |
| A new hook event that runs at session start | `SESSION_START_EVENTS` | WS001 |
| A new payload file name | `SETUP_SCRIPT` or `PAYLOAD_FOLDER` | WS004 |
| A new phrase that tells the agent to skip the user | `INJECTION_PHRASES` | WS006 |

A new kind of trick, such as a new configuration file, needs a new rule in `src/rules.ts` and `src/scanner.ts`;
open an issue first.

## 3. Add the line and a test (20 minutes)

```ts
{ value: /^my-new-marker:/mu, worm: "NewWorm", source: "https://vendor.example/blog/new-worm" },
```

Add a test in `test/rules.test.ts` with a real marker from the report, and a test that a close but harmless text is
**not** matched. Then:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck && pnpm run lint && pnpm run coverage && pnpm run build
```

Coverage must stay at 100 %.

## 4. Check on real data (15 minutes)

- Run `node dist/cli.js <owner/repo>` on a public repository named in the report: the new marker must be found.
- Run `node scripts/benchmark.mjs` (or a few organizations of `scripts/healthy-organizations.txt`): no new
  critical or high finding may appear.

## 5. Open the pull request (10 minutes)

Title: `signature: <worm name>`. Paste the source link, the command you ran and its output. Commit `dist/` too
(the GitHub Action runs from it): `pnpm run build && git add dist`.
