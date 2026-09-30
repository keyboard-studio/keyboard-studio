# Data Model — Spec 040: Desktop base-layout fall-through

Entities this feature introduces or reshapes. It adds **no new persisted type** to
`@keyboard-studio/contracts` and **no new field** to `Categorization` — the leaked evidence rides
on existing fields. New structure is confined to the tool-owned base-layout table + an internal
resolution result.

## Entity 1 — BaseLayoutTable (new, pinned data)

Tool-owned reference data at `utilities/facet-index/data/base-layouts.json`. Maps a base-layout
family name to the unshifted BMP character each alphabetic physical key emits.

| Field | Type | Notes |
|---|---|---|
| `<family>` | object | Key is the normalized (lowercased) `baselayout('...')` value, e.g. `"kbdus"`. v1 ships exactly `kbdus`. |
| `<family>.<vkey>` | string (1 char) | Unshifted base-layout character for that vkey, e.g. `"K_A": "a"`. Keys are `K_A`…`K_Z` (v1 scope: alphabetic base layer only). |

Validation rules:
- Every value is a single BMP codepoint; no C0/DEL/space entries.
- The file is pinned by sha256 and recorded in `IndexManifest.referencePins` (freshness).
- Pure data — no environment/OS dependency, so resolution is deterministic.

## Entity 2 — BaseLayoutResolution (new, internal — not persisted)

The result of resolving which base layout applies to one keyboard, produced by
`base-layout.ts`. Never serialized; consumed inline by the classifier.

| Field | Type | Notes |
|---|---|---|
| `family` | string | The leak-source family. **Always `"kbdus"`** in v1 — the host environment default (`DEFAULT_BASELAYOUT`); a keyboard cannot declare its own (see research Q-extra). |
| `charByVkey` | Map<string,string> | The family's vkey → character map (from Entity 1). |
| `branchesOn` | string[] | Non-empty `baselayout('...')` context-guard values found in the rules (normalized), for the `notes` audit hint. Empty when the keyboard has no base-layout branches. |

Resolution algorithm (pure over IR + pinned table):
1. Leak source is fixed to the environment default → `family: "kbdus"`, `charByVkey` from Entity 1.
2. Scan `ir.groups[*].rules[*].context` for `{ kind: "baselayout"; value }` elements; collect the
   distinct non-empty `value`s into `branchesOn` (audit hint only — does **not** change the leak
   source, since a guard is a conditional test, not a declaration).

## Entity 3 — Base-layer key classification (new, internal)

For each vkey in the resolved table, classify against the keyboard's rules to decide leakage:

| State | Detection | Effect on evidence |
|---|---|---|
| **Remapped** | A base-layer rule context names the vkey and the rule produces output. | Already counted by `buildProducedSet`; no leak. |
| **Blocked** | A base-layer rule context names the vkey but its output is producible-less (`> nul`). | No leak; contributes nothing. |
| **Un-blocked (leaks)** | **No** base-layer rule context names the vkey anywhere. | Adds `charByVkey[vkey]` as leaked evidence. |

"Base-layer" = the rule context's vkey modifiers are empty or `NCAPS`-only (mirrors `isBaseLayer`
in engine placement filters; the tool re-expresses this predicate locally, it cannot import it).
The named-vkey set is collected once per keyboard by walking all rule contexts.

## Entity 4 — Categorization extension (reshaped, no new fields)

The `script` classifier's `Categorization` (data-model of spec 036/037) carries the leak on
existing fields:

| Field | Change |
|---|---|
| `distribution` | Leaked base-layout characters are mapped to their ISO-15924 script and **added to the histogram**, so a leaked script appears as a minor `distribution` entry summing into the ~1 total. |
| `evidenceSize` | Increased by the count of leaked characters folded in (auditable). |
| `value` (dominant) | Selected from the **rule-produced (non-leaked) histogram only** — leaked evidence is distribution-only and can never flip the dominant script. |
| `confidenceClass` | Threshold computed on the rule-produced dominant share, so the leak cannot degrade `confident` → `mixed`. |
| `provenanceTier` | Stays `content-derived` — the leak is the keyboard's real desktop behavior, not a metadata fallback. |
| `notes` | Records the leak base layout + branch-awareness, e.g. `base-layout: kbdus (default)` or `base-layout: kbdus (default); branches-on: azerty`. |

State transition (recompute): bumping `script.yaml` `schemaVersion 1 → 2` invalidates every
affected desktop keyboard's `script` record; the freshness gate forces a full content-derived
recompute of `docs/keyboard-facet-index.json`, after which records are stable again.
