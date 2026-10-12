# Decisions page (decision trail) — Phase 1 audit

Branch `km/decisions-page-detail` (off `km/derived-keyboard` @ ab973e8b).
Trigger: Matthew's smoke-test report — the Decisions page "isn't showing as
much about the decisions as I would like."

Surfaces audited: `packages/studio/src/decisions/DecisionTrailView.tsx`,
`DecisionEntryRow.tsx`, `headline.ts`, fed by contracts' `DecisionEntry`
(`packages/contracts/src/decisionRecord.ts`). Fixtures/tests used:
`DecisionEntryRow.test.tsx`, `DecisionEntryRow.identifiers.test.tsx`,
`DecisionTrailView.test.tsx`, `galleryLogEntries.test.ts` (real StepHost
walks settling gallery decisions), `recordGalleryDecisions.ts` (the only
writer of the `decision` payload kind), `contextToleranceTrail.test.ts`
(real `provenance.proposed` records).

## What every entry carries (contracts)

`entryId`, `stepId`, `payload` (4 kinds below), `provenance`
(`agency`: `hand-set` | `tool-proposed` | `base-derived`; optional
`source`; optional `proposed: { value, siteIds? }` — the tool's offer kept
when the author overrode it, spec 078), `recordedAt` (epoch ms),
`supersedes` (entryId | null), `impact?` (captured | none | unavailable;
`null` = shed; absent = not captured).

## Per kind: carries vs shows

### survey-answer `{ questionId, answerType, value }`

- Collapsed: headline only — "Chose {value} for {question label}" /
  "Accepted suggested {value} for {question}, from {source}" /
  "Carried {value} for {question} from the base keyboard". The value is
  humanized (`formatAnswerValue`: char lists space-joined, booleans yes/no,
  empty string "(blank)"); the question is a resolved label (FR-014 prose
  fallback). Provenance appears ONLY as the headline's verb phrase.
- Expanded: the source impact only (per-file diffs / "changed nothing" /
  unavailable reason / shed notice).
- GAPS: `recordedAt` never rendered. `provenance.proposed` — the offer the
  author overrode, and the sites it named — is recorded deliberately
  (spec 078) and rendered NOWHERE in the trail.

### editor-action `{ actionType, summary { counts?, sample[], sampleTruncated } }`

- Collapsed: "{stage label} ({non-zero counts})", or "(changed nothing)",
  or "(what this stage did was not recorded)".
- Expanded: impact only.
- GAPS: `summary.sample` — the bounded list of affected identifiers the
  record keeps precisely so it can be shown — is never rendered.
  `recordedAt` never rendered.

### base-contribution `{ baseId, baseDisplayName, startingKeyCount?, derivedAxes[], inheritedMetadata[], instantiationMode }`

- Collapsed: "Chose {baseDisplayName} as the base keyboard — started with
  N keys, deriving M properties and inheriting K details from it"
  (clauses omitted when the payload omits them).
- Expanded: derived axis names resolved through the catalogue and the
  inherited "field: value" pairs (not routed through impact resolution).
  `baseId` correctly never rendered.
- GAPS: `instantiationMode` — "new-from-base" (a copy) vs "adapt-existing"
  (an update of the released keyboard) — is carried and never rendered.
  `recordedAt` never rendered.

### decision `{ decisionId, value: JsonValue, summary }` (spec 090 US5)

Written only by `recordGalleryDecisions.ts` from the decision store's
settled gallery decisions; provenance mapped from the 088 vocabulary
(asked → hand-set, extracted → base-derived/base, default →
tool-proposed (+source), derived → tool-proposed).

- Carries: the module's full value as JSON; a host-composed summary
  ("{module audit label}: {digest}" — a scalar as itself, a collection as
  its item count; ≤ 200 chars); full provenance.
- Collapsed: the headline is the summary VERBATIM — nothing else. The
  recorder's own design note says "the value itself rides in the payload
  for anyone who expands the entry" (`recordGalleryDecisions.ts`,
  `valueDigest` comment).
- Expanded: impact only. **The value is never rendered — collapsed or
  expanded.** The expand-to-see-the-value design was never implemented in
  the row.
- Real values this hides (from `galleryLogEntries.test.ts` StepHost
  walks): punctuation-inventory `{ accepted: [{char: "«"}], declined:
  [{char: "»"}] }` reads as "Punctuation inventory: 2 items" — the actual
  characters are invisible; deadkeys-defined ops, convenience chars
  (`@` retained, `#` rejected), the windows-layout pick, help-docs text —
  all reduced to a count or a label.
- GAPS: value invisible (the headline gap). Provenance invisible — an
  extracted value and a hand-set one are indistinguishable, on the one
  surface whose subject is provenance. `recordedAt` invisible. No live
  label resolution for `decisionId`: the label exists only baked into the
  summary string at record time (recording locale), and when the module
  doesn't resolve, `summarizeGalleryDecision` falls back to the RAW
  decisionId in the headline.

## Cross-kind gaps

- `recordedAt` is carried by every entry and rendered by NO surface
  (grep over the trail components: zero hits).
- Supersede linkage is a single vague badge — "Replaced by a later
  decision" — with no way to get to the replacement; the replacing entry
  doesn't say it replaces an earlier one. Superseded rows are hidden
  behind a global toggle, unreachable from their replacement.
- Stage roll-ups count what rows don't repay: a stage can announce
  "3 decisions recorded" while its decision rows show three summary
  strings and nothing else.

## Verdict

The gap is in RENDERING, not in recording. The record already carries
everything an author needs — value, provenance (incl. the overridden
offer), timestamp, supersedes, editor sample, instantiation mode. No
recorder change is required; Phase 2 is confined to the trail surface.

## Phase 2 spec (from the gaps)

1. A meta line on every row, visible collapsed (`decision-entry-meta`,
   additive testid): provenance in words for every kind + the recorded
   time, locale-formatted.
2. An expanded detail block (`decision-entry-detail`, additive) above the
   impact, lazy like the impact (rendered only while expanded):
   - decision: the module label resolved live through the same
     `lookupQuestionLabel` seam the headlines use (FR-014 prose fallback,
     never the raw id), plus a humanized outline of the stored value
     (new pure module `decisionValueText.ts`: generic over `JsonValue`,
     bounded; surfaces scalars, character/item lists and per-field
     digests; never renders identifier-shaped field names or `id` /
     `provenance` item fields — FR-008).
   - survey-answer: the overridden-proposal note when
     `provenance.proposed` is present (offered value + named-site count).
   - editor-action: the sample identifiers, with a "first few only"
     note when `sampleTruncated`.
   - base-contribution: the instantiation-mode line (copy vs update).
3. Supersede links in both directions: the view computes the
   replacement map and passes a reveal callback; rows gain
   `decision-entry-show-replacement` / `decision-entry-show-replaced`
   buttons (additive testids; the `decision-entry-superseded` badge is
   untouched) that un-hide + un-collapse the target's stage and scroll
   to it.
4. i18n: all new strings via lingui macros with en+fr catalogue entries.
   (`lingui extract` works on this branch. The known babel-plugin-macros
   crash is in the separate content-i18n extractor over question-module
   files — `content-i18n-freshness` — which UI strings never pass
   through; that defect stays with the spec-090 lane.)
5. Tests: per-kind row rendering (meta + detail), supersede reveal in
   the view, a decision-kind fixture in the identifiers guard, and unit
   tests for `decisionValueText` over the real StepHost value shapes.
