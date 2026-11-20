# Contributing

Thank you for helping. Every change follows the same path: an issue, a branch, a pull request, a green CI.

## Setup

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run coverage   # 100% lines, branches, functions and statements are required
pnpm run build
```

## Adding a rule

1. Open an issue with a **public source** showing the technique in a real attack (vendor report, advisory, public
   commit). Never paste a live secret or a working payload.
2. Add the rule in `src/rules.ts` with the next `WS` number, then wire it in `src/scanner.ts`.
3. Add a test with a fixture that only contains the configuration text, never the payload itself.
4. Document the rule in the README table, with its false positives.

## Code style

- Named functions only: no arrow functions and no anonymous function expressions (enforced by ESLint).
- Braces on every `if`, `for` and `while`; guard clauses instead of nested `if`; no nested ternary.
- Every function has a one-sentence comment that says what it does, and typed parameters and return value.
- No runtime dependency.
