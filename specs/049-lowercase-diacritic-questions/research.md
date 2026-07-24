# Research: lowercase-only diacritic questions

## Decision 1 — Casing source of truth: the shared `caseCounterpart` fold, not a spec-048 IR facet

**Decision**: Determine "is this base an uppercase that duplicates a present lowercase?" the same way
the character step already does — per letter, via the engine primitive `caseCounterpart(char, bcp47)`
(`packages/engine/src/character-discovery/casePair.ts`) — and hide an uppercase base only when its
lowercase counterpart is actually present in the confirmed bases. Extract the fold used inline in
`PhaseB.tsx` into a shared helper in `packages/studio/src/survey/charNormUtils.ts` and consume it from
both the character step and the marks step, giving FR-006 a single source of truth.

**Rationale**: FR-006 asks for one casing signal shared with the character step. The character step
(spec 047) does not read a boolean "cased" facet; it folds per-letter with `caseCounterpart` and hides
an uppercase only when its lowercase is present (`PhaseB.tsx` `hiddenUppers`; `CharacterMapPane.tsx`
`filteredGroups`). Matching that exact rule keeps the two steps consistent by construction and is
caseless-safe: `caseCounterpart` returns `null` for caseless scripts, so nothing is folded (FR-004).

**Alternatives considered**:
- *Read the casing facet baked into the IR (spec 048 / #1347).* Rejected as the mechanism today: spec
  048 is Draft with no landed code — the contracts IR carries no `casing` facet. The spec's Assumptions
  explicitly permit the interim path ("derives casing from the same shared helper in the interim"). When
  the facet lands, the shared helper is the natural place to switch the signal without touching callers.
- *A per-question ad-hoc guess.* Rejected by FR-006 (no per-question re-derivation).

## Decision 2 — US2 uppercase attachments: a new pure engine helper reusing `caseCounterpart`

**Decision**: Add a pure engine helper `expandCaseCounterpartAttachments(alphabet, attachments, bcp47)`
(`packages/engine/src/marks/case-fold.ts`) that, for every checked `(base, mark)`, also marks the
uppercase counterpart checked when that counterpart is (a) an uppercase of the base and (b) present in
`alphabet.bases`. `MarksSeriesStep` runs the author's `attachmentChecked` through it before
`buildPlacementWorklist`, so the produced worklist covers accented capitals (US2, FR-002).

**Rationale**: `buildPlacementWorklist` already iterates all `alphabet.bases` and reads
`attachments[mark][base]`; uppercase bases remain in the alphabet, only hidden from the *question*.
Expanding the answers just before the builder keeps the builder's total-coverage invariant
(`verifyWorklistCoverage`) intact and puts the casing mechanism in the engine. The helper reuses the
existing `caseCounterpart` primitive — it introduces no new case-mapping rule (Assumptions:
"no new casing logic").

**Alternatives considered**:
- *Reuse `deriveCaseCounterparts` unchanged.* Rejected: it keys on `attestedStacks` only and returns a
  stack→counterpart map, so it cannot carry a *plausible-accepted* or *newly ticked* lowercase answer to
  its uppercase — exactly the case US2 must not lose. `deriveCaseCounterparts` stays as the display-count
  input; the new helper covers the live answers. (Both call the same `caseCounterpart` primitive.)
- *Toggle the uppercase inside the studio `onToggle` handler.* Rejected: it scatters casing logic into
  UI event handling and drifts on re-seed (FR-023); a single pure transform at build time is
  deterministic and testable.
- *Fold counterparts inside `buildPlacementWorklist`.* Rejected: it would push locale/casing concerns
  into the coverage builder and complicate its invariant; a discrete pre-step is clearer.

## Decision 3 — "Capitals follow automatically" count reflects the displayed lowercase bases

**Decision**: Compute the affordance count from the displayed lowercase base view: the number of shown
lowercase bases that have an uppercase counterpart present in the confirmed bases (a shared helper
`casedBaseCount`/equivalent in `charNormUtils.ts`), and pass that to `AttachmentStation.casePairCount`
in place of `deriveCaseCounterparts(...).size`.

**Rationale**: SC-004 pins the count to "the number of lowercase bases that have an uppercase
counterpart." `deriveCaseCounterparts(...).size` counts attested *stacks* with a cased base, which does
not equal the lowercase-base count once the list is folded. Deriving the count from the same folded view
the question renders keeps FR-005/SC-004 exact and the note honest.

**Alternatives considered**: keep `casePairs.size` — rejected, it can diverge from the displayed list
(counts stacks, not bases), breaking SC-004.
