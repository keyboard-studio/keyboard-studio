# Feature Specification: Adaptive placement basis — base-derived default, author-observed override, expressed driver

**Feature Branch**: `spec/083-adaptive-placement-basis`

**Created**: 2026-10-05

**Status**: **Proposed** — planning spec only; no implementation. Two parts: (A) a
small correctness fix to the placement-suggestion confidence gate, and (B) the
adaptive basis-preference feature. Part A is independently shippable; Part B
builds on the same suggestion pipeline.

**Input**: Owner directive 2026-10-05 (side-chat): placement suggestions should
adapt to the placement basis the author is actually using (phonetic vs. visual
similarity, etc.), defaulting to the *base keyboard's* observed basis pattern,
and must always express which basis is driving a suggestion.

## Why this exists

Placement suggestions today are per-character and stateless. For each character,
`getRankedSuggestionsForChar` (`packages/studio/src/survey/placementSeeds.ts`)
ranks corpus-mined candidates independently of every other character the author
has placed. But authors work in patterns: once they place two or three letters
by phonetic similarity, the next letter's phonetic placement is the obvious
suggestion — and the tool currently cannot see the pattern, let alone follow it.

Worse, the tool cannot see the pattern in the artifact being adapted either.
When deriving a keyboard from a base keyboard, the base's own placement
reasoning (mostly visual? mostly phonetic?) is the honest default — it is what
the new keyboard is consistent with until the author decides otherwise. Today
that default is invisible: suggestions come only from global corpus priors.

Part A exists because the same pipeline has a real defect that Part B would
otherwise amplify: a single-keyboard corpus attestation can become a gallery
suggestion. For U+2010 (HYPHEN), the entire mined corpus contains exactly one
placement — on the `=` key — and it surfaces as a suggestion because of a
boundary interaction documented below. Any adaptive layer built on top of
suggestions must not inherit suggestions that should never have fired.

## Basis vocabulary

The seeder's anchor cascade (`utilities/kbgen/analyze.ts`, `scoreAnchors`)
already types the placement basis as `via`:

- `DECOMPOSITION` — NFD canonical decomposition base ("looks like b")
- `NAME` — Unicode character-name parse ("B WITH HOOK" → B)
- `CONFUSABLE` — UTS #39 confusable skeleton ("looks like y")
- `VISUAL` — curated look-alike (supplement.json identity gap)
- `PHONETIC` — phonetic / transliteration similarity ("sounds like g")

This spec reuses that vocabulary verbatim. A *basis mode* is one of these five
values, plus `AMBIGUOUS` (classifier could not attribute) as an explicit
non-mode.

## Part A — suggestion confidence gate fix

### Background

