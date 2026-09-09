# Data Model: Punctuation defaults and the invisible-character question

Entities this feature introduces or extends. Companion to [spec.md](spec.md);
the identifier-level surface is in
[contracts/punctuation-defaults-contract.md](contracts/punctuation-defaults-contract.md).

Nothing here changes the punctuation step's result shape beyond what FR-024
permits — the `phase: "C"` reporting stays exactly as it is, because a phase
`"B"` result is shallow-merged over the alphabet step's `confirmedInventory`
(`packages/studio/src/survey/punctuation/PunctuationStep.tsx:14-26`,
`:75-77`).

## `ProposedCharacter`

One character the studio puts into the chosen list on the author's behalf. Not a
separate list from author-chosen characters — the same list, distinguished by
provenance (FR-002).

| Field | Type | Notes |
|---|---|---|
| `char` | `string` | The character as proposed. |
| `nfc` | `string` | Normalized form used for identity and de-duplication (FR-010), matching what `phaseBDraftStore` already stores (`packages/studio/src/stores/phaseBDraftStore.ts:326-345`). |
| `provenance` | `ProposalProvenance[]` | Non-empty. Several entries when several sources proposed the same character (FR-002, FR-010). |
| `group` | `"cldr" \| "base"` | Which rendered group the character belongs to. A character with both provenances renders once, in one group; which one is a UI ordering rule, not a second entity. |

**Validation rule**: two `ProposedCharacter` entries with the same `nfc` MUST
NOT both be rendered or counted (FR-010). Merging is by `nfc`, unioning
`provenance`.

**Not an entity**: an author-typed character. It has no `provenance` and is never
converted into one (FR-005).

## `ProposalProvenance`

Why a character was proposed. Drives the visible attribution and de-duplication.

| Variant | Carries | Notes |
|---|---|---|
| `cldr-exemplar` | resolved locale tag, side (`cldr` or `sldr`) | From the punctuation tier — `charactersInTier(inventory, "punctuation")` at `PunctuationStep.tsx:153-158`, tier key `p` per `packages/engine/src/character-discovery/exemplarSource.ts:45-50`. Reuses the existing spec-044 proposed attribution rendered at `PunctuationStep.tsx:384-387`. |
| `base-produced` | nothing beyond the variant | The character is in the base IR's produced set and stamped `inBaseOutput` (`packages/contracts/src/characterDiscovery.ts:85`). |
| `ascii-floor` | nothing beyond the variant | Supplied by the constant floor, not derived. Applies only when base coverage cannot be determined (FR-007). |

## `BasePunctuationCoverage`

The punctuation subset of the base keyboard's produced-glyph set. Derived from
existing machinery — `buildProducedSet`
(`packages/engine/src/inventory/producedGlyphs.ts:35-40`) and
`computeInventoryDelta`
(`packages/engine/src/inventory/computeInventoryDelta.ts:84-110`) — not from a
new base analysis (FR-006).

| Field | Type | Notes |
|---|---|---|
| `produced` | `string[]` | Punctuation characters the base IR produces, normalized. |
| `coverageComplete` | `boolean` | False when opaque `RawKmnFragment` nodes make the base output unknowable (`computeInventoryDelta.ts:35-58`). |

**Validation rule**: when `coverageComplete` is false, `produced` is a **lower
bound**, never the answer. It MUST NOT be presented as a complete base set
(FR-008); the ASCII floor stands in for it rather than being merged into it.

**State**: recomputed whenever the base selection changes. Not persisted as an
answer — it is evidence, and only the author's confirmation is an answer.

## `AsciiPunctuationFloor`

A constant, not a derivation: U+0021–U+002F, U+003A–U+0040, U+005B–U+0060,
U+007B–U+007E. Thirty-two characters.

It is a **fallback, not a policy** (FR-007). It stands in for the base group
only where base coverage cannot be determined — an unresolvable base, or
incomplete coverage. Where the base set is known, the base set is the proposal
and the floor plays no part, whether the base set is wider or narrower.

Because it is a constant, it is the one proposal that cannot fail to be
computable, which is what lets the step always propose something.

The base group itself is settled: **every** punctuation character the base can
produce (FR-009, decided by the repo owner on 2026-09-09).

