# Quickstart: Per-Keyboard Facet Index

Runnable validation scenarios that prove the feature works end-to-end. Each maps to a spec Success
Criterion or User Story. Implementation detail lives in [data-model.md](data-model.md) and
[contracts/](contracts/); this is the run/verify guide.

## Prerequisites

- Sibling keyboards checkout present at `../keyboards` (the phonebook convention). `release/**` is the
  scope.
- Unicode 17.0.0 UCD files present under `lib/ucd/` (already vendored in this repo).
- `pnpm install` done; `pnpm run prebuild` run at least once (langtags/recognizer codegen).

## Setup — pin + generate the UCD lookup (once, and on Unicode bumps)

```bash
# Verifies lib/ucd/{Scripts,ScriptExtensions,PropertyValueAliases,Blocks}.txt against
# scripts/ucd-version.json (SHA-256), then codegens the slim committed lookup.
node utilities/facet-index/ucd/codegen-ucd.mjs
```

Expected: `[OK] UCD 17.0.0 verified (4 files)`, generated
`utilities/facet-index/ucd/generated/scriptLookup.ts`, and `utilities/facet-index/data/SOURCES.json`
recording per-file hashes. A hash mismatch fails loud (`[ERROR] ...`), never proceeds.

## Scenario A — Build the index (US1 / SC-001)

```bash
npx tsx utilities/facet-index/cli.ts            # full build
```

Expected:
- `docs/keyboard-facet-index.json` written; `docs/keyboard-facet-index.md` companion written.
- Console: `[OK] N keyboards, M facets, 100% coverage` where `N === manifest.keyboardCount`.
- **SC-001 check**: every keyboard has a `facets.script` record — zero silent omissions. Enforced by the
  build (a missing facet ⇒ `[ERROR]`, exit 1) and re-checked by lint X3.

## Scenario B — Look up a keyboard (US1 acceptance 1-3)

Read the artifact (no studio, no network, no corpus checkout needed — FR-007):

```bash
node -e "const i=require('./docs/keyboard-facet-index.json'); \
  const k=i.keyboards['<arabic-script-kbd-id>'].facets.script; \
  console.log(k.value, k.distribution, k.provenanceTier, k.confidenceClass)"
```

Expected:
1. An Arabic-script keyboard → `value: 'Arab'`, distribution dominant on `Arab`, `provenanceTier:
   'content-derived'` (US1 acceptance 1).
2. A keyboard the classifier could not analyze → record still present, `provenanceTier` is
   `declared-metadata` or `default-fallback`, `analysisOutcome: 'fallback-only'` (US1 acceptance 2).
3. Looking up an undefined facet id → explicit "unknown facet id" error from the reader helper, never a
   silent empty (US1 acceptance 3).

## Scenario C — Add a new facet without reshaping records (US2 / SC-003)

```bash
cp content/keyboard-facets/script.yaml content/keyboard-facets/trivial-bool.yaml
# edit id/valueType=enum/limits.values=[true,false]/derivation.archetype=declared-metadata
git stash -- docs/keyboard-facet-index.json     # keep the pre-add baseline
npx tsx utilities/facet-index/cli.ts
git diff --stat docs/keyboard-facet-index.json
```

Expected (SC-003):
- Every keyboard gains exactly one new key `facets['trivial-bool']`.
- Every **prior** `facets.script` record is byte-identical (diff shows only additions, no script-record
  changes). Enforced by a `*.test.ts` that diffs prior-facet JSON before/after.
- An out-of-limits value from a mis-implemented classifier fails the build loud (US2 acceptance 2 /
  contract X1) — never silently recorded.

## Scenario D — Determinism + incremental rescan (US3 / SC-004)

```bash
npx tsx utilities/facet-index/cli.ts            # build 1
cp docs/keyboard-facet-index.json /tmp/idx1.json
npx tsx utilities/facet-index/cli.ts            # build 2, unchanged corpus
diff /tmp/idx1.json docs/keyboard-facet-index.json     # expect: no output (byte-identical)

# touch one keyboard's source, incremental rebuild
touch ../keyboards/release/<vendor>/<id>/source/<id>.kmn   # (or make a real edit)
npx tsx utilities/facet-index/cli.ts --incremental
git diff --stat docs/keyboard-facet-index.json
```

Expected (SC-004 / US3):
- Unchanged-corpus rebuild is byte-identical (determinism, FR-006).
- One-keyboard change touches only that keyboard's records + the manifest (`corpusCommit`,
  `facetCoverage`); all other keyboards carry forward via their unchanged `sourceHashes`.
- Bumping `scannerVersion` or `unicodeVersion` (in the pin) forces a full content-derived recompute on the
  next run (US3 acceptance 3) — verify by bumping and confirming all content-derived records re-emit.

## Scenario E — Repo lint validates the committed artifact (FR-008)

```bash
pnpm lint        # includes the new facet-index-lint as the final chain step
```

Expected:
- `[OK] facet-index-lint` when the committed artifact matches definitions and passes contract X1-X7.
- Hand-edit `docs/keyboard-facet-index.json` to insert an out-of-limits script value → `pnpm lint` exits
  non-zero naming the offending keyboard + facet (contract X1). Revert to restore green.

## Scenario F — Session-facet sourcing is nameable (SC-005)

Confirm at least 4 `planned` `corpus:` derivations can name a concrete index field (research D8):
`lineage.strategy-fingerprint`, `env.device-mix`, `community.multi-orthography`,
`lineage.nearest-neighbors`. This feature does **not** flip them to `available` (that is the follow-up
wiring feature) — the check here is that each names an index field that now exists.

## Definition of done for the plan's validation

- [ ] Scenario A: full build, 100% coverage, both artifacts written.
- [ ] Scenario B: offline lookup returns value + distribution + tier + freshness for Arabic and Latin
      keyboards; SC-002 hand-verified sample (≥20 keyboards, ≥5 scripts) ≥95% dominant-script agreement.
- [ ] Scenario C: byte-diff-clean prior facets on new-facet add.
- [ ] Scenario D: byte-identical rebuild; single-keyboard incremental touches only that record + manifest.
- [ ] Scenario E: lint catches an out-of-limits value.
- [ ] Scenario F: ≥4 session-facet derivations name a concrete index field.
