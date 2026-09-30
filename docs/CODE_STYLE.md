# Code style

Conventions for writing code in this repository. The linter enforces the
mechanical parts (`npm run lint`); this page explains the conventions and the
reasons behind the ones that exist because something broke.

---

## 1. Environment and module rules

- **JavaScript (ES2023) + JSX, no TypeScript.** Source is bundled by esbuild
  (`build.js`); there is no transpilation beyond JSX.
- **React is a global, never an import.** `React`, `ReactDOM` and
  `supabase-js` are UMD builds self-hosted under `vendor/` and loaded by
  `index.html`. Never write `import React from "react"` — the bundle has no
  copy of React, and this is what allows the CSP to stay `script-src 'self'`.
  ESLint declares them `readonly` globals.
- **Three compile-time defines** — `__SHOW_DEMO__`, `__EMBED_TEAM_DIRECTORY__`
  and `__APP_VERSION__` — are injected by `build.js` and must stay declared in
  `eslint.config.js`. The two data flags default to off; see `CLAUDE.md` for
  why a demo build must never deploy.
- `sw.js` uses service-worker globals; `scripts/*.mjs` are Node ES modules;
  `build.js` and `scripts/*.js` are CommonJS. Each has its own ESLint block.

## 2. Where code goes

- **`app.jsx` is the shell** (~1500 lines): app state, routing, Supabase sync.
  It imports everything and is exported nowhere. No test suite mounts it.
- **`src/` is everything else, and it is pure.** Logic modules (`authz.js`,
  `validation.js`, `leaveWorkflow.js`, …) take arguments and return values —
  no globals, no fetches at import time. This is what makes them unit-testable;
  keep new logic in `src/`, not in `app.jsx`.
- **`src/components/*.jsx`** hold page-level components imported by the shell.
- Operational scripts live in `scripts/` (smoke, preflight, verify-dist,
  backup/restore); every call site goes through `node`.

## 3. Lint rules that are load-bearing

Defined in `eslint.config.js`; do not weaken these.

- **`no-use-before-define` with `functions: false`** — the rule that would
  have caught the portal-wide outage. A hook dependency array is evaluated
  during render, where `const`s below it are still in their temporal dead
  zone; `useEffect(..., [loadAudit])` written 170 lines above
  `const loadAudit = useCallback(...)` crashed every render for every user.
  Hoisted `function` declarations remain legal; `const`/`class` references
  before definition are errors.
- **`react-hooks/rules-of-hooks`** is an error; **`exhaustive-deps`** a
  warning — resolve it properly rather than suppressing it.
- **`no-unused-vars`** ignores identifiers prefixed `_` — use that prefix for
  intentionally unused parameters.
- Empty `catch` blocks are allowed (`allowEmptyCatch`) — used where a failure
  is genuinely non-actionable (e.g. push unsubscribe cleanup), and nowhere
  else.

## 4. Naming

- **camelCase in JavaScript, snake_case in the database.** The translation
  happens in exactly one place: the `*ToDb` / `*FromDb` mapper pairs in
  `src/supabasePortal.js` (`empToDb`, `lrFromDb`, …). Never hand-write a
  snake_case column name in a component; add the field to the mapper.
- Components are PascalCase files in `src/components/`; logic modules are
  camelCase files in `src/`.
- Tests are `tests/<module>.test.js`, named after the module they exercise.

## 5. Comments

Comment the *why*, especially when the why is an incident: the codebase's
convention is that every non-obvious guard, ordering constraint, or odd-looking
rule carries the story that created it (see the header comments in the SQL
migrations, `eslint.config.js`, and `scripts/smoke.mjs`). Do not comment what
the next line does.

## 6. Files, line endings, and shebangs

- **Line endings are LF everywhere**, pinned by `.gitattributes`
  (`* text=auto eol=lf`). This is load-bearing: a CRLF checkout once made
  `tests/backup.test.js` unparseable on Windows and silently dropped 25 tests.
  CI runs on ubuntu **and** windows to keep this honest.
- **No `#!` shebang lines in `scripts/*.mjs`.** Nothing execs them (every call
  site goes through `node`), and a shebang plus a CRLF checkout makes the file
  unparseable to vitest.
- `app.js` at the repo root is a gitignored `npm run dev` artifact. Never edit
  it, and never edit `dist/`.

## 7. Testing and gates

- Unit tests: vitest, in `tests/`, covering `src/` modules only. Run a single
  file with `npx vitest run tests/authz.test.js`, a single case with
  `npx vitest run -t "name"`.
- The full gate is `npm run ci` = lint + tests + build + `verify-dist`
  (PII gate over the bundle) + `smoke` (real-browser render check). Each gate
  exists because something shipped broken without it — see `CLAUDE.md`. Keep
  smoke dumb: no sign-in, no backend, no asserting on copy.
- When touching permissions, change `src/authz.js` **and** the SQL policy
  together; every predicate in `authz.js` names the policy or trigger backing
  it (see `docs/SECURITY.md`).
