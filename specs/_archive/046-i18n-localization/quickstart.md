# Quickstart — validate i18n localization

Runnable checks proving the feature works end-to-end. Run from the repo root
unless noted. See [contracts/](contracts/) and [data-model.md](data-model.md) for
the shapes referenced here.

## Prerequisites

- `pnpm install`; workspace deps built once (`pnpm --filter @keyboard-studio/contracts --filter @keyboard-studio/engine --filter @keymanapp/keyboard-lint run build`) so studio typecheck resolves engine `dist`.
- **Local Node ≥ 22 caveat**: studio tests using `localStorage` need
  `NODE_OPTIONS="--localstorage-file=$(pwd)/.ls-tmp.db"` (run from `packages/studio`);
  clean up with `rm -f .ls-tmp.db*`. CI on Node 22 is unaffected.

## 1. Extraction round-trips (FR-001, FR-002)

```bash
pnpm --filter @keyboard-studio/studio messages:extract
```

**Expect**: `en/messages.json` holds `{ "<id>": "<English>" }` (English as value);
each target locale has the same keys with translations or `""`. No source-graph
change ⇒ re-running is a no-op.

## 2. Drift gate catches an English edit (FR-006 — the core guarantee)

```bash
node utilities/i18n-catalog-lint/index.js          # -> [OK] … in sync (exit 0)
# edit any <Trans> English text WITHOUT re-extracting, then:
node utilities/i18n-catalog-lint/index.js          # -> [ERROR] [en] source catalog out of date — English changed: <id>  (exit 1)
pnpm --filter @keyboard-studio/studio messages:extract   # fix, then gate is green again
```

**Expect**: an edited English string under an unchanged id fails the gate (and
thus `pnpm lint` / CI) until re-extracted.

## 3. Locale switch renders a target locale (FR-003, FR-004, US1 AC2)

```bash
cd packages/studio && NODE_OPTIONS="--localstorage-file=$(pwd)/.ls-tmp.db" \
  pnpm exec vitest run src/components/LocaleSwitcher.test.tsx --no-file-parallelism ; rm -f .ls-tmp.db*
```

**Expect**: switching to `fr` renders the fr catalog (e.g. `Langue`), persists
`ks.locale=fr`, and `resolveInitialLocale()` then prefers the saved choice.
Manual: `pnpm dev`, open the app, use the NavBar language picker, reload — the
choice sticks.

## 4. Typecheck + full lint (includes the drift gate)

```bash
pnpm --filter @keyboard-studio/studio typecheck    # clean
pnpm lint                                           # eslint + depcruise + … + i18n-catalog-lint
```

## 5. Crowdin round-trip (once a project + credentials exist)

```bash
CROWDIN_PROJECT_ID=… CROWDIN_PERSONAL_TOKEN=… crowdin upload sources --dry-run -b main
```

**Expect**: the Tier A `messages.json` mapping resolves; no control-field strings
are offered (Tier B stays commented until the P2 extractor lands).

## Scope note

P1 (this slice) covers the studio UI chrome path. P2 (content strings) and P3
(region locales, ICU plurals audit, translator context, CI download→PR) are
validated by their own quickstarts when those slices are planned.
