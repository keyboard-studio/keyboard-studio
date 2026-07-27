# Contract: Phase B propose-then-confirm prefill (studio)

**Feature**: 044-cldr-sldr-exemplars

> ## Spec delta APPROVED (2026-07-27)
>
> The behaviour below is now specified: **FR-016** and **FR-017** (plus **SC-008**) are in
> [spec.md](../spec.md), and the Assumption *"No new UI surface required"* has been amended
> to *"No new screen required"*. The **Content sign-off** on which tiers arrive pre-ticked
> was **cleared by the maintainer on 2026-07-27** — see the Seeding note below. No gate
> remains.

## Why this is a gap, not an existing behaviour

| Today | Verified in |
|---|---|
| Entering Phase B calls `resetPhaseBDraft()` — the draft starts **empty** | [`CharactersStep.tsx`](../../../packages/studio/src/survey/CharactersStep.tsx) |
| CLDR characters render as **unticked** chips, copy reads *"from CLDR exemplars — tick to add"* | [`PhaseB.tsx`](../../../packages/studio/src/survey/PhaseB.tsx) `SuggestionPanel` |
| Their source is `suggestMissingChars` — a **missing-delta** (only what the base does *not* cover), not the language's alphabet | `suggestMissing.ts` |

The author therefore assembles from zero what an authoritative source already knows, and
a character the base happens to cover is **absent** from the suggestions — so the
suggestion list is not, and cannot be, "your whole alphabet". Spec v1.3.1 §3c
("Defaults are the product"; *"no default is a defect"*) asks for the opposite.

## Behaviour

### Page 1 — the discovery method list (`IntroChooser`) — revised 2026-07-27

**The draft is never seeded on transition.** An earlier revision auto-seeded the `main`
tier on `prefill → B`; that is superseded. `resetPhaseBDraft()` stays as-is, and the
inventory reaches the draft only because the author passed the choice below.

For a language with a non-null `SourcedInventory`, the list is **three** options, the
exemplar one **first and pre-selected**:

```text
( o ) Use the alphabet we found for Ewondo
      from CLDR - 32 characters
      a b d e ɛ f g h i k l m n ny ŋ o ɔ p r s t u v w y z ...
      [ SLDR variant: "machine-generated - please check" ]

( _ ) Enter your alphabet, or discover it from text

( _ ) Step by step - I will answer the questions below
```

1. The detail is **inline on the option**, not behind it: source, confidence, count, and a
   preview of the `main` set. The author sees what they are accepting before they accept
   it (FR-016).
2. **Continuing with option 1** calls `seedFromProposal(inventory)` once — the full `main`
   set enters the draft in a single action, attributed `cldr` / `sldr`. Never a
   per-character tick. Page 2 opens prefilled, titled *"Confirm your alphabet"*.
3. **Continuing with option 2** is the decline: page 2 opens empty, titled *"Add your whole
   alphabet"*. The decline is recorded for the working copy — re-entering Phase B must not
   re-assert the set (FR-016a). It carries no extra friction: it is a sibling radio, not a
   dismissal or an "×".
4. **`null` inventory ⇒ option 1 is absent entirely** — not shown disabled, not shown
   empty. The list reverts to today's two options with `build-list` default.
