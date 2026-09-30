# Implementation Plan: Bulletproof navigation

**Feature**: 057-bulletproof-navigation · **Branch**: `057-bulletproof-navigation` · **Spec**: [spec.md](spec.md)

**Created**: 2026-08-03 · **Reconciled after clarification**: 2026-08-03 (Q1, Q2, Q3, Q4, Q7 resolved; footer journey model adopted — see [spec.md](spec.md) Clarifications)

## Summary

The studio loses the author's place because `SurveyView`'s mount effect resets the traversal store on every remount, and a route change remounts it. The fix is a deletion, not a new mechanism: both genuine start-over paths — `handleStartOver()` in [StudioShell.tsx](../../packages/studio/src/StudioShell.tsx) and the "I'm new" button in [WelcomeScreen.tsx](../../packages/studio/src/components/WelcomeScreen.tsx) — already call `useSurveySessionStore.getState().reset()` explicitly, so removing the mount-time reset satisfies FR-002 and FR-003 without introducing a second notion of session identity. That single deletion also resolves the durable overwrite (D-2), the Phase B alphabet loss (D-4), and all four broken entry points (D-3), because each of them already sets the target step correctly and was only ever defeated by the reset that followed.

On top of that fix the feature adds three surfaces that need a location vocabulary finer than a tab: decision deep links, the footer, and per-tab view state. These share one resolver and one jump implementation — the hash grammar widens from `#<route>` to `#<route>/<step>/<question>`, a pure resolver classifies a requested location as reachable, unreachable-with-reason, or degraded-to-ancestor, and every surface that jumps calls the same primitive. The "Preview" tab becomes "Compare" and is made structurally read-only by giving it its own pipeline hook that never wires `onInstantiate`, rather than by passing a flag into the shared `usePreviewArtifact` (which stays as-is for Output, per FR-026).

The footer is the feature's one genuinely composite surface, and clarification made it larger than the spec's first draft: it **is** the breadcrumb (Q7), so there is no separate bar, and its dot row shows the **whole journey** — completed questions, the live current position, and the stages still ahead — scoped strictly to this author's projected path, growing when an optional question is reached. That gives it two sources by design: the decision record for progress and traversal state for position (dot timing, resolved), plus the flow map's existing path projection for the look-ahead rather than a second derivation of "what comes next".

No new dependency, no router library, no storage layer: per-tab view state lives in a module-level zustand singleton, which survives a route unmount and dies on reload by construction — exactly the session scope Q9's default asks for, with zero persistence code.

## Project Structure

```
packages/studio/src/
  lib/
    navigate.ts                      # MODIFIED — widen to Location; keep RouteId
    location.ts                      # NEW — parse/format the hash grammar
    resolveLocation.ts               # NEW — pure resolver -> LocationResolution
    jumpToLocation.ts                # NEW — the ONE jump primitive (FR-045, FR-061)
    projectLabel.ts                  # NEW — extracted from draftAutosave.deriveLabel
    draftAutosave.ts                 # MODIFIED — deriveLabel delegates to projectLabel
  stores/
    viewStateStore.ts                # NEW — session-scoped per-tab view state
    surveySessionStore.ts            # UNCHANGED (traversal contract already correct)
  StudioShell.tsx                    # MODIFIED — delete mount reset; parse Location;
                                     #   pending-location across the welcome gate; mount Footer
  components/
    StudioFooter.tsx                 # NEW — project name + the journey row (US4 + US6;
                                     #   the footer IS the breadcrumb, Q7 — no separate bar)
    ProgressDot.tsx                  # NEW — one focusable mark, three classes:
                                     #   completed question / current position / upcoming
                                     #   stage, distinguished by size or shape (FR-043, FR-046)
    CompareScreen.tsx                # NEW — replaces PreviewScreen's role on this tab
    PreviewScreen.tsx                # DELETED (superseded by CompareScreen)
    OutputScreen.tsx                 # UNCHANGED (keeps usePreviewArtifact)
  hooks/
    useCompareArtifact.ts            # NEW — read-only pipeline, no onInstantiate
    usePreviewArtifact.ts            # UNCHANGED (FR-026: not renamed)
    useSurveyBrowserHistorySync.ts   # MODIFIED — re-derive premise (FR-017)
  decisions/
    progressDots.ts                  # NEW — assemble the journey row: completed dots from
                                     #   the decision record + current position from traversal
                                     #   + look-ahead from the projected path (FR-042, FR-049)
    DecisionEntryRow.tsx             # MODIFIED — add the jump affordance (FR-030)
    DecisionTrailView.tsx            # MODIFIED — read view state from the store
  dashboard/
    DashboardView.tsx                # MODIFIED — read `section` from the store
    manifestProjection.ts            # REUSED, not modified — the look-ahead's single source
                                     #   of "what is still on this author's path" (FR-049b)
    pathOverlay.ts                   # REUSED — walked-path derivation already computed here
  locales/{en,fr}/messages.json      # MODIFIED — retire nav.preview; add compare.* + footer.*

packages/studio/e2e/
  helpers/surveyFlow.ts              # MODIFIED — add switchTab (FR-082)
  tab-roundtrip.spec.ts              # NEW, gating (US1)
  compare-isolation.spec.ts          # NEW, gating (US2)
  decision-deeplink.spec.ts          # NEW (US3)
  footer-progress.spec.ts            # NEW (US4)
  browser-back.spec.ts              # MODIFIED — tab round trip mid-walk (SC-014)
  copy-edit.spec.ts, touch-derivation-us{1,2}.spec.ts, locale-switch.spec.ts  # MODIFIED
```

