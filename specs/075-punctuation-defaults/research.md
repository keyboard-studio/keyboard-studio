# Research: what the punctuation step already knows

Companion to [spec.md](spec.md). This document records the code-level findings
behind the claim that drives the feature — that the "Choose your punctuation"
question holds the answer it is asking for — with the citations to check each
one against. Nothing here is a proposal; the proposals are in the spec.

**Evidence base.** The `keyboard-studio` working tree at the time of writing,
branch `main`. Every citation below is `path:line` in that tree and was read
first-hand. Where a finding is an absence ("no such symbol exists"), the search
that established it is stated.

## 1. Which page this actually is

The heading Matt quotes is rendered at
`packages/studio/src/survey/punctuation/PunctuationStep.tsx:206`:

```tsx
<Trans id="survey.punctuation.heading">Choose your punctuation</Trans>
```

This is a **hand-built wizard step**, not one of the modular registry questions.
It is registered as a manifest editor-step at
`packages/studio/src/steps/manifest.ts:148-161` with `kind: "editor-step"`,
`id: "punctuation"`, `spine: true`, `inputs: []`, `writes: []`, and
`rightPane: "character-map"`. Its position in the spine order is
`marks` → `punctuation` → `convenience`, at
`packages/studio/src/steps/advance.ts:219-225`, with phase membership at
`packages/studio/src/steps/phases.ts:105`.

**A near-miss worth naming.** There are modular questions with punctuation in
their names — `packages/studio/src/survey/questions/b/pb_punctuation_gate.ts:7`
and `packages/studio/src/survey/questions/b/pb_punctuation_list.ts:7-8`. These
are prose questions on a different surface and are **not** the page Matt is
describing. Confusing the two would target the wrong file; the spec puts them
out of scope explicitly.

### The result shape, and the phase-C trap

`PunctuationStep.tsx:75-77` — `punctuationResult()` returns
`{ phase: "C", answers: [], confirmedInventory: [...punctuation] }`.

The phase is `"C"` and not `"B"` **deliberately**. `recordPhase` shallow-merges
entries carrying the same phase, so a phase `"B"` result from this step would
clobber the alphabet step's `confirmedInventory`. The reasoning is written at
`PunctuationStep.tsx:14-26`. This is the single most dangerous thing to touch in
this file: a change to the result shape that "tidies" the phase back to `"B"`
silently destroys an earlier step's answer. Hence FR-022 asks for a pinning test
rather than trusting the comment.

An empty list is a valid answer and Done is always enabled
(`PunctuationStep.tsx:69-74`, `:415-434`) — which is exactly why the empty
zero-interaction outcome is reachable today.

## 2. CLDR is already wired to this page

This is the load-bearing finding. The exemplar data is not something the feature
has to go and fetch; it is already on screen.

| Step | Location |
|---|---|
| The page calls the hook | `PunctuationStep.tsx:135` — `useSourcedExemplars(bcp47)` |
| The hook | `packages/studio/src/survey/useSourcedExemplars.ts:41` |
| Service seam | `packages/studio/src/lib/services.ts:302-307` |
| Engine entry point | `packages/engine/src/character-discovery/exemplarSource.ts:202` — `sourceExemplars()` |
| Punctuation tier filter | `PunctuationStep.tsx:153-158` — `charactersInTier(inventory, "punctuation")` |
| Tier filter implementation | `exemplarSource.ts:238-240` |
| Tier key mapping | `exemplarSource.ts:45-50` — `punctuation` → `"p"` |

The data itself is the committed offline index
`packages/engine/src/character-discovery/generated/exemplars.generated.json` —
2381 locales, `version: { cldr: "48.2.0", sldrCommit: "922a7879…" }`. Its schema
is `packages/engine/src/character-discovery/exemplarIndex.ts:15-39`, where the
`p` field is the punctuation exemplar UnicodeSet. The governing spec is
[044-cldr-sldr-exemplars](../044-cldr-sldr-exemplars/spec.md).

