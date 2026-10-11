# Contract: studio normalization proposal

**Owner:** Engine (studio SPA). This extends, without replacing, [078 marks-context-tolerance-station](../../078-context-tolerance-wiring/contracts/marks-context-tolerance-station.md) and [078 studio-tolerance-state](../../078-context-tolerance-wiring/contracts/studio-tolerance-state.md).

## Analysis (`lib/contextToleranceAnalysis.ts`)

1. Keep the existing order: `removeContextToleranceOverlay`, then `computeContextTolerance` (the 078 diagnostic, unchanged).
2. If the report has gap findings:
   1. Compute `normalizationStepCacheKey(ir)`. On a hit in memory or the snapshot, reuse the stored result.
   2. Otherwise call `proposeNormalizationStep(ir)` and store the result.
   3. If the result is `step`, that is the proposal.
   4. If the result is `refused` and not `no-alternates`, call `proposeContextVariants(ir, report)`, the 062 fallback (FR-019), and record the refusal reason for display.
3. If the step is generated, look the keyboard up by keyboard id in the prebuild-generated regressed list (`scripts/codegen-normalization-regressed.mjs`, derived from the committed record; the source hash is not compared). On a hit, do not propose the step: use the fallback, with reason `verification-regressed`.

   **Known limitation.** The lookup is by keyboard id only, so a Track 1 copy given a new keyboard id is not matched by it, even when the copied keyboard is recorded `regressed`.

## Station (`survey/marks/ContextToleranceStation.tsx`)

When the proposal is a step:

- **Intro:** "Adds {N} rules. None of your rules change." (N = `ruleCount`; pluralised via ICU).
- **Examples:** up to 5 rows, each showing the pasted form → the result, with the character names from the `ContextToleranceNotice` naming helper.
- **Disclosure:** "Text pasted next to the cursor is converted to this keyboard's own form when you type" (FR-018).
- **Actions:** one confirm ("Add this step") and "Leave my keyboard as it is". There are no per-site ticks.
- **Facet transform:** one affected site, `siteId = "normalization-step"`.

When the proposal is the 062 fallback, the station renders exactly as in 078, plus one line naming the refusal reason.

The fallback is temporary. Its retirement criteria and the release precondition for making the step the default (desktop-engine verification and the paste premise, both not yet verified) are in [engine-normalization-step.md](engine-normalization-step.md#release-precondition). The step lives only in the projection replay, so the debounced TS Layer A pass does not see it ([design note](engine-normalization-step.md#design-note-where-the-step-lives)).

New message ids follow the spec 046 grammar under `marks.context_tolerance.step.*`:

| Id | Where | Text |
|---|---|---|
| `marks.context_tolerance.step.intro` | station, step proposal | "Adds {N} rules. None of your rules change." (ICU plural) |
| `marks.context_tolerance.step.examples.heading` | station | "Examples of text it converts" |
| `marks.context_tolerance.step.examples.row` | `NormalizationExamples.tsx`, one per example row | Visually hidden spoken form of a row: "{pasted} becomes {result}", built from codepoint names. Sighted users see the glyphs; screen readers get this text |
| `marks.context_tolerance.step.disclosure.rewrite` | station | The FR-018 disclosure |
| `marks.context_tolerance.step.action.accept` | station confirm button | "Add this step" |
| `marks.context_tolerance.step.prior.accepted` | station, when the author returns to a step they accepted | "You chose to add the step that converts pasted text to this keyboard's own form." A declined step reuses `marks.contextTolerance.station.prior.declined` |
| `marks.context_tolerance.step.fallback.reason.<reason>` | station, 062 fallback line | One id per reason: `no_unicode_entry`, `opaque_entry`, `opaque_output_store`, `time_bound`, `no_alternates`, `verification_regressed` |

## Decision trail

The question ids are unchanged: `marks.context_tolerance` and `marks.context_tolerance.sites`. For a step, `acceptedSiteIds` is `["normalization-step"]` or `[]`, and the decision is `accept` or `decline`. A `partial` decision is impossible.

## Persistence

- `contextNormalizationStep?: { cacheKey: string; result: NormalizationStepResult }` is added to the working-copy snapshot, optional, with no `DRAFT_VERSION` bump.
- An accepted step persists as a `kind: "normalization-step"` overlay batch in `contextToleranceOverlay`.

## Accessibility (spec 056)

- The examples list is a semantic `<ul>`.
- Each glyph's accessible name comes from its codepoint names.
- The single confirm is a native `<button>`. No new live region is added; the existing station announcement covers it.
