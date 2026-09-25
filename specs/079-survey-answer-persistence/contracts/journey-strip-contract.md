# Contract: two-tier footer journey strip

**Feature**: [spec.md](../spec.md) (FR-060…FR-063, FR-017, FR-016) | **Decisions**: [research.md](../research.md) R-10, R-11, R-13 | **Data model**: [data-model.md](../data-model.md) §6

Amends [specs/057-bulletproof-navigation/spec.md](../../057-bulletproof-navigation/spec.md) FR-042/FR-047 per this
spec's [Amendments](../spec.md#amendments-to-existing-specs). The strip stays [StudioFooter.tsx](../../../packages/studio/src/components/StudioFooter.tsx)'s
dot row; this contract only adds the section/question tier, badges, and the
non-blocking notice. Nothing here introduces a second jump implementation
([jumpToLocation.ts](../../../packages/studio/src/lib/jumpToLocation.ts) stays the only one) or a second debounce timer (D3).

## 1. Scope and non-goals

- In scope: `buildProgressDots` → a two-tier mark builder; `ProgressDot` (renamed conceptually to
  `JourneyMark`, see §7) → section/question rendering; the FR-016 notice in the footer's existing
  live region.
- Out of scope: the gallery sub-task grain inside a character walk (`collapsedWalkDot` stays as
  today — one mark per gallery, per [progressDots.ts:487](../../../packages/studio/src/decisions/progressDots.ts#L487)); any change to
  `decisionLogStore`'s append-only model; any change to `resolveLocation.ts`'s reachability rules.

## 2. Mark tiers

Two tiers, one row, laid out as an inline expansion of the current section (FR-060):

```
● ● ● ● ● ●  • • ◎ ·  □ □ □
sections     current  sections
before       section  ahead
             (small)
```

| Tier | Size | Unit | Source |
|---|---|---|---|
| Section | 14 px (was 10/15 px in [ProgressDot.tsx `SIZE`](../../../packages/studio/src/components/ProgressDot.tsx#L46)) | one manifest step | `steps/manifest.ts` order, same as today's stage dots |
| Question | 8 px | one author-facing screen = one `Next` (FR-060) | the step's published walk (`stepWalks`), or one synthetic screen when the step publishes none |

Only the section the author is **currently in** expands; every other section renders as its single
section mark, collapsed. Moving into another section collapses the one left and expands the new
one — no progress is lost by collapsing (§4).

## 3. State table

Fill, shape, ring and badge are independent axes carried by every mark, both tiers, per FR-060's
"the strip's existing visual vocabulary is kept, and the tier is added on top of it, not in place
of any part of it."

| Axis | Values | Meaning | Non-colour cue |
|---|---|---|---|
| Fill | filled / hollow / half | "has a response" (unchanged from 057) | shape fill, not colour |
| Shape | circle / square | reached (circle) vs. upcoming stage (square) — unchanged from [ProgressDot.tsx](../../../packages/studio/src/components/ProgressDot.tsx) | shape |
| Ring | present / absent | current position (`aria-current="step"`) | 2 px border, independent of size now that size is the tier cue (FR-060) |
| Badge | present / absent | work to do (FR-017) | small triangular notch, top-right — a shape distinct from fill/ring, never colour alone |

### 3a. Question marks (small, within the expanded section)

| Fill | Shape | Ring | Badge | Visual | Accessible-name suffix |
|---|---|---|---|---|---|
| filled | circle | — | no | small filled circle | `footer.dot.completed.ariaLabel` — "{label} — completed" |
| filled | circle | — | yes | small filled circle + notch | `footer.dot.completed.ariaLabel` + `footer.dot.badge.workWaiting.ariaLabel` — "{label} — completed — work waiting: {kind}" |
| hollow | circle | — | no | small hollow circle | `footer.dot.partial.ariaLabel` — "{label} — not yet answered" (question tier; distinct id from section `partial`, see note below) |
| hollow | circle | — | yes | small hollow circle + notch | as above + badge suffix |
| filled/hollow | circle | ring | — | current question, ring + `aria-current="step"` | `footer.dot.current.ariaLabel` — "{label} — you are here" (ring wins the "current" name over fill state, matching today's [ProgressDot.tsx:58-62](../../../packages/studio/src/components/ProgressDot.tsx#L58)) |
| — | square | — | no/yes | upcoming stage's own question is never shown collapsed-only; see §4 for the not-yet-reached section case | `footer.dot.upcoming.ariaLabel` |

**Naming note**: `footer.dot.partial.ariaLabel` is reserved for the *section* half-filled state
(§3b). The question-tier "has no response yet" state reuses `footer.dot.upcoming.ariaLabel`'s
wording ("not yet reached") only when the screen is a genuinely upcoming stage; a *reached but
unanswered* question screen (rare — a screen the author visited without submitting) uses a new id,
`footer.dot.question.unanswered.ariaLabel` — "{label} — no answer yet", so "upcoming" (never
visited) and "visited, unanswered" (visited, nothing submitted) are not conflated in the accessible
name even though FR-046 lets them share a hollow-circle visual.

### 3b. Section marks (large, collapsed or the section the author has left)

| Fill | Shape | Ring | Badge | Visual | Accessible-name suffix |
|---|---|---|---|---|---|
| full | circle | — | no | large filled circle | `footer.dot.completed.ariaLabel` |
| partial | half-filled circle | — | no/yes | left-half filled, right-half hollow (glyph left to planning per R-11; contract fixes only the semantic and the non-colour requirement) | `footer.dot.partial.ariaLabel` — "{label} — partly answered" |
| none | hollow circle (reached, not yet started) | — | no | hollow circle, distinct from the upcoming hollow *square* | `footer.dot.question.unanswered.ariaLabel` applied at section grain, or `footer.dot.upcoming.ariaLabel` if genuinely not yet reached — see shape rule below |
| — | hollow square | — | no/yes | upcoming stage, unreached | `footer.dot.upcoming.ariaLabel` |
| any | circle | ring | — | the section the author is *in* only ever shows its expanded question marks (§2), never its own section mark with a ring — a section mark and a ring never co-occur | n/a |

Shape stays the 057 discriminator: circle = reached, hollow square = upcoming/unreached (unchanged
by this feature). "Partial" only applies to a reached section, so it is always drawn as a circle
variant, never a square variant — an upcoming section cannot yet be partial.

### 3c. Badge (FR-017, FR-063)

- A small filled triangular notch top-right on any mark's shape (a shape cue, not a colour cue, per
  057 FR-046 as amended).
- On a question mark: covers every answer recorded on that screen (FR-063 — "a badge on a
  multi-answer screen covers every answer on that screen").
- On a **collapsed section** mark: shown when any question inside it has work to do (FR-063: "the
  section mark MUST show that some question in it has work waiting").
- Accessible name always appends `footer.dot.badge.workWaiting.ariaLabel`, parameterised by kind:
  - `reproposed` → "work waiting: reconfirm {reason}"
  - `unassigned` → "work waiting: assign a key"
  - `nowApplicable` → "work waiting: newly applicable"

  (Kinds are `WorkItem["kind"]` from [data-model.md](../data-model.md) §6 — `reproposed` |
  `unassigned` | `now-applicable`.) Message ids: `footer.dot.badge.reproposed.ariaLabel`,
  `footer.dot.badge.unassigned.ariaLabel`, `footer.dot.badge.nowApplicable.ariaLabel` — one per
  kind rather than one parameterised id, matching the existing per-state id pattern in
  [ProgressDot.tsx](../../../packages/studio/src/components/ProgressDot.tsx) (`footer.dot.completed.ariaLabel` /
  `footer.dot.current.ariaLabel` / `footer.dot.upcoming.ariaLabel`) rather than introducing
  interpolated reason text into the id itself.
- Badge state is **derived**, never persisted (R-10: `selectWorkToDo()` is pure, computed from
  `surveyAnswerStore` + `useAccountedForGate()`, mirroring the existing
  [UnfinishedGalleryIndicator.tsx](../../../packages/studio/src/components/UnfinishedGalleryIndicator.tsx) precedent for
  gallery counts). A badge clears the render after its `WorkItem` disappears from the selector's
  output — no explicit "dismiss" action exists or is needed (FR-017: "clears once the work…is
  resolved").

## 4. Screen grain (#1795 / #1789 / FR-060)

- **One question mark per screen, never per recorded answer.** A `Next` that records several
  answers (e.g. Invisible characters, one boolean per candidate) produces exactly one question mark.
  This is enforced by grouping recorded answers onto screens via the `screenId` stamped at record
  time ([data-model.md §1](../data-model.md) `SavedAnswer.screenId`, populated by
  `recordQuestionAnswers`), not by re-deriving grouping from the raw answer list.
- **Grouping source**: `recordedScreenOf: Record<entryId, ScreenId>` ([data-model.md §6](../data-model.md)).
  An `effectiveEntries()` record entry with no `recordedScreenOf` mapping (a pre-feature draft, or a
  record from before `screenId` was stamped) falls back to **one mark per step** — the same
  degrade [progressDots.ts](../../../packages/studio/src/decisions/progressDots.ts)'s header already documents for a walk-less
  step (`buildCompletedDots`'s per-step fallback), not a new failure mode.
- **A step that publishes a walk** (`stepWalks`, see [lib/stepWalk.ts](../../../packages/studio/src/lib/stepWalk.ts)): each
  published stop is one question mark, exactly as `buildWalkDots` does today
  ([progressDots.ts:509-544](../../../packages/studio/src/decisions/progressDots.ts#L509-L544)), **except** a character walk
  (`isCharacterWalk`, [progressDots.ts:468-470](../../../packages/studio/src/decisions/progressDots.ts#L468-L470)) still collapses to
  one mark via `collapsedWalkDot` ([:487](../../../packages/studio/src/decisions/progressDots.ts#L487)) — this feature does not
  reach into gallery sub-task grain (§1 non-goals).
- **A step that publishes no walk** (Invisible characters, Convenience letters, the single-screen
  editor steps): the whole step is one screen, so it is one question mark, regardless of how many
  answers its one `Next` records.
- **A multi-station step** (Accents and marks): every station is its own screen — marks must publish
  its `visibleStations` as a walk (R-11) so `buildWalkDots` gives each station its own question mark,
  never subsumed into one (FR-060, #1789).
- **Labels** (FR-062): always the screen or stage's catalog label, via `lookupQuestionLabel` /
  `stageLabel` fallback chain already in [progressDots.ts:216-221](../../../packages/studio/src/decisions/progressDots.ts#L216-L221) and
  [:98](../../../packages/studio/src/decisions/progressDots.ts#L98). A raw answer id (e.g. `invisibles.u2068`) must never surface —
  this closes the exact gap [progressDots.ts:316](../../../packages/studio/src/decisions/progressDots.ts#L316)'s `?? questionId`
  fallback exposes today for ungrouped ids; grouping onto a screen id with its own catalog label
  removes the need for that fallback to ever fire for a multi-answer screen.

## 5. Activation / jump rules

All activation continues through `handleActivate` → `jumpToLocation` ([StudioFooter.tsx:160-173](../../../packages/studio/src/components/StudioFooter.tsx#L160-L173),
[jumpToLocation.ts:139](../../../packages/studio/src/lib/jumpToLocation.ts#L139)) — one jump implementation, per FR-017 ("one jump
implementation, not a second") and 057 FR-045.

| Mark | Badged? | Jump target |
|---|---|---|
| Question mark | no | that question/station, via `resolveLocation` as today |
| Question mark | yes | same target — the badge does not change *where* a question mark points, only its own screen already names the work |
| Collapsed section, unbadged | — | the author's last position in that section (`surveyAnswerStore` `position`, replacing `stepCursors[stepId]` — FR-004) |
| Collapsed section, badged | — | the **earliest** question in that section with work to do (FR-063), not the author's last position — a deliberate exception to the row above, because the point of the badge is to surface work the author has not seen |
| Current mark (either tier) | — | never a jump target to itself (FR-061, [ProgressDot.tsx:99-104](../../../packages/studio/src/components/ProgressDot.tsx#L99-L104), unchanged) |
| Upcoming section | — | 057 FR-045's existing refusal/degrade rules for unreached stages; a badge MAY appear on an upcoming mark (FR-017's "upcoming-stage mark" case) and is refused the same way as an unbadged jump to that stage — the badge does not bypass the gate |

The author is **never moved automatically** by a badge appearing (FR-013, FR-017, FR-063: "The
author MUST NOT be moved"). Badges are purely a findability affordance layered on the existing jump
mechanism.

`resolution.kind === "degraded" | "refused"` still surfaces through the footer's `role="status"
aria-live="polite"` span ([StudioFooter.tsx:275](../../../packages/studio/src/components/StudioFooter.tsx#L275)), unchanged.

## 6. Overflow (057 FR-047)

Unchanged mechanism, extended to two tiers:

- Horizontal scroll inside the dot row (`overflowX: "auto"`, [StudioFooter.tsx:255](../../../packages/studio/src/components/StudioFooter.tsx#L255)), never
  vertical growth of the footer (fixed 40 px height, [:210](../../../packages/studio/src/components/StudioFooter.tsx#L210)).
- `scrollIntoView({ inline: "nearest", block: "nearest" })` on `[data-progress-dot-kind="current"]`
  ([StudioFooter.tsx:179-190](../../../packages/studio/src/components/StudioFooter.tsx#L179-L190)) keeps working unchanged — the current
  mark's `data-progress-dot-kind="current"` attribute must be preserved on whichever tier currently
  carries the ring, since the effect selects on that attribute, not on tier.
- Expanding a section grows the row's mark count (question marks in place of one section mark);
  this is exactly the "row is longer than a completed-only row" case FR-047 already anticipates —
  no new overflow rule, the existing scroll-and-keep-current-visible behaviour absorbs it.
- Every mark (section and question) stays reachable by Tab regardless of scroll position (native
  focus-scroll, unchanged).

## 7. Rename note (implementation detail, not a contract requirement)

`ProgressDot`/`ProgressDotKind` may be renamed to `JourneyMark`/reflect the two tiers, or kept as-is
with a `tier` field added — planning's call. This contract does not mandate a rename; it mandates
the behaviour in §§2-6. If renamed, `data-progress-dot-kind` (the e2e/a11y test hook,
[ProgressDot.tsx:124](../../../packages/studio/src/components/ProgressDot.tsx#L124)) should keep a stable `data-*` hook (e.g.
`data-journey-mark-kind`) so existing Playwright selectors have one mechanical rename, not a
redesign.

## 8. Message catalog additions

All strings route through the message catalog (lowercase, dot-separated,
`area(.segment)+` — see [CLAUDE.md](../../../CLAUDE.md#conventions)). New ids beyond the existing
`footer.dot.completed.ariaLabel` / `footer.dot.current.ariaLabel` / `footer.dot.upcoming.ariaLabel`
/ `footer.ariaLabel` / `footer.project.label` / `footer.stage.*`:

| Id | English source | Used for |
|---|---|---|
| `footer.dot.partial.ariaLabel` | "{label} — partly answered" | half-filled section mark |
| `footer.dot.question.unanswered.ariaLabel` | "{label} — no answer yet" | reached-but-unanswered question/section (distinct from never-reached) |
| `footer.dot.badge.workWaiting.ariaLabel` | "work waiting" (suffix fragment, composed after the base label per existing `${{label}}` interpolation style in [ProgressDot.tsx:52-66](../../../packages/studio/src/components/ProgressDot.tsx#L52-L66)) | generic badge cue, if a single generic id is preferred over per-kind ids |
| `footer.dot.badge.reproposed.ariaLabel` | "{label} — work waiting: reconfirm an earlier change" | FR-017 badge, reproposed answer |
| `footer.dot.badge.unassigned.ariaLabel` | "{label} — work waiting: assign a key" | FR-017 badge, mechanism/touch gallery |
| `footer.dot.badge.nowApplicable.ariaLabel` | "{label} — work waiting: newly applicable" | FR-067, a skipped step made applicable |
| `footer.notice.reproposal.title` | "This change affects later answers" | FR-016 non-blocking notice, heading fragment |
| `footer.notice.reproposal.body` | "{count, plural, one {# question} other {# questions}} in {steps} will need reconfirming — look for the work-to-do marks below." | FR-016 notice body, names affected steps/screens by catalog label |
| `footer.notice.reproposal.dismiss` | "Dismiss" | if the notice gets an explicit dismiss control in addition to auto-clear on next navigation |

Exact wording is Content-owned per research.md R-14; Engine lands these as catalog entries with the
English source above for Content to approve, matching the precedent
`decisions/UNREACHABLE_REASON_MESSAGE` already establishes for shared-vocabulary ids
([progressDots.ts:236-257](../../../packages/studio/src/decisions/progressDots.ts#L236-L257)).

## 9. The FR-016 notice

- Rendered in the **same** `role="status" aria-live="polite"` span the footer already uses for jump
  refusals ([StudioFooter.tsx:275](../../../packages/studio/src/components/StudioFooter.tsx#L275)) — reusing the one polite region
  avoids two competing live regions (docs/accessibility.md house rule 8: async results ride
  existing `aria-live` regions; no new timer).
- Fires on the `Next` that causes a re-proposal (R-13: compute `selectWorkToDo()` before and after
  the commit; a non-empty delta produces the notice). Rides the Next itself — no debounce, no new
  D3-governed timer.
- Never blocks `Next` (FR-016: "MUST NOT gate the Next"). Distinct from the FR-013 blocking rule,
  which blocks only when the author tries to pass a *flagged* question that is before their current
  position within the *same* step.
- Cleared on the next navigation (R-13), the same way `statusMessage` is cleared today on a
  successful jump ([StudioFooter.tsx:162-164](../../../packages/studio/src/components/StudioFooter.tsx#L162-L164)).
- Points the author at the badged marks (§3c) rather than duplicating navigation — the notice names
  steps/screens by catalog label; it is not itself a set of links (avoids a second, competing set of
  jump affordances alongside the marks it is describing).

## 10. Test matrix

| File | Extend with |
|---|---|
| [progressDots.test.ts](../../../packages/studio/src/decisions/progressDots.test.ts) | Section/question tier assembly: one section mark per manifest step; the active step's walk expands to question marks; a non-active step with a record collapses to one section mark with correct `full`/`partial`/`none` fill; a badge propagates from `selectWorkToDo()` fixtures onto the right mark(s), including the collapsed-section "some question has work" case (FR-063); Invisibles-style multi-answer-one-`Next` still yields exactly one question mark (#1795); a record entry with no `recordedScreenOf` mapping falls back to one mark per step; a pre-existing test asserting the old single-tier shape needs updating to the new `JourneyMark`/two-tier fixture shape — do not silently change its assertions without noting the shape change in the PR. |
| [StudioFooter.a11y.test.tsx](../../../packages/studio/src/components/StudioFooter.a11y.test.tsx) | Accessible names for every state in §3a/§3b/§3c (half-filled section, badge suffix per kind, "no answer yet" vs. "not yet reached" distinction); ring is exclusively on the current mark and never co-occurs with a badge notch obscuring it; keyboard activation (Enter/Space) of a badged collapsed section jumps to the earliest work item, not the last position; the FR-016 notice is announced via the same `role="status"` region and does not introduce a second `aria-live` region; screen-reader name for the notice includes step/screen names, not raw ids. |
| [e2e/footer-progress.spec.ts](../../../packages/studio/e2e/footer-progress.spec.ts) | Entering Accents and marks expands its section into per-station marks and collapses on leaving; completing Invisible characters with several candidates answered shows exactly one new question mark; an upstream alphabet edit followed by Next shows the non-blocking notice and lights up the correct badge(s) without moving the author (US3 scenario 5); activating a badged collapsed section (e.g. the physical mechanism gallery) jumps to the earliest unassigned key, and the badge clears once it is assigned; overflow: a long walk still keeps the current mark visible and every mark reachable by scroll/Tab. |

## 11. Open items for planning (flagged, not resolved here)

- The exact glyph for a section's `partial` fill is left to planning (R-11 says so explicitly);
  this contract only fixes the semantic (half-filled circle, non-colour) and its accessible-name id.
- Whether `footer.dot.badge.workWaiting.ariaLabel` (one generic id) or the three per-kind ids in §8
  ship is an implementation choice; either satisfies FR-017's "states what kind" requirement, but
  the per-kind ids match the codebase's existing per-state id convention more closely and are the
  recommended default.
