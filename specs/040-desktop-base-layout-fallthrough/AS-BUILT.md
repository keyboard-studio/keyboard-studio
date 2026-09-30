# Spec 040 Desktop base-layout fall-through in the script facet: as built

**Status:** Retired 2026-09-29. Shipped in PR #1185 (squash `f4756d1`, 2026-07-19). Tasks: 22/22 complete.
**Full docs:** [specs/_archive/040-desktop-base-layout-fallthrough/](../_archive/040-desktop-base-layout-fallthrough/) (spec, plan, tasks, research, data-model, contract, checklists). Not read by default.
**Pinned here:** none

## What shipped
- The `script` classifier now folds un-blocked desktop base-layout characters (the OS layout's fall-through) into the script `distribution` and `evidenceSize`, so a non-Latin keyboard that leaves `K_A` un-named shows a minor `Latn` entry.
- Carved out of spec 037 (its T012 / FR-007 amendment).
- `content/keyboard-facets/script.yaml` is `schemaVersion: 2`; `docs/keyboard-facet-index.json` was regenerated.

## Public contracts (as the code has them)
- `utilities/facet-index/base-layout.ts` exports: `loadBaseLayoutTable(path?)`, `resolveBaseLayout(ir) -> { family, charByVkey, branchesOn }`, `namedBaseLayerVkeys(ir)`, `hasBaseLayerRuleSurface(ir)`, `leakedChars(ir): string[]`, `BASE_LAYOUTS_PATH`, `DEFAULT_BASELAYOUT`.
- `classifyScript(ir, def)` signature is unchanged (`script-classifier.ts`); the fold block starts at the "Desktop base-layout fall-through fold (spec 040)" comment.
- Pinned table: `packages/contracts/data/base-layouts.json`, `{ "kbdus": { "K_A": "a", ... "K_Z": "z" } }`. Recorded (sha256) in the index manifest `referencePins`.
- Notes format written by the classifier: `base-layout: kbdus (default)` plus `; branches-on: <guards>` when rules carry `baselayout('...')` context tests.

## Key decisions
- A vkey is "named" (does not leak) when any base-layer rule context names it: remap, `> nul`, guarded or group-routed all count (research D2).
- Leaked evidence is distribution-only: the dominant `value` and `confidenceClass` are frozen from the rule-produced histogram before the fold, so a leak never flips or worsens a result (FR-004).
- Leak source is always the host default `kbdus`. `baselayout('...')` is a context test against a host-supplied store, not a keyboard declaration, so guards are an audit hint only (FR-005/006).
- `provenanceTier` stays `content-derived`; the leak is real desktop behavior.
- The table is pinned reference data, not the engine's `US_UNSHIFTED` constant (a TS constant cannot be sha-pinned).

## Gotchas and limits
- v1 scope is the unshifted alphabetic layer `K_A..K_Z` of `kbdus` only; no shifted/AltGr, no non-US families.
- No-op for touch-only IRs (`hasBaseLayerRuleSurface` false), and for keyboards that name every key: those records stay byte-identical to pre-040.
- Other classifiers reuse the fold: `added-char-count` and `orthography-coverage-ratio` union `leakedChars` into their produced sets.
- Desktop-only by construction; touch layouts are explicit and mobile assumes QWERTY.

## Divergences from the spec
- The contract says the table is `utilities/facet-index/data/base-layouts.json`; spec 052 (FR-016) relocated it to `packages/contracts/data/base-layouts.json` so the key-budget code reads the same bytes. Byte-identical, sha unchanged.

## Follow-ups and open issues
- Shifted/AltGr layers and non-US base families are unshipped.
- Comments in `utilities/facet-index/base-layout.ts` (line 11) cite `specs/040-.../research.md`, which is now under `_archive/` (km-programmer).