## `InvisibleCharacterCandidate`

One offerable format character on the new question (FR-013, FR-015).

| Field | Type | Notes |
|---|---|---|
| `codePoint` | `number` | The character. |
| `notation` | `string` | `U+XXXX` form, matching how `directionControlChars` is already stored (`packages/contracts/src/linguistInventory.ts:155`, `:181`). |
| `label` | `string` | Plain-language name. Seeded from `INVISIBLE_CHAR_LABELS` (`packages/studio/src/lib/irToCarveNodes.ts:183-204`), which today covers SPACE, ZWSP, ZWNJ, ZWJ, ZWNBSP, SOFT HYPHEN, CGJ, MVS. |
| `needStatement` | `string` | One line: "you need this if…". No existing source; authored per candidate. |
| `relevance` | script or condition | Why this candidate is offered to this author. Drives the "propose none, and say why" case in Story 3 Scenario 5. |

**Validation rule**: `label` and `needStatement` MUST both be non-empty for every
offered candidate (SC-005). A codepoint added without an explanation fails the
completeness assertion rather than rendering bare.

**Known gap**: U+2060 WORD JOINER has no entry in `INVISIBLE_CHAR_LABELS` and
appears nowhere in the repository. FR-015 requires adding it.

**Overlap**: the bidi allowlist at
`packages/engine/src/character-discovery/CharacterDiscoveryServiceImpl.ts:109-117`
supplies further candidates for RTL scripts. FR-019 requires this entity to
subsume the two characters offered by the existing advisory question
(`packages/studio/src/survey/questions/b/pb_rtl_direction_marks_detail.ts:7-35`),
not duplicate them.

## `InvisibleCharacterDecision`

The author's answer, per candidate. Distinguishing a decline from an unasked
question is the point (FR-017).

| Field | Type | Notes |
|---|---|---|
| `codePoint` | `number` | The candidate decided. |
| `state` | `"accepted" \| "declined"` | A candidate absent from this record was never offered, which is not the same as declined. |

Accepted characters enter the confirmed inventory distinguishably from
punctuation (Story 3 Scenario 4). The `controls` bucket already derived at
`phaseBDraftStore.ts:94-97`, `:342-343`, `:355-358` is the natural home and has
no consumer today.

## `RejectionLedger`

Proposals the author removed. Consulted before proposing, so a rejection sticks
(FR-022).

| Field | Type | Notes |
|---|---|---|
| `rejected` | set of `nfc` strings | Keyed by the same normalized form used for de-duplication, so a rejection matches a re-proposal from any source. |

**Scope**: the keyboard being authored. Durable across step revisits and across
language-tag re-resolution (Story 4 Scenarios 1 and 2).

**State transitions**:

- absent → `rejected`: the author removes a proposed character.
- `rejected` → absent: the author types that character in by hand, which
  overrides the rejection (FR-022, Story 4 Scenario 3).

**Validation rule**: a rejection MUST NOT resurrect a character, and MUST NOT be
treated as evidence that the character should be proposed. A rejection for a
character no source proposes any more is inert, and the edge-case list requires
it not to accumulate unboundedly.

**Migration rule**: an author who completed the step before this feature shipped
has an empty ledger and a saved answer. FR-023 requires the saved answer to win
— the absence of a rejection MUST NOT be read as permission to propose over an
existing confirmed inventory.

## Reused, unchanged

Read but not modified by this feature:

- `sourceExemplars()` / `charactersInTier` (`exemplarSource.ts:202`, `:238-240`)
  and the committed index
  `packages/engine/src/character-discovery/generated/exemplars.generated.json`.
- Confidence gating, the macrolanguage blocklist, and `chooseSide()`
  (`exemplarSource.ts:87+`, `:67`, `:157-168`).
- `isAlwaysKeepCategory` (`packages/studio/src/lib/irToCarveNodes.ts:2056-2058`)
  — carve's behaviour is out of scope; only the declared inventory changes.
- `glyphCategory` (`packages/engine/src/character-discovery/glyphCategory.ts:36`,
  `:20`, `:39-41`) — the classification that routes invisibles away from
  punctuation stays as it is; what changes is where they are routed to.
