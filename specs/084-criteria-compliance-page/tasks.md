# Tasks: Criteria compliance page (spec 084)

Implementation breakdown for `plan.md`. Phases are sequential
unless marked parallel; every phase ends green on its named gates
before the next starts. File paths are the plan's expected homes.

## Phase 0 — Spec amendment & trace (docs only)

- [ ] T0.1 Amend `specs/084-criteria-compliance-page/spec.md`:
      Amendment 2026-10-13 (Compare button = US6, D3 attestation,
      D6 foreign bake handling, corrected counts 19 implemented /
      48 not yet checkable), status Proposed → Approved-for-plan.
- [ ] T0.2 Update `docs/spec-trace.json` 084 entry (notes reflect
      the amendment) and re-acknowledge via
      `utilities/spec-trace` (`pnpm test:spec-trace` green).

## Phase 1 — Resolver core (pure, no UI) [foundation]

- [ ] T1.1 `criteria/criteriaTypes.ts`: `CriterionStatus` (six
      statuses), `ResolvedRow`, `CriteriaFacts`, `CriteriaInput`,
      `CriteriaResult { rows, counts }`.
- [ ] T1.2 `criteria/resolveCriteria.ts`: single-pass resolution
      per plan §4 table; findings indexed by `lintRuleId`
      (deduped by code); controls resolved here (`attest` /
      `confirm` / null), never in components.
- [ ] T1.3 `criteria/applicability.ts`: D7 predicates (font,
      deprecation, partner) returning status + evidence or null.
- [ ] T1.4 `resolveCriteria.test.ts`: full status matrix both
      modes (plan §7); 149-row completeness; header==rows;
      unimplemented/context-missing never Met; unmapped codes
      ignored.
- [ ] T1.5 Catalog counts test: real `ALL_CRITERIA` sums to 149
      (40/67/32/10); implemented-code set pinned at 19 via the
      gateCoverage scanning method.

## Phase 2 — Lint assembly (authored) [depends: 1]

- [ ] T2.1 `criteria/assembleLintContext.ts`: VFS + parsed IR +
      optional inventory → `LintContext` (no `docLintInput` —
      doc band arrives via T2.2; dedupe pinned by test).
- [ ] T2.2 `hooks/useCriteriaFindings.ts`: output-artifact VFS
      (Output's pipeline), `useDocumentationFindings()` for doc
      findings, `KeyboardLintEngine.lintWithContext` for the
      rest; IR via engine `parseKmn` over the same VFS; inventory
      from alphabet decisions, absent → §18.6 degrades visibly.
- [ ] T2.3 Tests: fixture VFS with known failures (HISTORY order,
      touch rows, inventory gap) → expected findings by code;
      no-inventory fixture → §18.6 absent, others present.

## Phase 3 — Attestation / confirmation record [depends: 1; parallel with 2]

- [ ] T3.1 `stores/criteriaRecordStore.ts` (D5): attestations
      (Yes/No/Not applicable + timestamp), confirmations
      (+ timestamp, unconfirm), authored project only.
- [ ] T3.2 Draft wiring in `lib/draftPersistence.ts`: additive
      envelope field via the `getDecisionSnapshot()` pattern;
      pre-084 drafts load with an empty record.
- [ ] T3.3 Tests: store behaviour + draft round-trip + legacy
      draft load.

## Phase 4 — Authored page + route + Output card [depends: 1, 2, 3]

- [ ] T4.1 `criteria/CriteriaSummary.tsx` + `CriterionRow.tsx` +
      `CriteriaPage.tsx`: trail-pattern list, catalog-order
      section groups, lazy evidence (D9), explicit arm per
      status, attestation/confirmation controls (authored only).
- [ ] T4.2 Route: `criteria` in `lib/location.ts` (`RouteId`,
      `ROUTES`), `lib/navItems.ts`, `StudioShell` case assembling
      inputs from stores/hooks and passing plain props (D8).
- [ ] T4.3 Output card: counts summary + link in
      `components/OutputScreen.tsx` via `navigateTo()`.
- [ ] T4.4 Depcruise `criteria-layer` rule (D8) in
      `.dependency-cruiser.cjs`; `pnpm lint` depcruise green.
- [ ] T4.5 i18n: `criteria.*` Tier A strings (extract/compile,
      catalog lints green); Tier B criterion text via
      `resolveContentString("criteria", …)`.
- [ ] T4.6 Component tests: `renderWithI18n` fixtures, header/row
      agreement, US4 interactions update counts live,
      identifiers guard (lintRuleId only inside expanded
      evidence).

## Phase 5 — Compare-tab button (foreign mode) [depends: 1, 4]

- [ ] T5.1 `lib/collectDocLintInputFromVfs.ts`: `DocLintInput`
      from a bare VFS + keyboard id/metadata; tests on a fixture
      package VFS.
- [ ] T5.2 `hooks/useCompareCriteria.ts`: gated on
      `stage.kind === "ready"`; engine over `stage.vfs`, IR from
      VFS, no inventory, empty record, `mode: "foreign"`.
- [ ] T5.3 **Verification**: fixture keyboard verdicts via Compare
      vs direct engine run on pristine fetched VFS; document any
      preview-mutation difference in this file/PR; panel header
      copy states what was judged.
- [ ] T5.4 `components/CompareScreen.tsx`: "Check criteria"
      button (left pane, under `MetadataCard`), disabled-with-
      reason unless ready; inline panel reusing Phase 4
      components with controls suppressed; open state in
      `viewStateStore` only.
- [ ] T5.5 Extend `components/CompareShell.test.tsx`: isolation
      assertions hold after clicking Check criteria + expanding
      rows (args null, no transform, working copy byte-identical,
      no criteria-record writes).

## Phase 6 — Verification & ship [depends: 4, 5]

- [ ] T6.1 Full gates: `pnpm lint` (all lints incl. token,
      i18n, spec-number, test-antipattern), `tsc --noEmit`,
      studio/contracts/keyboard-lint suites, `test:spec-trace`
      with the 084 entry updated (status, `implements[]`, notes).
- [ ] T6.2 E2E smoke both surfaces (plan §7): authored walk →
      Criteria via Output card; Compare → catalog keyboard →
      Check criteria; working copy untouched.
- [ ] T6.3 Golden-walk / corpus gates unaffected (no walk, flow,
      or compile changes in this spec — confirm no snapshot
      churn beyond the new nav item / Output card).
- [ ] T6.4 PR with the km-lead quality-gate table; on merge,
      "Over and out!" on the owning issue.
