# Contract: Punctuation defaults and invisible-character surface

The identifiers tests and tasks code against. This revision replaces the pre-plan
sketch: the plan adopted its intent and moved the surface to where the code already
keeps this kind of state (decisions D-01 to D-15 in [research.md](research.md)
Part II). Entity semantics are in [data-model.md](data-model.md).

Identifiers the spec pinned are used exactly as written there: `useSourcedExemplars`,
the `"punctuation"` tier, `buildProducedSet`, `computeInventoryDelta`, `inBaseOutput`,
`coverageComplete`, `inputs` / `writes`, phase `"C"`, and the code points and ranges
named in FR-007 and FR-013.

Nothing here renames or changes an existing field. No `packages/contracts` change.

## 1. Engine — `packages/engine/src/character-discovery/punctuationProposal.ts` (new)

Pure, browser-safe, no I/O. Exported from the root barrel `packages/engine/src/index.ts`
(no new package subpath).

```ts
/** U+0021–U+002F, U+003A–U+0040, U+005B–U+0060, U+007B–U+007E — 32 characters, frozen. */
export const ASCII_PUNCTUATION_FLOOR: readonly string[];

export interface BasePunctuationCoverage {
  produced: string[];        // NFC punctuation the base IR produces (glyphCategory === "punctuation")
  coverageComplete: boolean; // !hasUnaccountedOpaqueFragment(ir)
}
export function basePunctuationCoverage(ir: KeyboardIR): BasePunctuationCoverage;

export type CldrAbsentReason = "no-exemplars" | "empty-tier";

export interface PunctuationProposalInput {
  exemplars: SourcedInventory | null;       // from useSourcedExemplars(bcp47).inventory
  baseCoverage: BasePunctuationCoverage | null;
  rejected: ReadonlySet<string>;            // NFC keys — phaseBDraftStore.rejected
  authorChosen: ReadonlySet<string>;        // NFC keys whose provenance is "author"
}

export interface PunctuationProposal {
  cldrGroup: string[];                      // NFC
  baseGroup: string[];                      // NFC
  cldrAbsentReason?: CldrAbsentReason;
  baseCoverageIncomplete: boolean;          // true iff the floor was substituted
}
export function buildPunctuationProposal(input: PunctuationProposalInput): PunctuationProposal;
```

Also exported, from `packages/engine/src/inventory/computeInventoryDelta.ts`:

```ts
export function hasUnaccountedOpaqueFragment(ir: KeyboardIR): boolean;   // was module-private
```

**Invariants the implementation owes** (each is a colocated unit test):

- `cldrGroup ∩ baseGroup = ∅` by NFC (FR-010, SC-003).
- No member of either group is in `rejected` (FR-022) or `authorChosen` (FR-005).
- `baseCoverage !== null && coverageComplete` ⇒ `baseGroup` is every element of
  `produced` not already in `cldrGroup`, `rejected` or `authorChosen`; the floor plays no
  part (FR-009).
- `baseCoverage === null || !coverageComplete` ⇒ `baseGroup ⊆ ASCII_PUNCTUATION_FLOOR`
  and `baseCoverageIncomplete === true` (FR-007, FR-008). Floor and known set are never
  combined.
- `exemplars === null` ⇒ `cldrAbsentReason === "no-exemplars"`; non-null with an empty
  `"punctuation"` tier ⇒ `"empty-tier"`; otherwise undefined.
- **SC-001 oracle**: for every locale in the committed index whose `p` tier is
  non-empty, `buildPunctuationProposal({ exemplars: sourceExemplars(tag), baseCoverage:
  null, rejected: ∅, authorChosen: ∅ }).cldrGroup` equals
  `charactersInTier(inv, "punctuation")` NFC-deduped.

## 2. Draft store — `packages/studio/src/stores/phaseBDraftStore.ts` (extended)