The rules that decide whether a tag resolves at all are unchanged by this
feature and are the reason the "no exemplars" edge case exists: confidence
gating and the macrolanguage blocklist at `exemplarSource.ts:87+` and `:67`, and
CLDR-over-SLDR precedence in `chooseSide()` at `exemplarSource.ts:157-168`.

## 3. The defect: held, rendered, and then made into work

Those exemplars are rendered as **add-only chips the author clicks one at a
time**. The add path is `PunctuationStep.tsx:275-281` —
`onAdd → addProposed(ch, inventory.source)`. The UI copy at `:263-265` says the
quiet part outright: "from CLDR exemplars for {displayName} — tick to add".

Chosen chips are click-to-remove at `:382-410`.

The important consequence for scoping: **the propose-then-confirm affordance
already exists on this page.** Proposed items already carry the dashed
"proposed" attribution introduced by spec 044 P5, drawn at
`PunctuationStep.tsx:384-387`. The visual language, the add path, the remove
path and the provenance label are all built. What is missing is only the
*initial population* — the difference between a tray to shop from and a default
to trim. That is why Story 1 is P1 and why it is small.

State lives in the shared `phaseBDraftStore` (`PunctuationStep.tsx:128-133`),
whose punctuation slice is derived by General-Category routing at
`packages/studio/src/stores/phaseBDraftStore.ts:326-345`.

## 4. Base punctuation is kept silently — and the letters beside it are not

Carve never proposes punctuation for removal.
`packages/studio/src/lib/irToCarveNodes.ts:2056-2058` — `isAlwaysKeepCategory`
returns `/^[\p{N}\p{P}\p{S}]$/u.test(ch)`. Its docstring at
`irToCarveNodes.ts:2040-2055` gives the reasoning, and two sentences of it matter
to this feature more than the rule itself.

The first is the rationale for shielding punctuation:

