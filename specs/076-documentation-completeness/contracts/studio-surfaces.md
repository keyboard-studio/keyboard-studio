# Contract: Studio surfaces (spec 076, FR-017 / FR-021 / Article IX)

The four new user-facing surfaces and their manifest/store contracts.

## 1. Base documentation classification (US4, FR-008)

- **Where**: `choose_base` step — `BaseResolution` suggestion cards and
  `MetadataCard` for the selected base.
- **Shows**: `BaseDocumentationProfile.level` as "documentation: none | minimal |
  full"; `unknown` renders as no badge (never as "none").
- **Data**: `classifyBaseDocumentation` over the base's already-fetched `.kps`
  manifest + a lazy welcome-probe fetch for the focused base; cached per base id.
- **Manifest**: display-only addition to the existing editor step; `specRef` gains
  `specs/076-documentation-completeness`. No writes.

## 2. Adaptive description proposal (US4, FR-009)

- **Where**: existing `pf_welcome_paragraph` question in the `phase_f_helpdocs` flow.
- **Behavior**: on an adaptation whose base `hasUsableDescription`, the question is
  prefilled with the base description (extracted per the spec's usable-description
  rule) and `required` is waived — accept/edit/replace in one action
  (propose-then-confirm, §3c). Net-new, copy (Track 1), or base without a usable
  description: required, unfilled — exactly today (FR-009, US4-3/4-4).
- **Write path**: unchanged — `extractHelpDocs` → `setHelpDocs` (store slice, not IR;
  the `mutate()` seam governs IR paths only).

## 3. HISTORY proposal (US5, FR-010..012)

- **Where**: new question `pf_history_entry` in `phase_f_helpdocs` (flow YAML id +
  question module + `registry.f.ts` entry; `registerQuestionSteps` picks it up).
- **Shows**: the `buildHistoryProposal` heading + bullets; actions confirm / edit
  bullets / dismiss.
- **Write path**: new store action `setHistoryEntryState(state: HistoryEntryState)`
  on `workingCopyStore`, persisted via `persistWorkingCopy` (both snapshot and
  rehydrate), allowlisted in the mutation-name list. Not an IR write.
- **Manifest**: question module declares `inputs: []`, `writes: []` (store-slice
  pattern per spec 061 precedent), `specRef: "specs/076-documentation-completeness"`.

## 4. Output documentation checklist (US3, FR-017/FR-018)

- **Where**: `OutputScreen.tsx`, between the download section and
  `ManagedPRSubmitPanel`. Component `DocumentationChecklist`.
- **Shows**: six rows from `deriveDocMemberStates` — member name, source-tier label
  (derived / inherited / authored), placeholder marker, per-row warnings (e.g.
  missing inherited images). Visible without scrolling within the pane (SC-006);
  disclosure pattern per `RemovalBanner` precedent.
- **Row action**: placeholder rows render "Go to <step>" using existing store nav
  actions + `navigateTo` (never `advance()` — documented P0 regression). Targets:
  `help` step for description/HISTORY members; welcome/chart members point at the
  step recorded in `DocMemberState.fillStepId`.
- **Never blocks**: the checklist reads state only; it is wired into neither
  `canDownload` nor `submitEnabled`. Regression test: download + submit succeed with
  every row on placeholder (US3-3, SC-006).
- **Accessibility**: rows are a list with programmatic labels; state changes ride
  existing live regions (docs/accessibility.md house rules; no new aria-live timer).

## 5. Layout-chart preference (US6, FR-015 / FR-021)

- **Where**: the welcome row of `DocumentationChecklist` on the Output step.
- **Shows**: current `ChartPreference` ("keep base images" / "regenerate layout charts");
  only meaningful when the base ships images — otherwise charts are always generated.
- **Write path**: `setChartPreference(pref)` store action; not an IR write.
- **Manifest**: rides the Output step `specRef` extension from surface 4; declared in
  research R11.

## Store additions (workingCopyStore)

| Slice | Type | Persisted | Set by |
|---|---|---|---|
| `historyEntryState` | `HistoryEntryState \| null` | yes | `setHistoryEntryState` |
| `chartPreference` | `ChartPreference` | yes | `setChartPreference` |
| `baseReadmeMdText` / `baseHistoryMdText` | `string \| null` | yes | instantiation (adapt branch) |
| `baseWelcomeImages` | `Array<{path, bytes}> \| null` | yes (size-budgeted) | instantiation (both tracks — images only on Track 1) |
| `baseDocProfile` | `BaseDocumentationProfile \| null` | yes | base selection |
| `baselineDocFindings` | `LintFinding[] \| null` | yes | computed once at instantiation (FR-020) |

All slices follow the existing patterns: declared defaults, identity-guarded setters,
mutation-name allowlist entries, `persistWorkingCopy` snapshot + rehydrate coverage.
