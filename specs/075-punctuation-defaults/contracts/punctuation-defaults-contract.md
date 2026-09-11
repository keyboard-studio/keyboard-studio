# Contract: Punctuation defaults and invisible-character surface

The identifiers below are what downstream code and tests will code against.
Proposed, not implemented — this document is the surface the plan stage will
either adopt or argue with. Entity semantics are in
[data-model.md](../data-model.md); the requirements they satisfy are in
[spec.md](../spec.md).

Nothing here renames or changes an existing field. The punctuation step's
result shape is unchanged, including its `phase: "C"` reporting (FR-024).

## 1. Proposal provenance (`packages/contracts/src`, new)

```ts
export type ProposalProvenance =
  | { kind: "cldr-exemplar"; locale: string; side: "cldr" | "sldr" }
  | { kind: "base-produced" }
  | { kind: "ascii-floor" };

export interface ProposedCharacter {
  char: string;
  nfc: string;
  provenance: ProposalProvenance[]; // non-empty; several when several sources agree
  group: "cldr" | "base";
}
```

`nfc` is the identity key. Merging two proposals for the same character unions
`provenance` and keeps one entry (FR-010, FR-010).

## 2. Building the proposal

```ts
export interface PunctuationProposalInput {
  exemplars: SourcedExemplars | null;   // existing, from useSourcedExemplars(bcp47)
  baseCoverage: BasePunctuationCoverage | null;
  rejected: ReadonlySet<string>;        // nfc keys, from the rejection ledger
  authorChosen: ReadonlySet<string>;    // nfc keys the author entered by hand
}

export interface PunctuationProposal {
  cldrGroup: ProposedCharacter[];
  baseGroup: ProposedCharacter[];
  cldrAbsentReason?: "no-exemplars" | "empty-tier"; // distinct cases, spec edge cases
  baseCoverageIncomplete: boolean;                   // FR-008
}

export function buildPunctuationProposal(
  input: PunctuationProposalInput,
): PunctuationProposal;
```

Pure. No I/O, no store access — so the zero-interaction outcome in SC-001 is
testable as a function call per language tag rather than through the UI.

**Invariants the implementation owes** (each maps to a spec requirement):

- `cldrGroup` and `baseGroup` are disjoint by `nfc` (FR-010, SC-003).
- No member's `nfc` is in `rejected` (FR-022).
- No member's `nfc` is in `authorChosen` (FR-005).
- `baseCoverage` present and complete implies `baseGroup` is every punctuation
  character in `baseCoverage.produced`, minus rejections — not a subset, and not
  unioned with the floor (FR-009).
- `baseCoverage === null`, or `coverageComplete === false`, implies `baseGroup`
  is exactly `ASCII_PUNCTUATION_FLOOR` minus rejections (FR-007, FR-008). The
  floor and a known base set are alternatives, never combined.
- `cldrAbsentReason` distinguishes a tag that resolved nothing from a locale
  whose punctuation tier is empty — the two are different edge cases and must
  not collapse into one message.

## 3. Base punctuation coverage

```ts
export interface BasePunctuationCoverage {
  produced: string[];        // normalized punctuation the base IR produces
  coverageComplete: boolean; // false when opaque fragments make output unknowable
}

export function basePunctuationCoverage(
  delta: InventoryDelta,       // existing, from computeInventoryDelta
): BasePunctuationCoverage;
```

Derived from the existing `inBaseOutput` stamp
(`packages/contracts/src/characterDiscovery.ts:85`) and the existing
`coverageComplete` flag
(`packages/engine/src/inventory/computeInventoryDelta.ts:35-58`). This adds a
consumer, not a computation (FR-006).

## 4. The ASCII fallback floor

```ts
export const ASCII_PUNCTUATION_FLOOR: readonly string[]; // 32 characters
```

U+0021–U+002F, U+003A–U+0040, U+005B–U+0060, U+007B–U+007E. A frozen constant,
and a fallback rather than a policy: substituted for the base group only when
base coverage cannot be determined (FR-007).

## 5. Invisible characters

```ts
export interface InvisibleCharacterCandidate {
  codePoint: number;
  notation: string;      // "U+200C", matching linguistInventory's existing notation
  label: string;         // non-empty
  needStatement: string; // non-empty, one line
  relevance: InvisibleRelevance;
}

export type InvisibleDecisionState = "accepted" | "declined";

export interface InvisibleCharacterDecision {
  codePoint: number;
  state: InvisibleDecisionState;
}

export function invisibleCandidatesFor(
  script: string,
  direction: "ltr" | "rtl",
): InvisibleCharacterCandidate[];
```

The candidate list always includes ZWJ U+200D, ZWNJ U+200C, ZWSP U+200B, SOFT
HYPHEN U+00AD and WORD JOINER U+2060 (FR-013), and draws further RTL candidates
from the existing bidi allowlist
(`packages/engine/src/character-discovery/CharacterDiscoveryServiceImpl.ts:109-117`).

**Label map extension.** `INVISIBLE_CHAR_LABELS`
(`packages/studio/src/lib/irToCarveNodes.ts:183-204`) gains a U+2060 WORD JOINER
entry (FR-015). It is the only codepoint in the required set with no existing
label, and it appears nowhere in the repository today.

**Subsumption.** This surface replaces the advisory RTL-only question at
`packages/studio/src/survey/questions/b/pb_rtl_direction_marks_detail.ts:7-35`
rather than sitting beside it (FR-019). Its two characters — U+200F and U+200E —
become candidates here.

**Routing.** The punctuation step's "Skipped" path
(`PunctuationStep.tsx:166-167`, `:346-353`) is replaced by a route to this
question with the typed character pre-selected (FR-016). Nothing in the survey
may discard a typed character without a stated reason (SC-004).

## 6. Rejection ledger

```ts
export interface RejectionLedger {
  rejected: ReadonlySet<string>; // nfc keys
}

export function recordRejection(ledger: RejectionLedger, nfc: string): RejectionLedger;
export function clearRejection(ledger: RejectionLedger, nfc: string): RejectionLedger;
```

`clearRejection` is what an author typing the character in by hand triggers
(FR-022). The ledger is scoped to the keyboard being authored and survives step
revisits and language-tag re-resolution (SC-006).

## 7. Open on this surface

`baseGroup`'s content is **settled**: every punctuation character the base can
produce, with the floor substituted only where coverage is unknown (FR-009,
decided 2026-09-09). What remains provisional:

- Whether the invisible-character question is a spine step or a side trail
  changes where `invisibleCandidatesFor` is called from, and whether a manifest
  entry exists at all (FR-020).
- Whether the pane's code-point entry field stays on the punctuation scope
  determines whether `RawCodepointEntry` remains a second route into the draft
  store from this page (FR-021).
- Whether the punctuation step begins declaring non-empty `inputs`/`writes`
  under the spec-066 declaration contract
  (`packages/studio/src/steps/types.ts:45-47`) changes its manifest entry at
  `packages/studio/src/steps/manifest.ts:148-161`, which declares both empty
  today. That question is recorded under the spec's Open decisions rather than
  as a clarification marker.
