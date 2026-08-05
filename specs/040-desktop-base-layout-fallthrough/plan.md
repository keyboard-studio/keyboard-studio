# Implementation Plan — Spec 040: Desktop base-layout fall-through in the script facet

**Feature dir:** `specs/040-desktop-base-layout-fallthrough/` · **Governing:** spec.md §7 FR-007
amendment (desktop base-layout fall-through in produced evidence) · **Team:** Content (facet
definitions + classifier algorithm, spec §12) · **Size:** normal.

## Summary

On desktop, physical keys a keyboard does not remap fall through to the OS base layout, so a
non-Latin keyboard that leaves alphabetic keys un-blocked effectively emits a small sliver of
base-layout (Latin) output that the `script` classifier's rule-only histogram misses entirely.
This feature folds **un-blocked** base-layout characters into the classifier's produced evidence:
the leak source is always the deterministic host-environment default (`kbdus`) — a keyboard cannot
declare its own base layout, so any `baselayout('...')` context is a branch guard recorded in
`notes` only, never a leak-source override. The classifier enumerates the base-layout physical keys
and, for each key that **no rule names**, adds that key's `kbdus` character as a minor,
evidence-only entry in the script `distribution`. Blocked keys (`> nul`) and remapped keys
contribute nothing new. The leaked sliver never flips the dominant value. The work lives entirely in the tool-owned facet-index
utility (no engine, IR, or `buildProducedSet` changes) and forces a `script` classifier-version
bump + a deterministic recompute of the committed index.

## Project Structure

```
utilities/facet-index/
  base-layout.ts            (new) resolve declared/default base layout; enumerate
                                   base-layer vkeys named by rules; compute leaked keys
  base-layout.test.ts       (new) unit tests for resolution + un-blocked detection
  data/
    base-layouts.json       (new) pinned kbdus unshifted K_A..K_Z -> char table
  script-classifier.ts      (edit) fold leaked base-layout evidence into the histogram
                                   as distribution-only (dominant selected from rule evidence);
                                   record declared-vs-default in notes
  script-classifier.test.ts (edit) fixtures: un-blocked leak sliver, blocked nul,
                                   touch-unaffected regression, no dominant flip
  build-index.ts            (edit, if needed) record base-layouts.json in manifest referencePins
  freshness.ts              (edit) bump the script@N token in CLASSIFIER_VERSION (script@2 -> script@3)
                                   — the actual gate that forces the content-derived recompute

content/keyboard-facets/
  script.yaml               (edit) schemaVersion 1 -> 2; description note on fall-through
                                   (facet-def marker; not the freshness trigger)

docs/
  keyboard-facet-index.json (regenerated) full recompute after the classifier change
```

**Structure Decision.** All logic is added to the standalone `utilities/facet-index` tool. The
base-layout table is tool-owned pinned data (the tool is contracts-only and cannot import the
engine's `US_UNSHIFTED` map). `buildProducedSet` and the IR/codec are deliberately untouched — the
fall-through is a desktop-classification concern local to the `script` classifier, not a change to
the shared "glyphs the rules produce" contract.

## Constitution Check

| Principle | Assessment |
|---|---|
| I. Pattern schema locked | **PASS** — no `Pattern`/`Criterion` type touched; the facet schema is content-owned data, not a locked contract. |
| II. KeyboardIR is the spine | **PASS** — read-only over the existing IR (`baselayout` context elements + rule vkey contexts). No IR field added, no codec change, `buildProducedSet` unchanged. |
| III. Single working copy | **PASS** — offline batch tool over the `../keyboards` corpus; no working-copy or authoring path involved. |
| IV. Validator layering / one debounce | **PASS** — no validator, no studio debounce cycle touched. |
| V. VirtualFS only during authoring | **PASS** — no authoring FS involved; the tool emits a committed artifact, as it already does. |
| VI. Team boundaries | **PASS** — Content owns facet definitions, the classifier algorithm (037), and criteria triage. Change stays inside that boundary. |
| VII. Out of scope for v1 | **PASS** — no CJK/Ethiopic reorder, LDML, mobile, hosting, touch-first authoring. Desktop-only, by construction. |
| VIII. House conventions | **PASS** — `[OK]`/`[WARN]` console style, markdown-link file refs, `feat(tools)`/`feat(criteria)` commit style; no issue numbers in code. |

No violations — **Complexity Tracking omitted**. Re-checked after Phase 1 design: still PASS (no
new interface widens `classifyScript`'s pinned signature; base-layout resolution is an internal
helper).

## Phase 0 — Research

See [research.md](research.md). Resolves the spec's three open questions (base-layout table source
+ pin; precise "un-blocked" detection; evidence-only-vs-threshold) and the declared-vs-default
recording question, plus the determinism/freshness impact.

## Phase 1 — Design & contracts

- [data-model.md](data-model.md) — the `BaseLayoutTable` pinned entity, the leaked-evidence
  extension to `Categorization` (reuses `distribution` / `evidenceSize` / `notes`; no new fields),
  and the base-layer-key detection model.
- [contracts/base-layout-fallthrough.contract.md](contracts/base-layout-fallthrough.contract.md) —
  the `base-layouts.json` data-file schema and the leak-folding behavior contract (which
  identifiers are pinned: `distribution`, `evidenceSize`, `notes`, `provenanceTier`, and the
  `classifyScript(ir, def)` signature that must stay stable).

## Key decisions (rollup)

1. **Fall-through lives in the classifier, not `buildProducedSet`** — keeps the shared produced-set
   contract clean and the change out of the locked IR/engine surface.
2. **Un-blocked = no rule names the base-layer vkey** — one uniform detection over vkey context
   elements; `nul`/remap/guard all count as "named" and therefore do not leak.
3. **Leaked evidence is distribution-only** — visible sliver, dominant value selected from
   rule-produced evidence, so it can never flip the dominant script (spec success criterion).
4. **Base-layout table is tool-owned pinned JSON** (`kbdus` in v1), recorded in manifest
   `referencePins` — determinism with no environment lookup.
5. **Classifier-version bump + recompute** — the recompute is gated by the `script@N` token in
   `CLASSIFIER_VERSION` (`freshness.ts` → `scannerVersion`), so 040 bumps that token (baseline is
   already `script@2` at HEAD → `script@3`); `script.yaml` `schemaVersion 1 → 2` is the facet-def
   marker documenting the change, not the freshness trigger. Then a full deterministic regenerate of
   `docs/keyboard-facet-index.json` + re-lint.