`corpusPriorsToPlacementMap` (`packages/engine/src/placement/corpus-loader.ts`)
drops single-keyboard outliers (`MIN_PRIOR_COUNT = 2`, "a single-keyboard signal
is noise"), but the class-retention policy resurrects the best candidate of a
mechanism class that lost all candidates to the filter, scoring its confidence
as `priorCount / MIN_PRIOR_COUNT` — i.e. **0.5** for a single attestation. The
gallery gate in `qualifiesForRanking` is `candidate.confidence >= threshold`
with `PLACEMENT_SEED_CONFIDENCE_THRESHOLD = 0.5`. So 0.5 passes exactly, and a
one-keyboard placement becomes a suggestion. The loader's own comment states
the intended semantics — "A strict majority (> 0.5) is required by the gallery
threshold" — but the code implements `>=`.

### FR-A1 — strict-majority gate

Change the gallery qualification gate to strict `>` so it matches the
documented intent: a suggestion fires only when one placement holds a strict
majority of corpus weight. A retained single-attestation candidate (confidence
exactly 0.5) must never qualify.

### FR-A2 — provenance on the chip

The suggestion chip (`MechanismGallery.tsx`, "Placement suggestion from kbgen
seeder") must display the attestation count behind the suggestion (e.g.
"attested by N keyboards"). The v1.1.1 placement-priors amendment requires
provenance display; it is currently absent, which is why a suggestion built on
n=1 reads as authoritative. `priorCount` is already on the candidate; this is a
rendering change only.

### FR-A3 — regression coverage

Add tests pinning: (1) a retained single-attestation candidate does not
qualify at the default threshold; (2) two tied qualified candidates (0.5/0.5)
do not qualify under strict majority; (3) a sole qualified candidate (1.0)
still qualifies. Update any existing tests that assert the `>=` boundary.

## Part B — adaptive basis preference

### The pipeline

**Step 0 — classify the base → default mode.** When a project has a base
keyboard (the switch-base / derived-keyboard flow), classify each of the base's
direct placements by basis (see "Basis classifier" below) and take the
dominant basis as the session's default mode. The default is displayed, e.g.
"Placing by visual similarity, following <base-id>'s pattern." If no basis
commands a clear plurality, or there is no base keyboard, the default is *no
mode* — suggestions behave exactly as today.

**Step 1 — observe the author.** Every author placement — accepted suggestion or
manual assignment — is classified by basis and recorded in a session-scoped
tally. Accepting a corpus suggestion records the basis attributed to that
suggestion's candidate (see FR-B2); manual placements are classified from the
(char → key) pair directly.

**Step 2 — suggest the flip, never silent-flip.** When the author's tally shows
N consecutive placements (N tunable, default 3) on a single basis that
*conflicts* with the current mode (the base default or a previously accepted
mode), the studio raises an explicit, dismissible proposal: "You've placed the
last 3 letters by phonetic similarity; <base-id> uses visual. Switch suggestion
mode to phonetic?" The author gets a choice point: accept the flip, stay with
the current mode, or pick a basis manually. Per the studio's propose-then-confirm
convention, the mode never changes without the author's confirmation, and a
dismissal is remembered for the session (no re-prompt for the same conflict).

**Step 3 — re-rank by active mode and express the driver.** Suggestion ranking
boosts candidates whose attributed basis matches the active mode. Every
suggestion chip names its driver: "following your phonetic pattern" vs.
"following <base-id>'s visual pattern" vs. no driver line when no mode is
active. The driver line is the mechanism by which an override stays
*intentional* rather than drift — the author can always see the moment their
pattern diverges from the base's.

### Basis classifier

New engine-side (browser-safe) module, e.g.
`packages/engine/src/placement/basis.ts`: `classifyPlacementBasis(char,
keyChar, layout) → BasisVia | "AMBIGUOUS"`. It runs the anchor cascade in
reverse — for the placed character, compute its anchor candidates (same `via`
set as kbgen's `scoreAnchors`) and report which `via` produced the key the
character actually sits on. Signals must be browser-safe: NFD via
`String.prototype.normalize`, names via the generated Unicode data table
(`packages/contracts/src/unicode/`), confusables/visual/phonetic via vendored
data (kbgen's `analyze.ts` is Node-only — `node:fs` reads — and cannot be
imported by the studio; the data it needs must be ported to an importable
form). When two bases explain the same placement, or none does, return
`AMBIGUOUS` explicitly — ambiguity is a first-class outcome, not a silent
fallback to the strongest signal.

### FR-B1 — base classification → default mode

On project open (or base switch) with a base keyboard present, classify the
base's direct placements, compute the basis plurality, and set the session's
active mode when one basis holds a clear plurality (threshold tunable, default:
≥60% of classifiable placements). Display the default in the assign-loop
suggestion area. Non-classifiable placements (`AMBIGUOUS`) count toward the
denominator so a weakly-patterned base does not produce a false-precise default.

### FR-B2 — basis attribution on corpus candidates

Corpus-mined candidates carry no basis label ("é went on E" doesn't say
whether that was visual, phonetic, or name-based). At placement-map load time,
attribute a basis to each candidate with the FR-B2 classifier; store it on the
candidate (contracts-level field addition, additive only). `AMBIGUOUS` is a
legal and common value — corpus placements are frequently
multiply-explainable, and the ranking must not pretend otherwise.

### FR-B3 — author observation tally

Session-scoped (resets on project close; never persisted to the keyboard
package) tally of the author's placements by basis. Records from suggestion
accepts (`handleSuggestionAccept`) and manual assignments alike. Only
classifiable placements increment a basis count; `AMBIGUOUS` placements are
counted separately and never contribute to a flip proposal.

### FR-B4 — flip proposal with choice point

When the tally reaches N consecutive same-basis placements conflicting with the
active mode, raise the flip proposal described in Step 2. Choices: switch to
the author's basis, keep the current mode, or choose a basis manually. The
proposal is dismissible; dismissal suppresses re-proposal for the same
(base, author-basis) pair for the session. Accepting switches the active mode
and announces it in the driver line.

### FR-B5 — mode-aware re-ranking

`getRankedSuggestionsForChar` (or its call-site wrapper) boosts candidates
whose attributed basis matches the active mode. Boost, not filter: a
high-confidence corpus candidate on a different basis must still surface
(never-silent conflict surfacing per the v1.1.1 amendment) — it simply ranks
below same-basis candidates. With no active mode, ranking is exactly today's
behavior.

### FR-B6 — driver expression

Every suggestion chip states its driver in plain language: the active basis
and whether it comes from the base keyboard's pattern or the author's own.
Manual basis selection (FR-B4's third choice) is also expressed. No driver
line appears when no mode is active.

### FR-B7 — inspectability and reset

The session's basis state (active mode, its source, the author tally) is
viewable and resettable from the assign loop — a small control, not a buried
setting. Resetting restores no-mode behavior immediately.

## User Scenarios & Testing *(mandatory)*

### US1 — base default is observed and expressed (P1)

An author opens a derived-keyboard project whose base keyboard places letters
predominantly by visual similarity. The assign loop shows placement
suggestions with a driver line naming the base's visual pattern.

**Independent Test**: fixture base keyboard with a known visual-majority
placement set; open the assign loop; assert the default mode is visual, its
source is the base, and suggestion chips carry the driver line.

**Acceptance Scenarios**:
1. **Given** a base keyboard with ≥60% classifiable placements on one basis,
   **When** the assign loop loads, **Then** the active mode is that basis with
   source "base" and the driver line names the base keyboard.
2. **Given** a base with no clear plurality, **When** the assign loop loads,
   **Then** no mode is active and suggestions rank as today.

### US2 — conflicting author pattern proposes a flip (P1)

An author whose base defaults to visual places three letters by phonetic
similarity. The studio proposes switching the suggestion mode to phonetic;
the author accepts, and subsequent suggestions lead with phonetic-anchored
candidates while naming the author's pattern as driver.

**Independent Test**: drive three phonetic placements against a visual-mode
session; assert the flip proposal appears exactly once with all three choices;
accept; assert the active mode source becomes "author" and ranking order
changes accordingly.

**Acceptance Scenarios**:
1. **Given** 3 consecutive author placements on a basis conflicting with the
   active mode, **When** the third is recorded, **Then** a dismissible flip
   proposal appears (accept / stay / choose manually).
2. **Given** the proposal is dismissed, **When** the author places a fourth
   letter on the same conflicting basis, **Then** no second proposal appears
   this session.
3. **Given** the author accepts the flip, **When** the next suggestion renders,
   **Then** its driver line names the author's basis.

### US3 — n=1 suggestions never fire (P1, Part A)

The U+2010-on-`=` case: a single-keyboard corpus attestation must not produce
a gallery suggestion, and any suggestion that does fire shows its attestation
count.

**Acceptance Scenarios**:
1. **Given** the pinned placement-priors data, **When** suggestions are
   computed for U+2010, **Then** no suggestion is offered.
2. **Given** any offered suggestion, **When** its chip renders, **Then** the
   attestation count is visible.

### US4 — ambiguity is honest (P2)

A placement explainable by two bases (e.g. NFD base == name-derived letter)
classifies as `AMBIGUOUS`, does not increment any basis tally, and never
triggers a flip proposal.

## Non-goals

- Touch-gallery longpress suggestions are out of scope for mode-aware
  re-ranking in this spec (basis attribution applies to physical placements;
  longpress hosts follow in a later spec).
- Persisting basis preference across sessions or into the keyboard package.
  Session-scoped only.
- Changing the corpus mining itself (`emitPlacementMap`); only the
  loader→gallery path (Part A) and the new classifier/ranking layer (Part B).
- The criteria-compliance page (spec 084) — separate spec, separate PR.

## Key files (expected)

- `packages/engine/src/placement/corpus-loader.ts` — confidence semantics
  (Part A is gallery-gate only; loader unchanged unless tests demand it)
- `packages/studio/src/survey/placementSeeds.ts` — `qualifiesForRanking`
  strict-majority gate (FR-A1), mode-aware boost (FR-B5)
- `packages/engine/src/placement/basis.ts` — NEW: browser-safe basis
  classifier (FR-B2 classifier core)
- `packages/contracts/src/placementMap.ts` — additive `basis` field on
  candidates (FR-B2)
- `packages/studio/src/editors/assignLoop/MechanismGallery.tsx` — tally
  observation, flip proposal UI, driver line, provenance count (FR-A2,
  FR-B3, FR-B4, FR-B6, FR-B7)
- `utilities/kbgen/` — reference only; its Node-only data loading is not
  imported, the needed signals are ported to importable form
