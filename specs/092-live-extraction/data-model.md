# Data Model: Live extraction from the starting point (specs/092-live-extraction)

No new persisted entities. This spec changes **when records are written and
what writes them**: the extraction pass writes decision records (088's entity)
after setup, and the step seeders that used to write their own shapes are
deleted. All types live in `packages/studio`; nothing in
`packages/contracts` changes.

## Decision record (088 FR-001 — the shape this spec writes)

| Field | Type | Written by 092 when |
|---|---|---|
| `id` | `DecisionId` | always — the decision the record resolves |
| `value` | typed per decision | the extracted value, the lookup default, or the author's kept answer |
| `provenance` | `"asked" \| "extracted" \| "default" \| "derived"` | `extracted` — value read from the starting point by `extract`; `default` — value from a lookup (langtags, GitHub profile) or a plain default; `derived` — per-item proposals inside a collection value (carve, via 090's shape) |
| `source` | `string?` | for `extracted`: the starting point's keyboard id (catalog id preferred, IR header fallback — the `runDecisionFlow` rule). For a lookup `default`: the lookup's name, using the names the seeders already use (`"langtags"`, `"identity"` for the stored author profile, `"base"` / `"analysis"` where the Phase F seeds used them) |
| `inputs` | snapshot of the decision's `requires` values | recorded at seed/decide time; for `copyright-holder` this includes `authoring-track`, which is what makes the track-dependent seeding (R5) auditable |
| `offered` | the extracted value, when the author has a different answer | set by the extraction pass when it runs over an already-answered decision (US2 scenario 2); rendered beside the author's value, never over it |
| `step` | step id | display metadata only (088) |

## The extraction pass (the one new behaviour)

**Trigger:** exactly once, immediately after the setup decision's `apply`
(FR-004) has instantiated the working copy. Not on a timer (D3 untouched —
the pass is synchronous work inside the setup commit), not per step.

**Inputs:** `buildExtractContext(baseIr, baseKeyboard)` — the 087 bundle
(parsed starting-point IR + catalog entry + langtags resolver), built from
the working-copy store's slots after instantiation.

**Algorithm (per module, in `orderByDependencies` order):**

1. Skip modules gated off by the current decision set.
2. Run `extract(ctx)` if the module declares one. A `null` result is absent.
3. Run the result through the module's `validate()`; a rejection is treated
   as absent (US2 scenario 3, 087 US1 rule). The question is asked normally.
4. Merge into `decisionStore`:
   - **Unanswered decision** → write the record
     (`extracted` + source, or the lookup `default` + named source).
   - **Already-answered decision** → keep the author's record untouched;
     set its `offered` to the extracted value.
   - **No extracted value and no lookup default** → write nothing. The
     question is asked normally; a missing value is never silently
     defaulted (spec edge case).
5. Lookup defaults participate in the same pass with the same record shape:
   a module either declares an `extract` (starting-point values) or a
   lookup default (langtags / profile / analysis / plain), per FR-002's
   conversion table in research.md R3.

**Idempotence:** running the pass twice over the same store and bundle
produces the same records (seeded records are overwritten with identical
values; `asked` records only gain/update `offered`). A second setup (a
genuinely different starting point) re-runs the pass — what that means for
kept answers is 093's recalculation semantics, not this spec's.

## Setup decision (FR-004)

| Aspect | Shape |
|---|---|
| Identity | the working-copy setup — `instantiate` in HANDOFF G7's wording (see research R4/OQ-2 for the id-vs-apply choice) |
| `requires` | `["base-keyboard", "authoring-track"]` |
| `apply` | instantiates the single working copy from the starting point (Track 1 `instantiateFromBase` / Track 2 `instantiateFromExisting`, mode derived from `authoring-track`), via 089's patch runner; runs once, with the track known |
| Retires | `StudioShell` `doCommit`'s mode re-derivation from a possibly-null `selectedTrack`, the second-commit adapt behaviour, and the restoring-boot re-commit hazard documented at `StudioShell.tsx` ~645–655 |

## `il_copyright_holder` after FR-005

| Aspect | Before 092 | After 092 |
|---|---|---|
| `provides` | `["copyright-holder"]` | unchanged |
| `requires` | `["author-name"]` | `["author-name", "authoring-track"]` |
| `extract` | `ctx.ir.header.copyright` | unchanged function; its *result's disposition* is track-dependent (research R5): adapt → seeds the record as `extracted`; copy → no extracted seed, D1 default-to-author applies |
| `validate` | none (blank = author, D1) | unchanged |

## Seeder → module mapping (FR-002, summary)

Full verified inventory in research.md R3. Shape rule: every converted
seeder produces decision records through the extraction pass (starting-point
values) or as lookup defaults in the same pass. No seeder keeps a private
store write: `IdentityLite`'s seed refs, `Prefill`'s computed rows,
`CharactersStep.confirmPrefill`, the `prefillCarveDispositions` store
action, and the `PHASE_F_SEEDS` table are all deleted as write paths
(rendering components may still read records to display).

## Validation rules (from the FRs)

- Extracted values pass `validate()` before they seed anything (FR-001,
  US2.3).
- Seeding writes only unanswered decisions; answered decisions gain
  `offered` only (FR-001, US2.2).
- Every seeded record names its source (FR-001, FR-003, US2.1).
- Setup runs once, after `authoring-track` settles, and only through
  `apply` (FR-004, US3).
- No record is written with a fabricated value: a missing starting-point
  value and a null base contribution both stay absent (spec edge case,
  US4).