```ts
export type DraftProvenance =
  | SourcedInventory["source"]   // "cldr" | "sldr"  (existing)
  | "author" | "text"            // existing
  | "base" | "ascii-floor";      // new

interface PhaseBDraftState {
  // existing: chars, punctuation, controls, provenance, rejected, …
  seededProposals: string[];                                   // new, sticky
  invisibleDecisions: Record<string, "accepted" | "declined">; // new, sticky; keys are "U+XXXX"

  /** Seed once per key through addWithProvenance; honours `rejected` and never
   *  downgrades "author". No-op when `seedKey` is already recorded. */
  seedProposals: (chars: readonly string[], source: DraftProvenance, seedKey: string) => void;
  acceptInvisible: (notation: string) => void;
  declineInvisible: (notation: string) => void;
  /** Carry-over (FR-017): every \p{Cf} character in `controls` becomes an accepted
   *  decision and is removed from `chars`. Idempotent. */
  adoptControlsAsInvisibles: () => void;
}

export interface PhaseBDraftSnapshot {
  // existing fields …
  seededProposals?: string[];
  invisibleDecisions?: Record<string, "accepted" | "declined">;
}

export function resetPhaseBDraftDecisions(): void; // now also clears seededProposals, invisibleDecisions
```

Sticky-class rules apply to both new fields: they survive `reset()`, are listed in the
`reset()` "deliberately SURVIVE" comment, are cleared only by
`resetPhaseBDraftDecisions()`, and round-trip through `snapshotPhaseBDraft()` /
`applyPhaseBDraftSnapshot()`.

## 3. Draft persistence — `packages/studio/src/lib/draftPersistence.ts` (fixed)

`applyEnvelopeToStores` passes the restored `phaseBDraft` snapshot through in full
(`rejected`, `provenance`, `proposalConfidence`, `exemplarMethodDeclined`,
`declaredRoles`, `seededProposals`, `invisibleDecisions`, plus the three fields it
already forwarded). Pinned by a round-trip test: save → clear stores → load → every
sticky field equal to what was saved.

## 4. Shared phase-C inventory — `packages/studio/src/survey/phaseCInventory.ts` (new)

```ts
/** nfcDedup of the draft's punctuation slice and the chars of accepted invisibleDecisions. */
export function phaseCConfirmedInventory(): string[];
```

Both `PunctuationStep` and `InvisiblesStep` emit
`{ phase: "C", answers, confirmedInventory: phaseCConfirmedInventory() }`. Pinned by a
test that records punctuation then invisibles then punctuation again and asserts the
phase-C `confirmedInventory` is the union after each step, and that the phase-B result
is untouched (FR-024).

## 5. Punctuation step — `packages/studio/src/survey/punctuation/PunctuationStep.tsx`

Behavioural contract additions; existing test ids (`punctuation-step`, `punctuation-done`,
`punctuation-back`, `proposed-punctuation-chip`, `authored-punctuation-chip`) unchanged.

| Surface | Identifier |
|---|---|
| CLDR group container | `data-testid="cldr-punctuation-group"` |
| Base group container | `data-testid="base-punctuation-group"` |
| CLDR-absent message | `survey.punctuation.cldrAbsent.noExemplars`, `survey.punctuation.cldrAbsent.emptyTier` |
| Base group captions | `survey.punctuation.baseGroup.caption`, `survey.punctuation.baseGroup.incompleteCaption`, `survey.punctuation.baseGroup.carveNote` |
| Missing-side count (FR-011) | `data-testid="punctuation-missing-count"`, id `survey.punctuation.missingCount` (ICU plural) |
| Format-character hand-off note (FR-016/021) | `data-testid="punctuation-handoff-note"`, `role="status"`, id `survey.punctuation.handoffNote` |
| Cluster-with-format-character decline | id `survey.punctuation.declinedCluster` |

Seeding: on `useSourcedExemplars` settling non-null, `seedProposals(tier, inventory.source,
"punctuation:" + inventory.resolvedTag)`; on base coverage resolving,
`seedProposals(baseGroup, coverageComplete ? "base" : "ascii-floor",
"punctuation-base:" + baseKey)`. Both skipped when a phase-C `confirmedInventory` already
exists (FR-023). The punctuation-scope `CharacterMapPane` code-point field applies the
same `/^\p{Cf}$/u` hand-off and announces it through the pane's existing live region.

## 6. Invisibles step — `packages/studio/src/survey/invisibles/` (new)

Manifest entry (`packages/studio/src/steps/manifest.ts`, between `punctuation` and
`convenience`):

```ts
{
  kind: "editor-step",
  id: "invisibles",
  title: "Invisible characters",
  spine: true,
  inputs: [],
  writes: [],
  component: InvisiblesStep,
  specRef: ["specs/075-punctuation-defaults"],
}
```

