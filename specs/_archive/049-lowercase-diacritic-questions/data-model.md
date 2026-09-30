# Data Model: lowercase-only diacritic questions

No persisted entities change. Both entities below are **derived** at survey time from the already
confirmed `ConfirmedAlphabet` (locked contract, untouched) — spec Assumptions: "the uppercase
attachments are derived display/output, not a new stored field."

## Entity — Folded base-letter view (display)

The list of base letters offered as choices in a mark-attachment question, after folding.

- **Source**: `ConfirmedAlphabet.bases` (all confirmed bases, in inventory order) + optional `bcp47`.
- **Rule** (mirrors the character step, spec 047 `PhaseB` `hiddenUppers`):
  - For each base `b`, compute `caseCounterpart(b, bcp47)`.
  - A base `u` is **hidden** iff `u` is the uppercase counterpart (`direction === "toUpper"` for its
    lowercase, i.e. `u` matches `\p{Lu}` and maps *to lower*) of some lowercase base that is **also
    present** in `bases`.
  - Every other base — lowercase, caseless, or an uppercase whose lowercase is absent — is **shown as
    entered** (edge cases: caseless script; uppercase-only base the author added).
- **Output**: `bases` minus the hidden-uppercase set, order preserved.
- **Validation**: caseless input yields an unchanged list (FR-004, SC-003); no uppercase duplicate of a
  present lowercase survives (FR-001, SC-001).

## Entity — Derived uppercase attachment (output)

The uppercase counterpart's mark attachment, produced from the lowercase answer rather than asked.

- **Source**: the author's `attachmentChecked` map `Record<mark, Record<base, boolean>>` + the
  confirmed `alphabet` + optional `bcp47`.
- **Rule**: for each checked `(base, mark)`, if `caseCounterpart(base, bcp47)` yields an uppercase
  counterpart (`direction === "toUpper"`) that is present in `alphabet.bases`, mark
  `(counterpart, mark)` checked too. Leave caseless bases and bases with no single-character
  counterpart untouched (FR-003, US2 AC2). Additive: never clears an existing check (FR-007).
- **Consumer**: `buildPlacementWorklist` reads the expanded map; its total-coverage invariant
  (`verifyWorklistCoverage`) is unaffected because the base set is unchanged.
- **Validation**: for every cased base ticked, its uppercase counterpart appears in the produced
  attachments/worklist (FR-002, SC-002).

## Entity — Case-pair count (affordance)

- **Source**: the folded base-letter view + `bcp47`.
- **Rule**: count of shown lowercase bases whose uppercase counterpart is present in `bases`.
- **Consumer**: `AttachmentStation.casePairCount` (the "Capital letters follow automatically" note).
- **Validation**: equals the number of lowercase bases with an uppercase counterpart (FR-005, SC-004).
