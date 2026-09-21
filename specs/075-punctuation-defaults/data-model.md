# Data Model: Punctuation defaults and the invisible-character question

Entities this feature introduces or extends, mapped onto where they actually live.
Companion to [spec.md](spec.md); the identifier-level surface is in
[contracts/punctuation-defaults-contract.md](contracts/punctuation-defaults-contract.md);
the reasons behind each mapping are decisions D-01 to D-15 in
[research.md](research.md) Part II.

Two things did not change and are pinned by test rather than trusted: the punctuation
step keeps reporting under `phase: "C"` (a phase `"B"` result would be shallow-merged
over the alphabet step's `confirmedInventory` — `PunctuationStep.tsx:14-26`,
`workingCopyStore.ts:1265-1273`), and every character identity below is the NFC form
the draft store already uses (`phaseBDraftStore.ts:297`, `:412`, `:532`).

## Where state lives

| Concern | Home | New or existing |
|---|---|---|
| Proposed / author-chosen distinction | `phaseBDraftStore.provenance` | existing, union widened |
| Rejection ledger | `phaseBDraftStore.rejected` | existing (spec 044 FR-017) |
| Seed-once marker | `phaseBDraftStore.seededProposals` | new |
| Invisible-character decisions | `phaseBDraftStore.invisibleDecisions` | new |
| Base coverage, floor, proposal groups | pure engine functions, recomputed per render | new, not stored |
| Confirmed phase-C inventory | `SurveyPhaseResult.confirmedInventory` via `recordPhase` | existing field, new union rule |
| Declined offers for reviewers | spec-053 decision record, fed from `SurveyPhaseResult.answers` | existing mechanism |
| Durability across reload | `PhaseBDraftSnapshot` inside the `ks.draft.<key>.v1` envelope | existing, restore path fixed |

## `ProposedCharacter` (derived, not stored)

A character in the draft's `chars` whose `provenance[nfc]` is anything other than
`"author"`. It sits in the same `punctuation` slice as author-typed characters and is
removed by the same `remove()` (FR-004); only attribution differs (FR-002).

| Aspect | Realisation |
|---|---|
| `char` / `nfc` | the `chars` entry; NFC is the identity key (FR-010) |
| primary provenance | `provenance[nfc]` — one `DraftProvenance` value, strengthen-only: `"author"` always wins, an existing proposal source is never overwritten by another (`phaseBDraftStore.ts:543-545`) |
| secondary attribution | derived at render: membership of `PunctuationProposal.cldrGroup` and `baseGroup`; a character in both is rendered once, in the CLDR group, with a "also produced by the base keyboard" marker (FR-002, SC-003) |

**Validation**: one rendered chip and one inventory count per `nfc` — guaranteed by
`nfcDedup` on `chars` and by the proposal builder's disjointness invariant.

**Not an entity**: an author-typed character. `add()` and `setAll()` are the only
writers of `"author"`, and no code path converts an author entry into a proposal
(FR-005).

## `DraftProvenance` (existing union, widened)

```ts
type DraftProvenance = "cldr" | "sldr" | "text" | "author" | "base" | "ascii-floor";
```