Same-file `expectedSpine` gains `"invisibles"` after `"punctuation"`; `phases.ts`
phase-C `stepIds` becomes `["characters", "marks", "punctuation", "invisibles", "convenience"]`;
`ActiveStepId` / `StepId` unions gain `"invisibles"`; `advance()` gains
`case "invisibles": return { next: nextSpineStepAfter("invisibles") }`; not in
`STEPS_WITH_APPLY_COMPLETION`; `journey-runner.ts` replay joins the
marks/punctuation/convenience case group.

```ts
// invisibleCandidates.ts
export type InvisibleRelevance = "always" | "rtl" | "carried-over";
export interface InvisibleCharacterCandidate {
  codePoint: number;
  notation: string;         // "U+200C"
  label: string;            // invisibleCharLabel(char) — non-empty
  needStatementId: string;  // "survey.invisibles.need.u200c"
  relevance: InvisibleRelevance;
}
export function invisibleCandidatesFor(args: {
  direction: "rtl" | "ltr" | "unknown";
  carriedOver: readonly string[];   // Cf chars currently in the draft's controls bucket
}): InvisibleCharacterCandidate[];
```

Always present: U+200D, U+200C, U+200B, U+00AD, U+2060. With `direction === "rtl"`:
every `isBidiControlCodePoint` code point, uncollapsed. With `"ltr"` or `"unknown"`:
the same bidi set, collapsed under `survey.invisibles.bidiGroup.collapsedNote`.

| Surface | Identifier |
|---|---|
| Step root / heading / continue / back | `data-testid="invisibles-step"`, `invisibles-heading`, `invisibles-continue`, `invisibles-back` |
| Candidate toggle | `data-testid="invisible-candidate-<hex>"` (e.g. `invisible-candidate-200c`), `role="checkbox"`, `aria-checked` |
| Heading / intro / none-needed | `survey.invisibles.heading`, `survey.invisibles.intro`, `survey.invisibles.noneNeeded` |
| Need statements | `survey.invisibles.need.u200d`, `.u200c`, `.u200b`, `.u00ad`, `.u2060`, and one per bidi code point |
| Stage labels | `footer.stage.invisibles`, `trail.stage.name.invisibles` |
| Label helper | `invisibleCharLabel("⁠") === "WORD JOINER"` |

Result: `{ phase: "C", answers, confirmedInventory: phaseCConfirmedInventory() }` with
`answers = candidates.map(c => ({ questionId: "invisibles." + c.notation.slice(2).toLowerCase()
padded to "uXXXX", answerType: "boolean", value: invisibleDecisions[c.notation] === "accepted" }))`.

E2E: `driveInvisiblesStep(page)` in `packages/studio/e2e/helpers/surveyFlow.ts` waits for
`invisibles-continue` (no race) and is called from `buildOneCharacterList` between
`drivePunctuationStep` and `driveConvenienceStep`.

## 7. Retired — Phase B modular flow (FR-019)

Deleted: `packages/studio/src/survey/questions/b/pb_rtl_direction_marks.ts`,
`pb_rtl_direction_marks_detail.ts`, and their `registry.b.ts` entries.
Rewired: `pb_rtl_short_vowels.next` → `"pb_rtl_special_letters"`.
Updated: `registry.test.ts` count 114 → 112; `content/i18n/{en,fr}/flowQuestions.json`
re-extracted; Phase B flow-edge snapshot regenerated.

## 8. Generated artefacts that must be committed with the change

`docs/spec-trace.json` (after `node utilities/spec-trace seed`, so
`specs/075-punctuation-defaults` is a valid `specRef`), `packages/studio/src/steps/manifest.specref.json`,
`docs/journey-coverage.json`, `packages/studio/src/locales/{en,fr}/messages.json`,
`packages/studio/tests/steps/__fixtures__/goldenWalk/{copy,adapt}.json`.

## 9. Observability harness (SC-004, SC-009)

`packages/studio/src/survey/surveyWriteObservability.test.tsx` drives each of U+200D,
U+200C, U+200B, U+00AD, U+2060 and every `isBidiControlCodePoint` code point through
(a) the punctuation type-in box, (b) the punctuation-scope code-point field, (c) the
invisibles step's toggle, and asserts for each that exactly one holds: it is in
`phaseCConfirmedInventory()`, or `invisibleDecisions[notation] === "accepted"` with the
hand-off note visible, or a `role="status"` / `role="alert"` element names it with a
reason. A character satisfying none fails the test.
