# Tooling reference

Build, test, lint, and E2E detail for the monorepo. [CLAUDE.md](../CLAUDE.md) carries the
short form — the commands you need to know without looking anything up. This file carries the
*why*: what each checker exists to catch, which artifacts are generated versus committed, and
which E2E specs are live.

Find things in here with `pnpm run spec-search "<query>"` rather than reading the whole file.

## Commands

Package manager is **pnpm 9** (Node **≥ 22.19.0**). Run from the repo root unless noted.

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Build everything | `pnpm build` (runs `prebuild` first) |
| Typecheck | `pnpm typecheck` |
| Test everything | `pnpm test` (`pnpm -r test` → each package's vitest) |
| Lint / format | `pnpm lint` · `pnpm format` (Prettier) |
| Architecture boundaries | `pnpm depcruise` |
| Crew-file consistency | `pnpm crew-lint` |
| Run the studio SPA | `pnpm dev` |
| Search the spec corpus | `pnpm run spec-search "<query>"` |
| Diagnose the Crowdin round-trip | `pnpm run crowdin:diagnose` |
| Sort Tier A catalogs | `pnpm run i18n-catalog-sort` |
| Normalize Tier B Crowdin catalogs | `pnpm run content-i18n-normalize` |

### Why the Node floor is 22.19

`@lingui/cli` uses `node:fs.globSync`, and its CLI entry is gated on `import.meta.main`, which
does not exist before 22.19. On an older Node every `lingui` subcommand exits 0 having printed
nothing and written nothing — `messages:extract` appears to succeed while producing no diff, and
`i18n-catalog-lint` then misreports every committed catalog as an orphan. The floor is in the
root [package.json](../package.json) `engines` and [.nvmrc](../.nvmrc).

### What `pnpm lint` actually runs

ESLint over `packages/*/src`, then in order:

- `pnpm depcruise` — dependency-cruiser fitness functions; cross-package layering / team-split /
  dependency-root rules in [.dependency-cruiser.cjs](../.dependency-cruiser.cjs).
- `pnpm crew-lint` — [utilities/crew-lint/index.js](../utilities/crew-lint/index.js), 7
  machine-enforced checks over `.claude/**/km-*` crew files: no python fences, no emoji, no
  phantom package paths, no line-number self-refs in km-triage.md, km-qc rubric agreement,
  roster consistency, sentinel spelling. The full check list is in
  [.claude/agents/km-README.md](../.claude/agents/km-README.md). Run it after touching any
  `.claude/**/km-*` file — every drift class it catches has shipped before.
- `pnpm run facet-lint` — [utilities/facet-lint/index.js](../utilities/facet-lint/index.js),
  plain-node checker over `content/facets/**` records.
- `pnpm run facet-index-lint` —
  [utilities/facet-index-lint/index.js](../utilities/facet-index-lint/index.js), validates
  `docs/keyboard-facet-index.json` against `content/keyboard-facets/*.yaml` per contract
  X1–X7 / C1–C5.
- `pnpm run adaptation-catalog-lint`
- `pnpm run i18n-catalog-lint` — drift **and** message-id key order of
  `packages/studio/src/locales/*/messages.json` (see Catalog sort order below).
- `pnpm run content-i18n-freshness` — tsx-run `utilities/i18n-content-extract/cli.ts --check`;
  freshness of `content/i18n/en/*.json` against a fresh extraction. Single-sources the
  `flowQuestions.json` freshness the plain-JS `content-i18n-lint` can't re-derive from TS-module
  question definitions (spec 073 T015).
- `pnpm run content-i18n-lint` —
  [utilities/content-i18n-lint/index.js](../utilities/content-i18n-lint/index.js), Tier B's
  counterpart to `i18n-catalog-lint`: checks `content/i18n/en/*.json` against a fresh extraction
  from the content records, plus target-locale key-set parity for any locale that has started
  translating a given catalog — including `flowQuestions.json` as a parity-only catalog
  (spec 046 T031, spec 073 T014).
- `pnpm run test-antipattern-lint` —
  [utilities/test-antipattern-lint/index.js](../utilities/test-antipattern-lint/index.js), bans
  `expect(true).toBe(true)`-style tautologies across all `packages/*/**/*.test.ts` and hardcoded
  survey question-order `.map((q) => q.id)).toEqual([…])` snapshots.
- `pnpm run token-lint` — [utilities/token-lint/index.js](../utilities/token-lint/index.js), bans
  hard-coded hex/rgb/hsl color literals in `packages/studio/src/**/*.ts(x)` against a baseline
  ratchet (see utilities/token-lint/README.md).

### Catalog sort order

`pnpm run i18n-catalog-sort`
([utilities/i18n-catalog-sort/index.js](../utilities/i18n-catalog-sort/index.js)) rewrites
`packages/studio/src/locales/<locale>/messages.json` in message-id order; `--check` reports
instead.

**Why order is enforced:** Lingui's default `orderBy` is `"message"`, so a new string lands
wherever its English text sorts — beside an unrelated area — and two branches that each add one
string collide on the same hunk, making every merge a hand-resolved "keep both sides".
[lingui.config.ts](../packages/studio/lingui.config.ts) now sets `orderBy: "messageId"` so
`messages:extract` emits that order, and this utility enforces it on the committed files because
extract is not the only writer (Crowdin downloads and hand edits are too). Its comparator
deliberately mirrors Lingui's own `orderByMessageId` (plain `localeCompare`) — a codepoint sort
disagrees on camelCase segments and the two would overwrite each other forever.

Not part of `pnpm lint` — it's the fix; the check half runs inside `i18n-catalog-lint`, which
imports `checkCatalogDir` from here so there is one definition of "sorted". Also called by
[crowdin-download-translations.yml](../.github/workflows/crowdin-download-translations.yml)
after the download.

### Crowdin round-trip helpers

`pnpm run crowdin:diagnose`
([utilities/crowdin-diagnose/index.js](../utilities/crowdin-diagnose/index.js)) is read-only;
needs `CROWDIN_PROJECT_ID` + `CROWDIN_PERSONAL_TOKEN`, network, and is **not** part of
`pnpm lint`. It answers "why does the download return English/empty?" by reporting per-locale
progress, root-vs-branch string placement, the file inventory, and the export settings, then
names one verdict with a fix. `pnpm run crowdin:diagnose:selftest` needs no credentials and
drives the script against a mock API.

`pnpm run content-i18n-normalize`
([utilities/content-i18n-normalize/index.js](../utilities/content-i18n-normalize/index.js))
mutates `content/i18n/<locale>/*.json`: any target value byte-identical to its `en/` source
becomes `""`, since Tier B (unlike Tier A's Lingui-compiled `messages.json`) falls back to
English at render time only on an empty value. Not part of `pnpm lint` — it's a fix, not a
check. Called by
[crowdin-download-translations.yml](../.github/workflows/crowdin-download-translations.yml)
between the Crowdin download and the commit/push step; see that workflow's header for why they
can't be one `crowdin/github-action` step.

## prebuild

**`prebuild` is not optional for a clean checkout.** `pnpm build` runs it automatically, but a
bare `tsc -b` inside a package will fail without it. It does codegen/fetch steps, all producing
build artifacts you should regenerate rather than hand-edit:

- `fetch-langtags` — downloads the pinned SIL `langtags.json` (MIT; SHA-256 pinned in
  [scripts/langtags-version.json](../scripts/langtags-version.json); raw file gitignored under
  `packages/engine/data/langtags/`).
- `codegen-langtags` — derives the slim lookup index into
  `packages/engine/src/langtags/generated/` from the downloaded data.
- `compile-recognizer-rules` — codegens `content/recognizer-rules/*.yaml` →
  `packages/engine/src/recognizer/rules/generated/*.ts`.
- `codegen-charnames` — derives a codepoint → Unicode NAME lookup (0x0020..0x2FFFF,
  algorithmic/range-marker names excluded) from the checked-in `lib/ucd/UnicodeData.txt` into
  `packages/engine/src/character-discovery/generated/charnames.generated.json`. ~1.4 MB,
  gitignored (see the directory-local `.gitignore` there) and regenerated by this prebuild step.
- `fetch-sldr` — downloads the pinned SIL SLDR source tarball (MIT; commit + tarball SHA-256
  pinned in [scripts/sldr-version.json](../scripts/sldr-version.json)) and extracts the locale
  tree to the gitignored `packages/engine/data/sldr/sldr/`; `LICENSE` + `SOURCES.json` beside it
  are committed. Fails loudly on a placeholder pin, a checksum mismatch, a truncated body, or an
  HTML error page served as a tarball.
- `codegen-exemplars` — bakes CLDR (`cldr-misc-full`, version pinned in
  [scripts/cldr-version.json](../scripts/cldr-version.json), integrity pinned by the pnpm
  lockfile) plus the SLDR extract into
  `packages/engine/src/character-discovery/generated/exemplars.generated.json` — the offline
  exemplar index behind [specs/044-cldr-sldr-exemplars/](../specs/044-cldr-sldr-exemplars/).
  ~1.2 MB and **committed** (unlike the two artifacts above — it is under the contract's 2 MB
  budget and its diff is the review surface when a pin is bumped). Regeneration from the same
  pins is byte-identical, and it validates every stored set through the engine's own
  `parseUnicodeSet`, imported from source under Node type stripping (importing the compiled
  module would be circular).

Not in the prebuild chain: `pnpm run check-exemplar-staleness` **reports** — never applies —
when either pin has fallen behind upstream, so a stale pin can't silently change the index under
a review. `node scripts/gen-exemplar-baseline.mjs` regenerates the pre-feature regression-floor
fixture; do that only alongside a CLDR pin bump, and review the diff. Also outside this chain:
`node utilities/facet-index/ucd/codegen-ucd.mjs` (the standalone facet-index tool's own UCD
codegen) additionally writes `packages/engine/src/facets/generated/scriptLookup.ts` from the same
parse as its primary output — a cross-workspace-boundary write (a `utilities/*` tool emitting
into a `packages/engine` package) done so the engine's casing facet
(`packages/engine/src/facets/casing.ts`, spec 048 FR-008) can never drift from the offline tool's
own script-identity data.

## Keyman compiler dependencies

The compiler wasm is **not** a prebuild artifact: it ships inside the `@keymanapp/kmc-kmn` npm
dependency (pinned in `packages/engine/package.json`; the pnpm lockfile is the version/integrity
source of truth), loaded at runtime as a sibling of that package's `wasm-host.js`. See
`packages/engine/src/compiler/index.ts` and `packages/studio/vite.config.ts`
(`optimizeDeps.exclude`).

The **package** compiler is a second, separate Keyman dependency: `@keymanapp/kmc-package`,
exact-pinned to the same `19.0.240-alpha` as `kmc-kmn`. It turns a `.kps` descriptor into an
installable `.kmp` and is **pure JS — no wasm** (jszip + marked +
`@keymanapp/{common-types,developer-utils}`, and the `kmp.json` schema validator is a
precompiled ajv standalone), so it needs no `optimizeDeps.exclude` entry and no network. See
`packages/engine/src/output/kmp.ts`. Keep the two versions in step when bumping either: they
share `common-types` / `developer-utils` at an exact pin.

## Running a subset of tests

The test script in each package is `vitest run`.

- One package: `pnpm --filter @keyboard-studio/engine test`
- Watch a package: `pnpm --filter @keyboard-studio/engine test:watch`
- One file: `pnpm --filter @keyboard-studio/engine test src/codec/parse.test.ts`
- One test by name: append `-t "round-trips"`

**Never run bare `vitest` at the repo root** — the root `vitest.config.ts` intentionally has an
empty `include`; tests only resolve through each package's own config.

Suites outside the pnpm workspace need their own invocation, and CI runs each explicitly:

- `/api` functions: `npx vitest run --config api/vitest.config.ts`
- i18n utilities: `pnpm run test:i18n-utilities`
- spec-trace: `pnpm run test:spec-trace`

## E2E

Playwright specs live under `packages/studio/e2e/`, run against the `playwright`
devDependency of `@keyboard-studio/studio`:

```
pnpm --filter @keyboard-studio/studio test:e2e
cd packages/studio && npx playwright test <spec>     # a single spec
npx playwright install chromium                       # once per version bump
```

E2E stays out of the unit CI lanes (vitest and tsc both exclude `e2e/**`). All specs import from
`"playwright/test"` — the `playwright` package's test entry; do not add `@playwright/test` as a
second runner package.

### Shared helpers

Survey prelude helpers are consolidated in
[packages/studio/e2e/helpers/surveyFlow.ts](../packages/studio/e2e/helpers/surveyFlow.ts) and
updated for the spec 036 language-identify flow (question order changed: `il_language_english`
is now the first question instead of `il_language_autonym`).

- A first-visit welcome-screen gate forces a fresh browser to the WelcomeScreen regardless of
  URL. `seedReturningVisitor(page)` seeds `localStorage["ks.visited"]="1"` via
  `page.addInitScript` before `page.goto` — **new walk specs must call it before navigating.**
- Tab switching goes through one shared step driver, `switchTab(page, route)` — no spec assigns
  `window.location.hash` inline. It selects by `nav a[href="#<route>"]`, never by visible label
  text, because the tab behind the `preview` ROUTE TOKEN is now labelled **Compare**. That token
  deliberately did not change: renaming it would break every existing bookmark and hash
  assertion.
- `selectMenuOption(page, trigger, value)` is the other shared driver — `ui/SelectMenu` portals
  its listbox to `document.body`, so an option is never a descendant of its trigger and a
  `xpath=..`-scoped query hangs until the test's own timeout.

Studio code exposes a flag-gated `window.__ksE2E__` test hook
([packages/studio/src/lib/e2eHook.ts](../packages/studio/src/lib/e2eHook.ts)), active only under
`VITE_E2E=1` or `?e2e=1`.

### Spec status (2026-07-16)

Live and passing:

- [carve.spec.ts](../packages/studio/e2e/carve.spec.ts)
- [copy-edit.spec.ts](../packages/studio/e2e/copy-edit.spec.ts)
- [touch-derivation-us1.spec.ts](../packages/studio/e2e/touch-derivation-us1.spec.ts) — spec 035
  US1, bambara import-and-adapt walk
- [touch-derivation-us2.spec.ts](../packages/studio/e2e/touch-derivation-us2.spec.ts) — spec 035
  US2, pid_piaroa reseed walk + the explicit-reseed AS4 variant; rewired onto the shared helpers
  and un-skipped
- [tab-roundtrip.spec.ts](../packages/studio/e2e/tab-roundtrip.spec.ts) and
  [compare-isolation.spec.ts](../packages/studio/e2e/compare-isolation.spec.ts) — spec 057's two
  gating specs, written and recorded RED against the pre-fix tree before the fix landed
  ([evidence](../specs/057-bulletproof-navigation/evidence/gating-red.md))
- [decision-deeplink.spec.ts](../packages/studio/e2e/decision-deeplink.spec.ts) and
  [footer-progress.spec.ts](../packages/studio/e2e/footer-progress.spec.ts)

Skipped, each with an un-skip recipe at the top of its file:

- `import-improve.spec.ts` — Track 2
- [touch-key-add-remove.spec.ts](../packages/studio/e2e/touch-key-add-remove.spec.ts) — spec 063
  T112 / SC-006. Written in full against the real test ids, but blocked until `TouchGallery.tsx`
  actually mounts the Phase 8 add/remove surfaces — it calls neither `useKeyCommands` nor
  `RemoveKeyDialog` today.

## Standalone utilities

`utilities/*` is deliberately kept out of `packages/*` so it doesn't trip `pnpm -r`. Run these
with `tsx` (see each tool's tsconfig) — except the plain-node ones (`spec-trace`,
`crowdin-diagnose`, `content-i18n-normalize`, and the `*-lint` checkers), which run under bare
`node`. Do not treat them as built workspace packages.

Inventory: kbgen, supportability-scanner, smoke-artifact, spec-trace, km-triage-app, hermes,
Template Cleanup, crowdin-diagnose, content-i18n-normalize, facet-index + facet-index-lint.

### spec-trace

Two halves over the same corpus:

- **Drift** — `node utilities/spec-trace check | report | acknowledge <id>` hashes each tracked
  unit (`spec.md` sections, `specs/NNN/spec.md`, `docs/architecture.md`, `docs/lens-model.md`)
  and flags un-acknowledged changes. `check` never exits non-zero; drift is a backlog item.
  Both `check` (auto-filed issue bodies) and `report` (a "Steps covered" coverage summary) join
  a drifted/tracked unit to the manifest steps and question modules that declare it as a
  `specRef` (spec 031) — read from `packages/studio/src/steps/manifest.specref.json`, a flat
  `{ [stepId | questionId]: string[] }` artifact regenerated on every `pnpm test` run by
  `packages/studio/src/steps/generateManifestSpecRef.test.ts` (a vitest hook, not a bare
  `tsx` script — `manifest.ts` pulls in editor components that use Lingui `<Trans>` macros,
  which only resolve through Vite's transform pipeline). Missing or stale, spec-trace logs a
  `[WARN]` and continues — the artifact is optional for backward compatibility (FR-010);
  spec-trace never imports `packages/studio` TS directly (FR-007).
- **Search** — `pnpm run spec-search "<query>"` runs BM25 retrieval over `specs/**` + `docs/**` +
  root `spec.md`/`README.md`, returning heading-level chunks with a `file:line` anchor. See
  [Searching the corpus](#searching-the-corpus) below.

### facet-index

[spec 070](../specs/070-keyboard-facet-index/) scans the sibling `../keyboards` corpus (the
`keyboard-studio/keyboards` fork) and emits the offline, deterministic
`docs/keyboard-facet-index.json` (+ `.md` companion) — a per-keyboard facet index.

- 036 landed the `script` facet.
- [Spec 037](../specs/037-facet-classifiers/) added `strategy-fingerprint` and `target-mix`.
- [Spec 041](../specs/041-construction-facet-classifiers/) added the thirteen **construction**
  classifiers — nine desktop `.kmn`/script facets + four `.keyman-touch-layout` facets — riding
  a shared shell (`cause-predicates.ts`, `measurement.ts`, the `.keyman-touch-layout` reader
  `touch-layout.ts`) plus the per-script input-facet derivation `display-difficulty.ts`
  (block-age from a pinned `DerivedAge.txt` join; feeds `content/facets/orth/display-difficulty.yaml`,
  validated by `facet-lint`).
- [Spec 043](../specs/043-base-selection-facets/) added the thirteen **base-selection &
  strategy** classifiers — four strategy-selector (`primary-strategy`, `added-char-count`,
  `platform-coverage`, `font-dependency`), four writing-system-matching
  (`diacritic-mechanism`, `combining-mark-repertoire`, `spare-key-budget`,
  `orthography-coverage-ratio`), and five eligibility/enricher (`license-fork-eligibility`,
  `directionality`, `script-family`, `declared-bcp47-tags`, `package-completeness`) — riding a
  shared `.kps`/LICENSE reader (`kps-reader.ts`) and three pinned datasets under `data/`
  (`cldr-exemplars.json`, `known-licenses.json`, `iso15924-script-family.json`).
  `script-family` is the durable guard `combining-mark-repertoire` keys on.
- [Spec 040](../specs/040-desktop-base-layout-fallthrough/) taught the `script` classifier to
  fold **desktop base-layout fall-through** — an un-named base-layer physical key falls through
  to the OS default (`kbdus`, pinned in `utilities/facet-index/data/base-layouts.json`), so its
  Latin char surfaces as a distribution-only sliver (recorded in `notes`, never a dominant
  flip); the fold is tool-local (no `buildProducedSet`/IR/codec change).

Classifiers live flat under `utilities/facet-index/*-classifier.ts`, registered as
`{ classify, fallback }` pairs in `DEFAULT_CLASSIFIERS` keyed by facet id. A facet YAML can land
ahead of its classifier (e.g. spec 039's construction facets); the default build fails loud on
such a def, and `--classified-only` builds the artifact scoped to facets that have a classifier
(how the shipped index is built today). `facet-index-lint` is its plain-node artifact validator,
wired into `pnpm lint`.

### kbgen

**Prototype**, lives in `utilities/kbgen/`. A standalone Node CLI that derives data-driven
character placement (which key, which mechanism) from pinned Unicode/CLDR signals and emits a
`placement-map.json`. Intended to become an engine deliverable (a seeder ahead of the survey,
§8 Phase B), but it is CommonJS/plain-JS, does not conform to the `packages/contracts` types,
and implements only S-01/S-08 of the §7.3 catalog. Conformance path + open joint-session
questions: [utilities/kbgen/INTEGRATION.md](../utilities/kbgen/INTEGRATION.md). Do not treat it
as a built package.

## Searching the corpus

`specs/**` + `docs/**` is ~5.4 MB across ~430 markdown files. Reading a whole `spec.md` to find
one requirement costs ~3k tokens; a budgeted search costs ~300.

```
pnpm run spec-search "remove key confirmation dialog"
pnpm run spec-search "kmp package output" --limit 8 --budget 3000
pnpm run spec-search "touch layout" --scope specs/063-touch-key-editor
pnpm run spec-search "layer A validity" --json
```

- Scans at query time (~250 ms cold, no index file), so results always reflect the working tree
  including uncommitted edits.
- Every hit carries `path:line` plus its heading breadcrumb. **Use the anchor** — if a snippet
  isn't enough, `Read` that file at that offset rather than opening the whole thing, or the
  search has cost tokens instead of saving them.
- Hits inside a spec-trace tracked unit are annotated with that unit's review status, e.g.
  `[partial, drifted]`.
- `--budget` is a hard cap on printed bytes (default 2048, minimum 256), enforced by dropping
  trailing hits; the header reports actual-of-budget every run. `CLAUDE.md` is excluded from the
  corpus — it is already in context, so a hit there would spend budget on text you can see.