5. Uppercase counterparts come from 047's existing `caseCounterpart` derivation; the
   sourcing path does not synthesize case (see
   [exemplar-sourcing.md](exemplar-sourcing.md#resolution-order-normative) step 6).
6. `auxiliary` / `punctuation` / `numbers` are **not** part of the option-1 accept; they
   remain offered in their 047 breakdown sections on page 2.

> Options 1 and 2 both route to the same page-2 component. They differ only in whether the
> draft arrives seeded — not in what the page can do.

> **Why accept-not-autofill**: pre-ticking makes a reference set the default answer to
> *"what is this language's alphabet?"* — a question the author may be the authority on.
> An author standardizing a new or revised orthography is a supported case, and making
> them dismantle a proposal they never wanted is worse than asking one question. §3c wants
> a proposed default, not an imposed one.

> **Content decision — CLEARED** (Article VI, maintainer, 2026-07-27): the offer's wording
> and what step 2's accept covers are Content calls, not Engine's. The Engine defaults were
> signed off as-is: `main` tier only, with `auxiliary`/`punctuation`/`numbers` reaching the
> author through their own 047 breakdown sections, and the copy as shipped. Revising the
> wording later stays a catalog edit — every user-visible string is behind an i18n id — and
> the accept scope is one line in `seedFromProposal`.

### Page 2 — the alphabet page (`BuildListView`)

**Same logic, same three affordances, whichever option led here** (FR-016b). The page-1
choice sets the *starting state*, not the page's capabilities — an author who declined and
then changed their mind must not have to walk back:

| Affordance | Source | State on arrival |
|---|---|---|
| Character box + **Add** | `author` | Always present, never hidden by a proposal. |
| **Paste or upload a text** | `text` | Always present. [specs/050-text-sample-prefill/](../../050-text-sample-prefill/spec.md) — not built here. |
| **Exemplar apply** | `cldr` / `sldr` | Via option 1: already applied, chips present. Via option 2: available as a collapsed one-line *"exemplars available — show"* affordance. Absent when `null`. |

Proposals from different sources **union**; each character keeps its own attribution, and
neither overwrites the other. The heading reads *"Add your whole alphabet"* while the draft
is empty and *"Confirm your alphabet"* once anything is in it (FR-016c).

### Proposed-vs-authored affordance (FR-017)

- A proposed character is visually distinct from an author-entered one and states its
  source and confidence: *"from CLDR"* / *"from SLDR (machine-generated — please check)"*.
- Removing a proposed character is **sticky**: it enters `rejected` and is never
  re-proposed for that session/working copy.
- An author-added character that is also proposed is attributed `"author"` — the stronger
  claim wins and survives a re-seed.
- Re-entering Phase B (e.g. back-from-carve) must not resurrect rejected proposals nor
  duplicate existing picks. `seedFromProposal` is idempotent.

### Confidence display

`confidence` from the inventory drives the wording only — it never filters. A
`generated`-draft SLDR set is still proposed (~30% of SLDR files are `generated`; those
languages are the ones with no alternative), but it must be labelled so the author knows
to check rather than trust.

## Non-goals

- No new screen. The existing build-list step gains proposed-state affordances.
- No change to `ConfirmedAlphabet` or `confirmedInventory` (Article I; 047 held this line).
- The alphabet is **not** auto-confirmed. Propose-then-confirm means the author still
  presses Done; nothing is recorded without that.

## Test obligations

| # | Assertion | Maps to |
|---|---|---|
| P1 | For `ewo-Latn` the method list shows the exemplar option **first and selected**, with source, count and preview inline; Continue lands on a page-2 draft holding the whole main tier | FR-016, SC-010 |
| P1a | Choosing option 2 instead lands on an empty page 2, and re-entering Phase B does not re-select or re-apply the set | FR-016a, SC-009 |
| P1b | Page 2 offers character box, paste/upload, and the collapsed exemplar affordance regardless of which option led there | FR-016b |
| P1c | Heading is "Add your whole alphabet" on an empty draft and "Confirm your alphabet" once anything is proposed into it | FR-016c |
| P2 | For a tag with no coverage the exemplar option is **absent** (not disabled), the list defaults to `build-list`, page 2 is empty, nothing errors | FR-010, FR-016 |
| P3 | A proposed character removed, then Phase B re-entered, stays removed | FR-017 sticky removal |
| P4 | Author-added character survives a re-seed and is attributed `"author"` | FR-017 |
| P5 | Proposed chips are distinguishable and expose source + confidence | FR-004/FR-017, SC-007 |
| P6 | `auxiliary`/`punctuation`/`numbers` appear in their 047 sections unticked | US2 + Content decision (cleared 2026-07-27) |
| P7 | Every 047 store invariant still holds after seeding (`chars` complete, one category each) | 047 regression |
| P8 | E2E walk: fresh visitor → Phase B → Continue (default option) → Done. Two actions, alphabet recorded, 0 characters typed | SC-001, SC-008, SC-010 |
| P9 | E2E walk: fresh visitor → Phase B → option 2 → types their own alphabet → Done records only what they typed | SC-009 |