**Structure Decision**: Everything lands inside `packages/studio` — this is entirely SPA navigation and presentation, so no engine, contracts, or utilities package is touched, and no contract type gains a field.

## Constitution Check

Assessed before Phase 0 and re-checked against the final Phase 1 design (see the note below the table).

| Article | Assessment |
|---|---|
| I. Pattern schema is a locked contract | **PASS** — no change to `Pattern` or `Criterion`. `DecisionEntry` and `DecisionRecord` also live in `packages/contracts` under the same drift guards; the design deliberately derives every location from the `stepId` and `payload.questionId` those entries **already carry**, so no contract field is added, renamed, or retyped. |
| II. KeyboardIR is the engine spine | **PASS** — no codec, parse, or emit change. The Compare tab loads a foreign keyboard through the existing `useKeyboardArtifact` fetch/compile/parse path, which is already IR-based; nothing operates on raw `.kmn` text. |
| III. Single persistent working copy | **PASS**, and strengthened. The feature removes the Compare tab from the set of surfaces that can write the working copy (D-6), and adds no second working copy: `useCompareArtifact` holds a compiled artifact for display only and never instantiates. |
| IV. Validator layering is fixed / one 300 ms debounce | **PASS** — nothing here validates, and no timer is added. The view-state store is synchronous zustand with no debounce; location resolution is a pure function. The existing autosave and cloud-sync timers are untouched (and are outside D3's scope per CLAUDE.md). |
| V. VirtualFS only during authoring | **PASS** — no host-disk write. The Compare keyboard is loaded into memory and discarded; it is never serialized, never merged, and never reaches the output path. |
| VI. Team boundaries | **PASS with one declared hand-off.** Engine owns the change (SPA, navigation, stores). One surface is Content-owned and needs Content sign-off rather than an Engine edit-in-passing: retiring the `nav.preview` / `preview.heading` / `preview.pane.label` message ids in favour of new `compare.*` ids (FR-020, FR-073), called out in [research.md](research.md) D-8. Q1's resolution **removed** the second hand-off — no per-question opt-out field is added, so the question definitions are untouched. |
| VII. Out of scope for v1 | **PASS** — nothing imports or merges from a Compare keyboard (that would be multi-source merge, out of scope and explicitly excluded by the spec), no LDML, no touch-first authoring, no CJK/Ethiopic work. |
| VIII. House conventions | **PASS** — message ids follow the `area("."segment)+` rule; the retired id is not reused for the new meaning; no emoji in console output; docs use markdown links; commits use `<prefix>(<area>): <description>` with area `studio`. |

No violations, so there is no Complexity Tracking table.

**Post-design re-check**: the Phase 1 design adds seven new studio modules, one new store, and three new components, and removes one (`PreviewScreen.tsx`). It introduces no new package, no new dependency, no contract field, and no second router or traversal store (FR-006). The footer's look-ahead **reuses** `dashboard/manifestProjection.ts` rather than adding a second derivation of the remaining path, which keeps FR-049b satisfied without new machinery. Every Article above holds unchanged against the final design; the only open item is the Article VI hand-off, which is a sign-off, not a violation.

## Phase 0 — Research

See [research.md](research.md) for the nine decisions with rationale and rejected alternatives. The load-bearing one: the D-1 fix is a **deletion**, verified against both explicit start-over call sites, not a new session-identity mechanism.

## Phase 1 — Design

- [data-model.md](data-model.md) — `Location`, `LocationResolution`, `ViewState`, `ProgressDot`, `CompareSession`.
- [contracts/location-grammar.md](contracts/location-grammar.md) — the hash grammar, the resolver signature, the jump primitive.
- [contracts/ui-contract.md](contracts/ui-contract.md) — message ids, accessible names, test identifiers, and the e2e spec/helper names the spec pins verbatim.