`"cldr"` / `"sldr"` come from `SourcedInventory["source"]` and are what `addProposed`
records today. `"base"` marks a character seeded from the base keyboard's produced
set; `"ascii-floor"` marks one seeded from the fallback constant. The locale a CLDR
proposal came from is not stored per character: the group caption reads it from the
live `SourcedInventory.resolvedTag` (FR-002's "with the resolved locale").

## `PunctuationProposal` (engine output, recomputed)

Returned by `buildPunctuationProposal(input)`; never persisted.

| Field | Type | Notes |
|---|---|---|
| `cldrGroup` | `string[]` (NFC) | the locale's punctuation tier minus `rejected` minus `authorChosen` |
| `baseGroup` | `string[]` (NFC) | every produced punctuation character (coverage complete) **or** the ASCII floor (coverage unknown), minus `rejected`, `authorChosen`, and `cldrGroup` |
| `cldrAbsentReason` | `"no-exemplars" \| "empty-tier" \| undefined` | `"no-exemplars"` when `exemplars === null`; `"empty-tier"` when non-null but the tier filter is empty. Two states only — the source has no third (research Part II) |
| `baseCoverageIncomplete` | `boolean` | true exactly when the floor was substituted (FR-007, FR-008) |

**Invariants** (each is a unit test): groups are disjoint by NFC; no member is in
`rejected` or `authorChosen`; coverage complete ⇒ `baseGroup ⊆ produced` and
`baseGroup ∪ cldrGroup ⊇ produced ∖ rejected ∖ authorChosen`; coverage unknown ⇒
`baseGroup ⊆ ASCII_PUNCTUATION_FLOOR`; the floor and a known base set are never
combined (FR-009).

## `BasePunctuationCoverage` (engine output, recomputed)

| Field | Type | Notes |
|---|---|---|
| `produced` | `string[]` (NFC) | `producedGlyphs(ir)` filtered to `glyphCategory(c) === "punctuation"` |
| `coverageComplete` | `boolean` | `!hasUnaccountedOpaqueFragment(ir)` — the same predicate `computeInventoryDelta` stamps (`computeInventoryDelta.ts:54-58`, `:113`), exported rather than duplicated |

When `coverageComplete` is false, `produced` is a lower bound and is **not** shown as
the base group; the floor stands in and the caption says the base set is not fully
known (FR-008).

## `ASCII_PUNCTUATION_FLOOR` (engine constant)

The 32 characters U+0021–U+002F, U+003A–U+0040, U+005B–U+0060, U+007B–U+007E, frozen.
A fallback, not a policy (FR-007): used only when base coverage is `null` or
incomplete. Because it is constant, the step can always propose something.

## `seededProposals` (new store field, sticky)

```ts
seededProposals: string[]   // seed keys, e.g. "punctuation:hi", "punctuation-base:<baseId>"
```

Consulted by `seedProposals()`: a key already present means the seed has run for this
working copy and is not re-run, so revisits do not re-propose (FR-022) and a completed
pre-feature answer is not extended (FR-023, with the phase-C guard in D-02). A locale
re-resolution produces a new key and seeds the new tier, still subject to `rejected`.

Lifecycle: cleared only by `resetPhaseBDraftDecisions()`, never by `reset()`;
snapshotted as `seededProposals?: string[]`; restored with `?? []`.

## `RejectionLedger` → existing `rejected: string[]`

Already in the store. Transitions, unchanged:

- absent → present: `remove(c)` when `provenance[nfc] !== "author"` (`:421-423`).
- present → still present but inert: `add(c)` records `"author"` and the veto in
  `addWithProvenance` (`:537`) no longer applies to it (FR-022, Story 4 Scenario 3).
- present → absent: only `resetPhaseBDraftDecisions()`.

**What this feature changes**: nothing in the store. The gap is that
`applyEnvelopeToStores` (`draftPersistence.ts:939-943`) does not forward `rejected`
on restore, so `applyPhaseBDraftSnapshot`'s `?? []` wipes it on reload. The restore
call forwards every snapshot field. No pruning: entries for characters no source
proposes any more are inert; the set is bounded by the distinct characters an author
has ever removed.

## `InvisibleCharacterCandidate` (studio, computed per render)

| Field | Type | Notes |
|---|---|---|
| `codePoint` | `number` | |
| `notation` | `string` | `U+XXXX`, the same form `directionControlChars` uses (`linguistInventory.ts:152-155`) and the key of `invisibleDecisions` |
| `label` | `string` | `invisibleCharLabel(char)`, extended with `U+2060 → "WORD JOINER"` (FR-015). Unicode names, not translated |
| `needStatementId` | `string` | Lingui id `survey.invisibles.need.u<hex>`; the component renders it with `<Trans>` |
| `relevance` | `"always" \| "rtl" \| "carried-over"` | `"always"`: ZWJ U+200D, ZWNJ U+200C, ZWSP U+200B, SOFT HYPHEN U+00AD, WORD JOINER U+2060. `"rtl"`: every `isBidiControlCodePoint` code point, offered when the author's `pb_non_roman_branch` answer is `"rtl"`, otherwise offered collapsed with a note. `"carried-over"`: any `\p{Cf}` character already in the draft's `controls` bucket, so nothing entered is ever dropped |

**Validation (SC-005)**: every candidate has a non-empty `label` and a
`needStatementId` that resolves in the `en` catalog; the test enumerates the full list
so adding a code point without an explanation fails.

## `InvisibleCharacterDecision` → new `invisibleDecisions` (store field, sticky)

```ts
invisibleDecisions: Record<string /* U+XXXX */, "accepted" | "declined">
```

A key absent from the record was never decided — distinguishable from `"declined"`
(FR-018). Accepted characters are **not** added to `chars`; they reach the inventory
through the phase-C result (below), never through the `controls` bucket (FR-014).

Transitions:

- absent → `"accepted"`: the author ticks the candidate; or a `\p{Cf}` character is
  entered on the punctuation page's type-in box or code-point field (FR-016, FR-021);
  or carry-over adopts a `controls`-bucket character on the step's first render, which
  also removes that character from `chars` (FR-017, D-09).
- `"accepted"` ↔ `"declined"`: the author toggles the candidate.
- any → absent: only `resetPhaseBDraftDecisions()`.

Snapshotted as `invisibleDecisions?: Record<string, "accepted" | "declined">`;
restored with `?? {}`.

## Phase-C result (existing shape, new union rule)

Both `PunctuationStep` and `InvisiblesStep` emit:

```ts
{ phase: "C", answers, confirmedInventory: phaseCConfirmedInventory() }
```

where `phaseCConfirmedInventory()` = `nfcDedup([...punctuation, ...acceptedInvisibleChars])`
read from the draft store. Because `recordPhase` merges same-phase results field-wise,
whichever step completes last leaves the full union in place; the marks and
convenience steps' phase-C fields (`marksWorklist`, `retainedConvenienceChars`) are
untouched. `mergePhaseResults` unions `confirmedInventory` across phases into
`session.confirmedInventory`, which is what `useCarveNeededSet` reads.

`answers` on the punctuation result stays `[]`. On the invisibles result it carries
one entry per **offered** candidate:

```ts
{ questionId: "invisibles.u200c", answerType: "boolean", value: true | false }
```

so the decision record shows a decline as a recorded "no". `routeAnswersThroughMutate`
skips ids with no registry module, so these answers never touch the IR.

## `PhaseBDraftSnapshot` (existing, two optional fields added)

`seededProposals?: string[]`, `invisibleDecisions?: Record<string, "accepted" | "declined">`.
`snapshotPhaseBDraft()` writes them; `applyPhaseBDraftSnapshot()` defaults them; and
`applyEnvelopeToStores` now passes the whole snapshot through instead of three fields.

## Reused, unchanged

- `sourceExemplars()` / `charactersInTier()` and the committed index; confidence gating,
  the macrolanguage blocklist and `chooseSide()` (spec 044 rules).
- `glyphCategory()` — format characters still classify as `"control"`; what changes is
  where the punctuation page sends them.
- `isBidiControlCodePoint()` — the allowlist is read, not widened; U+00AD and U+2060
  stay outside it and are offered by the step directly.
- `isAlwaysKeepCategory()` — carve's behaviour is out of scope; only the declared
  inventory changes, and the base group's caption says so.
- `useCarveNeededSet()`, `buildProducedSet()`, `recordPhase()`, `recordStepCompletion()`.