> CLDR's punctuation/number exemplar tiers are language-specific and often sparse
> (e.g. Greek `el` doesn't list ASCII `.`/`,`/`0-9`), so these fall outside
> `needed` and would otherwise look surplus even though they're wanted on
> essentially every keyboard.

The engine has already reached the conclusion that ASCII punctuation is wanted on
essentially every keyboard and that the CLDR tier alone under-describes it. That
is the argument for the spec's fallback floor, arrived at independently and
written into the code before this spec existed.

The second is the asymmetry:

> A combining/letter grapheme (base letter + mark) normalizes to category L/M,
> not N/P/S, so it does NOT match here — surplus letters/marks are still eligible
> for removal recommendations. Only bare number/punctuation/symbol codepoints are
> shielded.

So the same base keyboard's characters get **opposite** inheritance defaults by
family. Punctuation, numbers and symbols are kept without comment and asked about
nowhere. Letters and marks are actively proposed for removal and then asked
about. Neither is propose-then-confirm on the accept side, and nothing in the
repository records that as a decision — it is a consequence of one regex.

### A third path, for base ASCII on a non-Latin keyboard

`isBasicLatinCrossScriptFallthrough` at `irToCarveNodes.ts:2124-2126` is
`isAsciiLatinLetter(ch) && !targetScriptIsLatin(bcp47)`. Its decision comment at
`:2110-2118` is explicit that this is **not** a hard exclude: such a character
"is left to flow through the ordinary surplus/allowlist/coordinated-drop guard
chain like any other candidate; if it survives, callers tag it
`reason: 'cross-script-latin'` rather than excluding it, so the UI can surface it
as a separate, optional, low-priority removal group instead of silently keeping
it or mixing it into the primary recommendation."

That is a third behaviour: neither shielded nor plainly proposed for removal, but
deliberately demoted to an optional group. It reaches this feature because ASCII
*punctuation* arrives on a non-Latin keyboard by the same base-layout
fall-through, and is shielded by `isAlwaysKeepCategory` while the letters beside
it are demoted. The spec carries it as an edge case rather than a finding to act
on, because the behaviour of the punctuation half was not traced beyond the guard.

### The letters question already exists

The precedent Story 2 follows is built and on the spine.
`packages/studio/src/steps/manifest.ts:172-181` registers `id: "convenience"`,
`title: "Convenience letters"`, `spine: true`, `inputs: []`, `writes: []`,
component `ConvenienceCharsStep`. The spine order at `manifest.ts:229-232` places
it as `… marks, punctuation, convenience, carve …`, immediately after the step
this feature is about. Its heading is
`packages/studio/src/survey/convenience/ConvenienceCharsStep.tsx:208` — "Keep
these letters for convenience?".

Its gate is computed, not rendered: `computeConvenienceGate` at
`ConvenienceCharsStep.tsx:85-98` returns `{ skip: true, candidates: [] }` when
nothing has been instantiated or no orthography is confirmed, and otherwise skips
when `surplusBasicLatinCandidates` is empty. The component docstring at
`ConvenienceCharsStep.tsx:1-27` describes the intent in §3c's own vocabulary —
"Defaults are the product… everything is pre-checked, so 'keep them' is one click
and the question is skipped entirely when there is nothing to ask" — and states
the exclusion this feature is reversing: "Digits and punctuation need no
question: carve never proposes them."

Story 2 is therefore not a new interaction pattern. It is the pattern beside it,
applied to the family that was excluded from it.

### That question has no spec home

`manifest.ts:180` sets `specRef: "specs/051-carve-orthography-trim"`. A
case-insensitive grep for "convenience" across `specs/051-carve-orthography-trim/`
returns nothing — the spec it points at never mentions the step. The component
cites "spec v1.3.1 §3c". The root [spec.md](../../spec.md) does have a §3c,
"Defaults are the product" (line 147, "Added 2026-06-15"), which matches in
substance; what does not exist is the version label — a grep for `1.3.1` in
[spec.md](../../spec.md) returns nothing.

So the citation is substantively right and formally unresolvable. Whether spec 075
should adopt the step is left open in the spec's Dependencies as the repo owner's
call.

### The coverage data exists and has no consumer

| What | Location |
|---|---|
| Produced-glyph set for the base IR | `packages/engine/src/inventory/producedGlyphs.ts:35-40` — `buildProducedSet` |
| Partition into covered / missing | `packages/engine/src/inventory/computeInventoryDelta.ts:84-110` |
| The stamp itself | `computeInventoryDelta.ts:104` and `:106` — `inBaseOutput` |
| Contract field | `packages/contracts/src/characterDiscovery.ts:85` |
| Why the field exists | `characterDiscovery.ts:158` — comment: so "the picker can grey out characters already produced" |
| Unknowable-coverage case | `computeInventoryDelta.ts:35-58` — sets `coverageComplete: false` when opaque `RawKmnFragment` nodes make base output unknowable |

The comment at `characterDiscovery.ts:158` is worth dwelling on: the field was
added *for a picker to consume*, and the punctuation picker does not consume it.
Story 2 is largely wiring an existing signal to an existing surface.

`coverageComplete: false` is what forces the fallback floor. When opaque
fragments are present the produced set is a lower bound, and presenting a lower
bound as an answer would be a confidently-wrong default — the failure mode
[spec.md](../../spec.md) §3c calls out as equal to a blank one.

The engine-side precedent for the letters family is
`packages/engine/src/character-discovery/convenienceChars.ts:1-26` and `:33-42`:
basic-Latin U+0041–U+005A and U+0061–U+007A the base produces that the
orthography does not use.

### What does not exist

Searched and absent: there is no `baseKeyboard` character-inheritance model, and
no `inherit`, `defaultKeys` or "accept from base" symbol anywhere in the tree.
Story 2 has no existing vocabulary to reuse, and the contract document proposes
one.

## 5. Invisible characters: refused, hidden, and accepted-then-dropped

The framing to avoid here is "invisibles are mixed into the punctuation
question". They are not mixed in, and they are not absent either. Three input
paths on one page give three different answers.

### Path 1 — the type-in box refuses them

`isPunctuationChar` at `PunctuationStep.tsx:80-82` is
`glyphCategory(c) === "punctuation"`, which is `\p{P}` only
(`packages/engine/src/character-discovery/glyphCategory.ts:36`). ZWJ, ZWNJ, ZWSP,
U+00AD and U+2060 are `Cf`, so `glyphCategory` returns `"control"`
(`glyphCategory.ts:20`, `:39-41`), and the typed character is declined into a
"Skipped" list.

**A precision point that matters.** The line that does this,
`PunctuationStep.tsx:166`, is
`setSkipped(harvested.filter((c) => !isPunctuationChar(c)))`. It is not
invisible-character handling. It is a wrong-category guard, and the comment above
it at `:162-165` says what it is for: "This page collects one category. Anything
else typed here is declined visibly (the note below) rather than silently
vanishing into the shared draft — a letter added here would resurface in the
Phase B alphabet." The most common thing in that skipped list is a **letter**.
Invisibles land there only as a side effect of not being punctuation, and this
line should not be cited as evidence about them.

### Path 2 — the grid never shows them

The scope fold at
`packages/studio/src/survey/CharacterMapPane.tsx:245-252` keeps only entries whose
`glyphCategory(nfc)` is `"punctuation"`. It runs *after* the engine's
`\p{Cf}`-except-bidi-allowlist guardrail at
`packages/engine/src/character-discovery/characterMap.ts:314-327`, so every
allowlisted survivor — the bidi controls at
`packages/engine/src/character-discovery/CharacterDiscoveryServiceImpl.ts:109-117`,
which despite the name span U+200B–U+200F and so include ZWSP, ZWNJ and ZWJ — is
`Cf`, classifies as `"control"` (`glyphCategory.ts:34-43`), and is dropped.

Because the fold precedes the search filter at `CharacterMapPane.tsx:263`, no
typed query can surface one either. Nothing invisible is ever a clickable cell, a
suggestion chip, or a search result. The same holds for the alphabet scope.

### Path 3 — the code-point field accepts them, and the result is lost

The pane ships an unconditional escape hatch: `RawCodepointEntry`, rendered at
`CharacterMapPane.tsx:486-494` and labelled "Add any character by code point"
(`RawCodepointEntry.tsx:30`). Its parser `parseUPlusNotation`
(`packages/contracts/src/utils/charUtils.ts:148-169`) rejects surrogates, values
above U+10FFFF, and noncharacters. It does not reject `Cf`. So the whole invisible
set is enterable here today: ZWSP U+200B, ZWNJ U+200C, ZWJ U+200D, LRM/RLM
U+200E/U+200F, the U+202A–U+202E embedding controls, WORD JOINER U+2060, SOFT
HYPHEN U+00AD, U+FEFF.

And then it is silently lost. The pick goes through `addChar`
(`CharacterMapPane.tsx:389`) into the draft store's General-Category switch
(`packages/studio/src/stores/phaseBDraftStore.ts:326-345`), hits
`case "control": pushControl(nfc)` at `:342-343`, and lands in the `controls`
slice. The punctuation page renders only the `punctuation` slice
(`PunctuationStep.tsx:332`), so the character appears nowhere on the page the
author added it from, and `punctuationResult()` (`PunctuationStep.tsx:75-77`)
excludes it from `confirmedInventory` entirely. It resurfaces only in the Phase B
alphabet page's "Control/other" section (`PhaseB.tsx:683-688`).

Net effect: the author adds a character, sees no confirmation, and the character
does not survive into the inventory. No error, no test failure.

### It has no name while this happens

`INVISIBLE_CHAR_LABELS` / `invisibleCharLabel()`
(`packages/studio/src/lib/irToCarveNodes.ts:183-204`) supply human-readable names
for SPACE, ZWSP, ZWNJ, ZWJ, ZWNBSP, SOFT HYPHEN, CGJ and MONGOLIAN VOWEL
SEPARATOR — but they are imported only by carve and assign surfaces
(`StoreChip.tsx:27`, `RemovalBanner.tsx:56`, `irToCharacterView.ts:466`). Neither
the character-map pane nor the punctuation step uses them; punctuation chips use
`codepointLabel()`, which emits a bare `U+XXXX` with no name. An invisible on this
path therefore renders as a blank glyph beside a bare code point.

**U+2060 WORD JOINER is absent from that map and appears nowhere in the
repository.** Adding a character the codebase has never mentioned is a real, if
small, unit of work.

### There is nowhere else to move it to

`rightPane` has exactly two values (`packages/studio/src/steps/types.ts:59`), and
there is no block picker or category browser anywhere in the studio. So the
code-point field is not a redundant path to be deleted — it is currently the only
route to a format character. That is why the spec frames Story 3 as **promoting**
it into a named question rather than removing or relocating it, and why whether
it stays on the punctuation scope afterwards is one of the spec's open questions.

### A bucket with no consumer

The `controls` slice the picks land in (`phaseBDraftStore.ts:94-97`, `:342-343`,
`:355-358`) is derived on every keystroke and read by no survey question. The
storage half of Story 3 is partly built and entirely unwired.

## 6. A silent write fails no test

Two defects in scope share one shape: something happens, nothing renders, and
nothing turns red.

The first is the code-point routing loss in section 5. The second is structural.
The convenience step auto-skips without rendering, and `docs/journey-coverage.json`
lists it under `uncovered` as
`{"stepId": "convenience", "edgeType": "spine", "covered_by": []}` — with an
identical entry under `entries`. The Playwright helper `driveConvenienceStep`
(`packages/studio/e2e/helpers/surveyFlow.ts:475-489`) races the step's own
Continue control against the carve landmark that always follows it, then clicks
Continue only `if (await continueBtn.isVisible()...)`. That is deliberate and
well-reasoned — its docstring at `:462-474` traces it to a spec-057 Class-B race
— but the consequence stands: a step that stopped rendering *entirely* would
still let the walk pass.

Those are not the same bug, and the spec does not propose fixing the helper. They
are the same **class**: a survey write with no observable consequence. Hence the
spec's cross-cutting criterion that a character added through any input either
reaches the step's confirmed result or is visibly declined, and that neither
outcome must fail a test.

## 7. Why this is a §3c feature and not a UI polish request

[spec.md](../../spec.md) §3c states the posture: defaults are the product,
propose-then-confirm everywhere, provenance mandatory, and a decision point left
blank when a default was derivable is a defect.

Each gap is an instance:

1. **Evidence held, not proposed.** The CLDR tier is fetched, filtered and
   rendered, then withheld behind per-character clicks (sections 2 and 3).
2. **Kept but not named — and inconsistently so.** Base punctuation reaches the
   output via the always-keep rule while `inBaseOutput`, the field added so a
   picker could show exactly this, goes unread; and the letters beside it get the
   opposite default with a question of their own (section 4).
3. **Accepted, unnamed, and discarded.** The only path that accepts an invisible
   character loses it, without a label at any point (section 5).

A blank default, a silent resolution, and a write with no observable consequence.
§3c names all three.

## Confidence and gaps

- Sections 1 to 6 are first-hand reads of the cited lines. Where a line range was
  handed to this document rather than read, it was re-read; one correction was
  needed — the `isAlwaysKeepCategory` docstring is at `irToCarveNodes.ts:2040-2055`,
  not the range originally supplied.
- **The punctuation step is under concurrent modification.** At the time of
  writing, `packages/studio/src/survey/punctuation/PunctuationStep.tsx` and its
  test are modified in the working tree by other work in flight. Sections 1, 3 and
  5 describe the committed baseline this spec is written against; their line
  numbers in that file should be re-checked at plan time.
- The absences in sections 4 and 5 ("no inheritance model", "U+2060 appears
  nowhere", "no block picker") are search results over the working tree, and are
  the kind of claim a later branch can invalidate.
- The cross-script fall-through path in section 4 was read but its behaviour for
  *punctuation* was not traced past `isAlwaysKeepCategory`. The spec carries it as
  an edge case for that reason.
- No corpus measurement was taken. SC-008 is phrased as a threshold to set after
  measuring, not as a known rate.
- The one remaining open question carried as `[NEEDS CLARIFICATION]` in the spec
  — the fate of the pane's code-point entry field — plus the convenience step's
  spec home, are not answerable from the code and were not guessed at here. The
  all-versus-floor question and the placement of the invisible-character question
  were both settled by the repo owner on 2026-09-09 and are recorded in the
  spec's Decisions taken.
