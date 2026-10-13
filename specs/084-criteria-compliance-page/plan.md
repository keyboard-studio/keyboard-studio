# Implementation Plan: Criteria compliance page (spec 084)

**Spec**: `specs/084-criteria-compliance-page/spec.md` (PR #1937, merged
2026-10-05, planning-only) + Amendment 2026-10-13 in the same file
(Compare-tab button, yellow-band attestation, corrected check counts).
**Branch for this plan**: `spec/084-criteria-plan` off `origin/main`
@ 9fa2f17d. **Status**: planned, not implemented.
**Owner directive for the amendment**: 2026-10-13 — the page is mainly
for the output (studio-built) keyboard, plus a button on the existing
preview tab to check an existing keyboard.

All counts and APIs below were verified against `origin/main` on
2026-10-13, not copied from the original spec text. Two of the spec's
numbers were wrong and are corrected here (see §2).

---

## 1. What ships

Two surfaces, one resolver, one presentation:

1. **Authored mode — a new top-level page.** Route token `criteria`
   (label "Criteria"), following the Decisions-trail precedent
   (`trail` route + `NAV_ITEMS` entry + `StudioShell` case). It judges
   the author's own keyboard — the same artifact the Output screen
   would ship. The Output screen gains a summary card (counts +
   "View criteria" link) so the page is discoverable from the place
   Matthew named as its main home; the page itself is not a section
   of Output, because it must also be reachable before Output is
   unblocked and deep-linkable like `#trail`.
2. **Foreign mode — a "Check criteria" button on the Compare tab**
   (`#preview`, `CompareScreen`). It opens an **inline panel inside
   `CompareScreen`**, reusing the same list/row components with
   `mode: "foreign"`. It deliberately does **not** navigate to the
   `criteria` route: the foreign keyboard must never be handed over
   through the working-copy store (spec 057 FR-023 isolation, §5).

Both modes render all **149 criteria in 19 sections**, grouped in
catalog order, each row collapsed by default and expandable to its
evidence, under a summary header computed from the **same** resolution
pass as the rows (never a second derivation).

## 2. Verified facts the plan rests on

- **Catalog**: `packages/contracts/data/criteria.json` = 149 rows,
  19 sections, bands **40 scaffolder-bake / 67 layer-c-enforce /
  32 yellow-survey / 10 red-checklist**. Type is a discriminated union
  on `band` (`packages/contracts/src/criteria.ts`); each variant
  carries only its own hook (`scaffolderRule` | `lintRuleId` |
  `surveyQuestionId` | `preSubmitChecklistText`). Loader:
  `criteriaData.ts` (`ALL_CRITERIA`, `CRITERIA_BY_BAND`, zod-validated).
  All 67 `lintRuleId`s are distinct → a 1:1 code→criterion map is safe.
  (Stale "148 entries" comments in `criteria.ts`/`criteriaData.ts`
  are not to be copied.)
