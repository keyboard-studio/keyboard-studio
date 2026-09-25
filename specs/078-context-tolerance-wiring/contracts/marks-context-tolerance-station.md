# Contract: `marks_context_tolerance` station

- **Where:** a new station inside the `marks` editor step
  (`survey/marks/MarksSeriesStep.tsx`).
- **Manifest:** no new manifest step. The `marks` entry's `writes` gains
  `CONTEXT_TOLERANCE_WRITES` (Constitution Art. IX; FR-005).
- **Tracks:** it runs on both tracks. The series is reached from copy and adapt
  alike (`steps/advance.ts:183-218`).

## Station id and order

- `MarksStationId` gains `"marks_context_tolerance"`.
- It is ordered **after** `marks_output_form` and `marks_stacking`, because the
  author decides output form first and tolerance is the mark model's fifth
  consumer.

## Visibility (`visibleStations`)

| Store slice state | Station |
|---|---|
| flag off / `idle` | hidden |
| `analysing` | shown as "checking…" with Continue enabled; no decision written if the author continues |
| `ready`, no fixable rules | hidden. Could-not-check items still show in the notice, not here |
| `ready`, fixable rules, no prior decision, or fingerprint changed | shown, pre-filled with every site accepted |
| `ready`, prior decision with the same fingerprint | shown read-only with the prior outcome and a "change" affordance, not re-proposed (FR-009) |
| `failed` | hidden (the notice covers it) |

## Component

```ts
interface ContextToleranceStationProps {
  proposal: TransformProposal;             // built from ContextVariantsResult; all sites accepted
  disclosures: Record<string, VariantDisclosure>;
  prior?: MarksContextToleranceDecision;
  onDecide(d: Omit<MarksContextToleranceDecision, "appliedFingerprint">): void;
}
```

The station mounts `FacetTransformPanel` (spec 039). This is its first
production mount.

- **Preview:** a `source-diff`. For each site it adds the disclosure rows: every
  shadowed or shadowing rule, the mnemonic "cannot be demonstrated here" note,
  and the mark-order note (FR-006, research D9).
- **Actions:**
  - **Confirm** (panel `onConfirm`) produces `accept` when every site is still
    ticked, or `partial` otherwise.
  - **Decline** (panel `onCancel`, labelled "Leave my keyboard as it is")
    produces `decline`.
- **Accessibility (FR-014):**
  - Each site's tick is a labelled checkbox. Its name comes from the rule's
    plain-language case, with codepoint-derived names.
  - The panel is fully keyboard-operable.

Two interactions reach accept from the station, "review" and "confirm" (SC-002).

## Series result

`seriesResult()` adds these:

- `marksContextTolerance: MarksContextToleranceDecision`.
- `answers` entries for `marks.context_tolerance` (and
  `marks.context_tolerance.sites` when the outcome is partial). The provenance
  of each is set per [data-model.md](../data-model.md#decision-record-entries-contractsdecisionrecordts).

The reducer's `marks` case does **not** apply the tolerance rules. The apply
effect does ([studio-tolerance-state.md](studio-tolerance-state.md)).

## i18n ids (content-owned wording)

- `marks.contextTolerance.station.heading`
- `.station.intro`
- `.station.site.label`
- `.station.confirm`
- `.station.decline`
- `.station.checking`
- `.station.prior.accepted` / `.prior.partial` / `.prior.declined`
- `.disclosure.shadows`
- `.disclosure.mnemonic`
- `.disclosure.markOrder`

The draft wording starts from FR-013's reference glosses. Content signs it off
in Phase 5.