- **Implemented layer-c checks: 19 of 67, not ~26.** Verified by
  scanning `packages/keyboard-lint/src/checks/**` for emitted codes
  (the repo's own `gateCoverage.test.ts` method): the 13 doc codes,
  `KM_LINT_INVENTORY_UNCOVERED`, and the 5 §18 `KM_WARN_*` criteria
  codes. **48 layer-c criteria therefore resolve Not yet checkable**
  in v1. The "~26 implemented" shorthand counts emitted codes
  (28 total), not criteria-mapped ones. The spec text is amended.
- **9 emitted lint codes have no criteria row** (e.g.
  `KM_LINT_TOUCH_UNCOVERED`, `KM_LINT_TOUCH_KEY_NO_RULE`,
  `KM_WARN_CONTEXT_NOT_TOLERANT`). The resolver ignores unmapped
  codes for status purposes; it must not invent rows for them.
- **Lint engine API**: `@keymanapp/keyboard-lint` exports
  `KeyboardLintEngine.lintWithContext(fs: VirtualFS, keyboardId,
  ctx: LintContext): Promise<LintFinding[]>` and the pure sync
  `runDocChecks(DocLintInput)`. Context is opt-in per check family
  and absent context is **silently skipped** — so the assembly in
  §4 is load-bearing: whatever it fails to supply becomes a check
  that never ran, and the resolver must be able to say so.
  Criteria-mapped codes need only: doc checks (13, via
  `ctx.docLintInput`), §18.1–18.5 touch checks (5, run by the engine
  from the VFS itself when the touch layout parses), §18.6
  `KM_LINT_INVENTORY_UNCOVERED` (needs `ctx.keyboardIR` +
  `ctx.inventory`). §19's two criteria are scaffolder-bake, so
  `toleranceReport` is **not** needed for criteria mapping.
- **No production caller assembles a full `LintContext`.** The only
  whole-engine caller is a test (`decisions/successCriteria.sc004
  .test.ts`). Production runs doc checks only, via
  `hooks/useDocumentationFindings.ts` →
  `lib/collectDocLintInput.ts` → `runDocChecks`, rendered by
  `components/DocumentationFindingsSummary.tsx`. §4 reuses that path
  for the doc band instead of duplicating it.
- **Yellow band cannot be resolved by lookup — the spec's premise
  is false today.** None of the 32 `surveyQuestionId`s is a key in
  any question module, flow, decision, or the survey answer store
  (`stores/surveyAnswerStore.ts` is keyed by real step/question ids;
  verified: 18 ids appear nowhere else, 14 only inside the criteria
  content-i18n sidecars as part of criterion ids). No answer
  semantics for them exist anywhere. §3 decision D3 resolves this.
- **Criterion text is already localized content**: Tier B
  `contentI18n` has a `"criteria"` catalog
  (`content.criteria.<slugified-id>.<field>`, en/fr sidecars). The
  page renders description/section through
  `resolveContentString("criteria", …)`; only chrome (status names,
  buttons, headers) is new Tier A Lingui strings under `criteria.*`.

## 3. Decisions taken in this plan (lead rulings — reversible, each with its alternative)

- **D1 — Own route + Output entry card + Compare inline panel.**
  Alternative considered: page as a section of `#output` only.
  Rejected: Output is gated (inventory-coverage block), the
  demonstration read must be reachable and deep-linkable
  independently, and the trail precedent (`#trail`) is the pattern
  the spec itself names. Risk of D1: one more nav item — mitigated
  by labelling it plainly "Criteria" and linking it from Output.
- **D2 — One resolver, two modes.** `resolveCriteria(input)` is a
  pure function; mode is an input (`"authored" | "foreign"`), not a
  forked implementation. The two modes differ only in which inputs
  exist (§5 table). Risk: a mode flag creeping into row components —
  contained by resolving *status + evidence + available controls*
  in the resolver, so components render what they are handed.
- **D3 — Yellow band = author attestation on the page itself.**
  Since no survey questions exist for the 32 ids (§2), US4's
  "answerable in place where the survey infrastructure allows" is
  implemented by making the page the infrastructure: a Needs author
  row expands to the criterion as a question with **Yes / No /
  Not applicable** controls; the answer is recorded per project
  (D5) and resolves the row to Met / Not met / Not applicable.
  Alternative considered: mint 32 real survey questions and wire
  them into flows. Rejected for v1: it changes the authoring walk
  for every user to serve a compliance surface, and most yellow
  criteria are package-level facts (copyright, fonts, help text)
  with no natural walk step. Recorded as a follow-up possibility,
  not a silent omission.
- **D4 — Red band = per-project confirmation on the page**, same
  record as D3: Needs human → expand → checklist text + Confirm
  (and Unconfirm). Confirming updates row + header in place (US4).
- **D5 — One new store, draft-carried, append-only style.**
  `stores/criteriaRecordStore.ts` holds
  `attestations: Record<criterionId, {answer, at}>` and
  `confirmations: Record<criterionId, {at}>` for the **authored
  project only**, mirroring the decision record's style. It is
  carried in the draft envelope exactly as the decision set is
  (`draftPersistence.ts` `getDecisionSnapshot()` pattern): additive
  field, old drafts load with an empty record, no schema break.
  It is never written from the Compare surface (FR-023).
- **D6 — Foreign scaffolder-bake rows = Not yet checkable**, with
  evidence text "guaranteed by the scaffolder for studio-created
  keyboards; not verified for this keyboard". No scaffolder ran,
  and no implemented check maps to the `scaffolderRule` hooks, so
  any other status would be a false claim. (Checking them from
  source = implementing new lint checks = spec non-goal.)
- **D7 — Applicability is explicit, small, and conservative.**
  v1 predicates, all derived from VFS/IR facts: §9 font criteria →
  Not applicable when the package bundles no font; §15 deprecation
  criteria → Not applicable for a keyboard that is not deprecated;
  §16 partner criteria → Not applicable when the package is not a
  partner package. Everything else defaults to applicable.
  A criterion may become Not applicable **only** via a named
  predicate with its evidence shown; never by absence of data.
- **D8 — New `criteria/` folder gets its own depcruise rule**
  mirroring `decisions-layer`: `criteria/` may depend on
  `contracts`, `ui/`, `flags/`; forbidden: `stores/`, `components/`,
  `editors/`, `dashboard/`. The view reads no store; `StudioShell`
  (authored route) and `CompareScreen` (foreign panel) assemble
  inputs and pass plain props — the `DecisionTrailView` contract.
- **D9 — Evidence is lazy, like the trail's impact resolver.** Rows
  receive a resolver, not prebuilt evidence; mounting 149 rows
  computes nothing beyond statuses/counts. Lint runs once per
  keyboard/VFS change in the host hook, not per row.

## 4. Architecture

```
packages/studio/src/criteria/
  resolveCriteria.ts        pure: catalog + inputs -> { rows, counts }
  resolveCriteria.test.ts   fixture-driven status matrix (both modes)
  criteriaTypes.ts          CriterionStatus, ResolvedRow, CriteriaInput…
  applicability.ts          D7 predicates (pure, evidence-carrying)
  CriteriaPage.tsx          list + summary header (props only, no stores)
  CriterionRow.tsx          expandable row, explicit arm per status
  CriteriaSummary.tsx       header counts (from resolver result, D9)
  assembleLintContext.ts    VFS + IR + inventory -> LintContext (pure-ish)
packages/studio/src/hooks/
  useCriteriaFindings.ts    authored: doc findings (reuse
                            useDocumentationFindings path) + engine
                            lintWithContext over the output artifact VFS
  useCompareCriteria.ts     foreign: engine over useCompareArtifact's
                            stage.vfs + VFS-derived DocLintInput
packages/studio/src/lib/
  collectDocLintInputFromVfs.ts   DocLintInput from a bare VFS
                            (foreign mode; authored mode keeps the
                            existing collectDocLintInput projection)
packages/studio/src/stores/
  criteriaRecordStore.ts    D5 attestations + confirmations
packages/studio/src/components/
  CompareScreen.tsx         + "Check criteria" button + inline panel
  OutputScreen.tsx          + criteria summary card linking to #criteria
packages/studio/src/lib/
  location.ts / navItems.ts + "criteria" RouteId + NAV_ITEMS entry
  StudioShell.tsx           case "criteria": assemble + render page
.dependency-cruiser.cjs     + criteria-layer rule (D8)
docs/spec-trace.json        084 entry: status, implements[], notes
```

**Resolver contract** (`resolveCriteria`): inputs are
`{ criteria, mode, lintFindings, docFindings, record
(attestations/confirmations | empty), facts (fontBundled,
deprecated, partnerPackage, keyboardLabel) }`; output rows carry
`{ criterion, status, evidence: () => EvidenceModel, controls:
"attest" | "confirm" | null }`. Status resolution per band:

| Band | Authored | Foreign |
|---|---|---|
| scaffolder-bake (40) | **Met** (by construction) | **Not yet checkable** (D6) |
| layer-c, check implemented (19) | Met / Not met from findings by `lintRuleId` | same, over foreign VFS |
| layer-c, not implemented (48) | **Not yet checkable** | **Not yet checkable** |
| layer-c, implemented but context unavailable (e.g. no inventory for §18.6) | **Not yet checkable**, evidence names the missing input — never Met | same |
| yellow-survey (32) | attested → Met / Not met / N/A; else **Needs author** | **Needs author**, no controls |
| red-checklist (10) | confirmed → Met; else **Needs human** | **Needs human**, no controls |
| any band, D7 predicate | **Not applicable** + evidence | same |

Header counts are tallied from the emitted rows in the same pass.
Maximum resolvable in v1, authored mode: 40 + 19 + 32 + 10 =
**101 of 149**, with 48 honestly Not yet checkable (before D7
Not applicable adjustments). Foreign mode: at most 19 mechanically
resolved; the rest are Not yet checkable / Needs author /
Needs human. Both numbers are stated on the surfaces themselves —
that honesty *is* the demonstration (spec US5).

**Authored lint assembly** (`useCriteriaFindings`): judge what
would ship — the output artifact pipeline's VFS (the same
`usePreviewArtifact` stage Output downloads from), not `startVfs`
(the base's files). Doc findings come from the existing
`useDocumentationFindings()` result (which already handles the
rendered-docs projection and upstream origin reclassification;
a finding's `origin: "upstream"` is shown in evidence, and the
criterion still resolves Not met). Engine findings from
`lintWithContext(vfs, keyboardId, ctx)` with `ctx.keyboardIR`
parsed from that same VFS via the engine codec (`parseKmn`, the
baseIr pipeline's own route, so IR matches judged source exactly)
and `ctx.inventory` built from the author's alphabet decisions
(the `LinguistInventory` shape in contracts); when no inventory
can be built yet, §18.6 alone degrades per the table above.
`ctx.docLintInput` is **not** passed to the engine (doc findings
already arrive via the existing path — passing both would
double-count the 13 doc codes; the resolver dedupes by code
regardless, and a test pins that).

**Foreign lint assembly** (`useCompareCriteria`): gated on
`stage.kind === "ready"`; engine over `stage.vfs` +
`stage.keyboardId`; `docLintInput` from
`collectDocLintInputFromVfs` (a foreign package ships real files,
so members are read directly from the VFS — simpler than the
authored rendered-docs projection); IR parsed from the VFS;
inventory unavailable → §18.6 Not yet checkable.
**Known caveat, verified as a task (T5.3):** the Compare `ready`
VFS is a preview snapshot the compile pipeline may have mutated in
place (e.g. `stripDanglingAssetStores`). The panel header states
it judges the loaded keyboard as previewed; T5.3 compares verdicts
on a fixture keyboard against a direct engine run on the pristine
fetched VFS and documents any difference before this ships.

## 5. Compare isolation (spec 057 FR-023) — hard constraints

- The button adds **no** `onInstantiate`, scaffold spec, or VFS
  transform: `useCompareArtifact`'s `useKeyboardArtifact(kb, null,
  null, null)` call is untouched, and `CompareShell.test.tsx`'s
  mechanical assertions (args 1–3 null, no `useWorkingCopyTransform`,
  working copy byte-identical after a session) must stay green —
  extended with the same snapshot assertion **after** clicking
  "Check criteria" and expanding rows.
- No writes to `workingCopyStore`, `surveySessionStore`,
  `decisionStore`, `decisionLogStore`, or the new
  `criteriaRecordStore`. Panel open/closed state is view state only
  (`viewStateStore`, session-scoped, never serialized).
- No attestation/confirmation controls in foreign mode (D2/D5);
  rows render status + evidence text only.
- Button placement: left pane, under `MetadataCard`, above
  `KmnSourceView` — beside the source it judges; the panel expands
  inline below it. Disabled-with-reason when no keyboard is loaded
  or `stage.kind !== "ready"` (absence = a statement, per house
  pattern), never silently missing.

## 6. UI / i18n / theme conventions

- Components copy `DecisionTrailView`/`DecisionEntryRow` structure:
  group headers in catalog order (never re-sorted in the view),
  collapsed-by-default rows, disclosure buttons with
  `aria-expanded`/`aria-controls`, every absence rendered as a
  statement with an explicit arm per status — no trailing `else`
  absorbing new statuses.
- A identifiers-guard test mirrors
  `DecisionEntryRow.identifiers.test.tsx`: rendered text must not
  leak internal identifiers (`criterion.id`, `surveyQuestionId`,
  band names). Sole deliberate exception, per spec 084: the
  `lintRuleId` may appear **inside expanded evidence only**, for
  traceability — never in headlines or status labels.
- i18n: chrome strings are Tier A Lingui with `criteria.*` ids
  (status names, buttons, header, notices, Compare button/panel);
  counts via `plural()`; criterion description/section via Tier B
  `resolveContentString("criteria", …)`. Run
  `messages:extract`/`messages:compile`; `i18n-catalog-lint`,
  `content-i18n-freshness`, `content-i18n-lint` must pass.
- Theme: CSS vars / `ui/theme.ts` constants only; token-lint starts
  a new file at zero allowance. No hard-coded colors.
- Routing: token `criteria` added to `RouteId` + `ROUTES`
  (`lib/location.ts`), `NAV_ITEMS` (`lib/navItems.ts`), and the
  `StudioShell` switch; navigation only via `navigateTo()`.
  The token is permanent once chosen (spec 057 contract §1).

## 7. Testing & gates

- **Resolver unit tests** (the core gate): fixture project with
  known findings/answers/confirmations per band; assert every one
  of the 149 rows present, exactly one status each, header counts
  == row counts, unimplemented layer-c never Met, context-missing
  §18.6 never Met, doc-code dedupe, foreign-mode table (D6,
  control-less yellow/red), D7 predicates with evidence.
- **Counts test against the real catalog**: bands sum to 149;
  implemented-code set derived by the gateCoverage scanning method
  is pinned at 19 with a comment naming the method, so adding a
  lint check visibly moves a criterion out of Not yet checkable.
- **Component tests**: page + row via `test/renderWithI18n.tsx`
  (real en catalog, no live stores), header/row agreement,
  attestation + confirmation interactions update counts without
  reload (US4), identifiers guard (§6).
- **Store tests**: criteria record round-trips through the draft
  envelope; a pre-084 draft (no field) loads with an empty record.
- **Compare**: `CompareShell.test.tsx` extensions per §5.
- **E2E smoke**: authored walk → open Criteria from Output card →
  counts render; Compare → load a catalog keyboard → Check
  criteria → panel renders, working copy untouched.
- **Repo gates**: `pnpm lint` (depcruise incl. new rule, eslint,
  token-lint, i18n lints, spec-number-lint, test-antipattern-lint),
  `tsc --noEmit`, studio + contracts + keyboard-lint suites,
  `test:spec-trace` after updating the 084 trace entry
  (status/implements/notes) and re-acknowledging the amended spec.

## 8. Non-goals (unchanged from spec, reaffirmed)

Implementing any of the 48 unimplemented layer-c checks;
remediation proposals ("here's the fix") — a follow-up spec;
pre-submit gating (the page never blocks download or submit —
the `DocumentationChecklist` "never blocks" precedent); automatic
side-by-side comparison of two keyboards (the foreign panel is a
single-keyboard read; D1's shared resolver does not preclude a
future diff view); minting the 32 yellow criteria as survey-walk
questions (D3 alternative, follow-up only).

## 9. Risks

- **Silent-skip lint context** (§2): mitigated by making the
  resolver context-aware — a check that didn't run is a visible
  Not yet checkable with a named reason, never an assumed pass.
- **Preview-VFS mutation on Compare** (§4): T5.3 verification
  before ship; panel copy states what was judged.
- **Nav crowding / route permanence** (D1): token chosen once,
  label plain; Output card carries discovery so the nav item is
  not the only door.
- **Attestation fatigue** (32 yellow rows): rows group by section
  and answered rows collapse into counts; no bulk-answer control
  in v1 (a bulk "answer all" would defeat the honesty purpose).
