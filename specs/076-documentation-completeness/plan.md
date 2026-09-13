# Implementation Plan: Documentation completeness — every package ships its full documentation set

**Branch**: `076-documentation-completeness` | **Date**: 2026-09-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/076-documentation-completeness/spec.md`

## Summary

Every produced package ships all six documentation members, each filled from the best
available tier (derived → inherited → authored). The work decomposes along the seven
user stories: (P1) the fresh help page gains the corpus-standard PHP header inside the
existing `renderHelpPhp` fresh-document branch; (P2) the welcome page migrates to the
`source/welcome/` folder convention across the three hard-coded sites (loader fetch,
projection write, descriptor build/patch) with base images fetched and carried; (P3) an
informational documentation checklist on the Output step reads a new pure
`deriveDocMemberStates` derivation; (P4) a `BaseDocumentationProfile` classifier at
base selection drives an adaptive (prefilled, conditionally-required) description
question; (P5) a HISTORY proposal built from the existing decision-audit record,
confirmed on a new Phase F screen; (P6) a deterministic engine-side SVG layout-chart
renderer over `TouchLayoutIR`/`KvksIR`/`KeyboardIR`; (P7) thirteen warning-level Layer C
codes in twelve check modules in `@keymanapp/keyboard-lint` wired through a memoized studio hook (no new
timer), with the missing `origin: "upstream"` producer built from base baselines. All
design decisions with rationale: [research.md](research.md); entities:
[data-model.md](data-model.md); interfaces: [contracts/](contracts/).

## Technical Context

**Language/Version**: TypeScript 5.x, Node ≥ 22.19.0, pnpm 9 monorepo

**Primary Dependencies**: `@keyboard-studio/contracts` (types + zod mirrors),
`@keyboard-studio/engine` (renderers, loader, descriptor, output),
`@keymanapp/keyboard-lint` (Layer C, contracts-only dep), studio React 18 + Vite +
Zustand. No new external dependencies (the 11.5 HTML scanner and the SVG emitter are
dependency-free by design — research R7, R1).

**Storage**: in-memory VirtualFS during authoring; working-copy slices persisted via
the existing `persistWorkingCopy` snapshot (new slices: `historyEntryState`,
`chartPreference`, base doc texts/images, `baseDocProfile`, `baselineDocFindings`)

**Testing**: vitest per package (engine, keyboard-lint, contracts, studio), Playwright
E2E (`copy-edit.spec.ts` walk extension), offline corpus sweep utility for SC-002

**Target Platform**: browser SPA (studio) + node-testable engine/lint packages;
output artifacts consumed by Keyman desktop/mobile installers and the
keymanapp/keyboards help site

**Project Type**: pnpm workspace monorepo (contracts / engine / keyboard-lint / studio)

**Performance Goals**: doc checks + tier derivation are synchronous pure functions
memoized inside the existing validation/render cycle (D3: no new timer); base
classification adds at most one lazy welcome-probe fetch per focused base

**Constraints**: byte-identical documentation + charts across productions (SC-004,
FR-014); managed-PR path submits text entries only (charts must be SVG text —
research R1); Layer C severity ceiling is `warning` (FR-018); no criteria.json edits
(all 13 rows exist with `lintRuleId` populated); Layer C currently has **no runtime
invocation** and `origin: "upstream"` has **no producer** — both are built here
(research R7, R8)

**Scale/Scope**: 6 doc members × 3 tiers × 2 tracks; 13 lint codes in 12 check modules; ~730
folder-convention bases must survive adaptation (SC-002 full-corpus sweep); 1026-base
corpus for classification

## Constitution Check

*GATE: evaluated pre-Phase-0 and re-evaluated post-Phase-1 design — PASS (no
violations; no Complexity Tracking entries).*

| Article | Verdict | Evidence |
|---|---|---|
| I — Pattern schema locked | PASS | `Pattern`/`Criterion` types untouched. New contracts types (`DocMemberState`, `BaseDocumentationProfile`, `HistoryEntryState`, `LayoutChartFile`, `DocLintInput`) are additive with zod mirrors + drift guards. criteria.json: **zero row edits** — existing `lintRuleId`s are string-matched (research R7). |
| II — KeyboardIR spine | PASS | Chart renderer and doc derivations read typed IR (`KeyboardIR`, `KvksIR`, `TouchLayoutIR`) via existing accessors; no raw `.kmn` manipulation; no codec changes. |
| III — Single working copy | PASS | All new state is `workingCopyStore` slices; documentation materializes only at projection (step 5c extension); no second copy, no intermediate serialization. |
| IV — Validator layering / D3 | PASS | The 12 check modules (13 codes) live in `@keymanapp/keyboard-lint` (Layer C), contracts-only inputs. Runtime wiring is a memoized synchronous hook per the `useTouchKeyDiagnostics` precedent — **no second debounce timer, no parallel validation path**. Warning severity respects the Layer C ceiling. Where spec.md self-conflicts on Layer C cadence (:576 vs :649), FR-019's wording governs; noted for a spec-signoff clarification, not resolved unilaterally here. |
| V — VirtualFS only | PASS | Welcome folder, charts, HISTORY render into the projected VFS at output; loader fetches remain fetch-don't-write; no host-disk writes. Charts are text SVG so the shared projection stays PR-safe (no binary/compiled artifacts added to submission paths). |
| VI — Team boundaries | PASS | **Engine team owns every change** (loader, renderers, descriptor, lint, studio surfaces) **except** the `pf_history_entry` / adaptive-description question wording and checklist copy, owned by content (spec assumption, restated per-task in tasks.md). |
| VII — Out of scope v1 | PASS | Single-language docs preserved (existing `pf_doc_language` untouched); no multi-language welcome variants, no LDML, no touch-first authoring. FR-014/SC-004's byte-identical *output* across productions is determinism of generated files, not the codec `.kmn` round-trip fidelity Article VII excludes. |
| VIII — House conventions | PASS | No emoji in console/utility output; commit style `<prefix>(<area>): …`; no issue numbers in shipped code. |
| IX — Manifest / mutate seam | PASS | All five new surfaces declared (contracts/studio-surfaces.md; research R11): new question module `pf_history_entry` registered via the standard registry path; display-only additions and the chart-preference control extend existing steps' `specRef`. Docs answers are store-slice writes (spec-061 pattern), not IR writes — the `mutate()` seam governs IR paths and is not bypassed (FR-021 states this explicitly). |

## Project Structure

### Documentation (this feature)

```text
specs/076-documentation-completeness/
├── plan.md              # This file
├── research.md          # Phase 0 — 13 resolved decisions (R1–R13)
├── data-model.md        # Phase 1 — entities & relationships
├── quickstart.md        # Phase 1 — validation scenarios
├── contracts/
│   ├── engine-api.md    # renderer/derivation/loader/descriptor contracts
│   ├── help-header.md   # the standard help-site header block (US1)
│   ├── lint-checks.md   # 13 codes / 12 modules: wiring, SC-007
│   └── studio-surfaces.md # 4 surfaces + store slices (FR-021/Article IX)
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/contracts/src/
├── doc-members.ts               # NEW: DocMemberId/State, BaseDocumentationProfile,
│                                #   HistoryEntryState, ChartPreference, DocLintInput
├── schemas.ts                   # zod mirrors + drift guards for the above
└── keyboard-ir.ts               # unchanged (KvksIR/TouchLayoutIR consumed as-is)

packages/engine/src/
├── layout-chart/                # NEW: renderLayoutCharts, layoutChartFilename,
│   └── …                        #   grid geometry table, SVG emitter (R1/R2)
├── shared/
│   ├── helpDocsRender.ts        # help-header injection (US1); welcome layout section
│   ├── deriveDocMemberStates.ts # NEW (R5)
│   └── renderHistoryMd.ts       # NEW (R6)
├── decision-audit/
│   └── historyProposal.ts       # NEW: buildHistoryProposal (R6)
├── loader/fetchKeyboardSourceToVfs.ts  # welcome resolution order + images +
│                                #   README/HISTORY fetch (R3, data-model §6)
├── base-browser/
│   └── classifyBaseDocumentation.ts    # NEW (R4)
├── package-descriptor/
│   ├── build.ts                 # welcome\welcome.htm Files/Options (R3)
│   └── patch.ts                 # welcome-path migration (R3)
└── scaffolder/index.ts          # folder-path stub

packages/keyboard-lint/src/
├── checks/docs/                 # NEW: 12 modules / 13 codes (contracts/lint-checks.md)
├── lintContext.ts               # docLintInput gate + registration
└── index.ts                     # barrel exports

packages/studio/src/
├── lib/serializeWorkingCopy.ts  # step 5c: welcome folder, charts, HISTORY (R3/R2/R6)
├── lib/collectDocLintInput.ts   # NEW (R7)
├── hooks/useDocumentationFindings.ts  # NEW memoized hook (R7/R8, D3-safe)
├── components/DocumentationChecklist.tsx  # NEW (R10)
├── components/OutputScreen.tsx  # checklist mount
├── stores/workingCopyStore.ts   # new slices + setters (contracts/studio-surfaces.md)
├── lib/persistWorkingCopy.ts    # snapshot/rehydrate for new slices
├── survey/questions/f/pf_history_entry.ts  # NEW question (R6)
├── survey/questions/f/pf_welcome_paragraph.ts  # adaptive required/prefill (FR-009)
├── editors/panels/BaseResolution.tsx + components/MetadataCard.tsx  # profile badge
└── lint/LintSummary.tsx         # upstream-excluded headline counts (R8)

content/flows/phase_f_helpdocs.modular.yaml   # pf_history_entry screen (content team)

utilities/welcome-sweep/         # NEW: offline SC-002 corpus sweep (R13)
```

**Structure Decision**: existing monorepo layout; every change lands in an existing
package (plus one standalone utility). No new workspace package — keyboard-lint stays
contracts-only, the chart renderer joins the engine (docs generation is engine-owned,
spec §12), and studio changes ride the established store/hook/manifest patterns.

## Phasing (implementation order)

Matches the spec's story priorities; each phase lands independently with green gates
and one commit per phase (repo cadence):

1. **P1 / US1** — help-header injection in `renderHelpPhp` fresh path + tests
   (smallest, ships alone; touches only `helpDocsRender.ts` + pinned stub tests).
2. **P2 / US2** — welcome folder convention end-to-end (loader → store → projection →
   descriptor build/patch → kmp paths → fixtures/tests; Track 1 image carry per R9).
3. **P3 / US3** — `deriveDocMemberStates` + store slices + `DocumentationChecklist`
   on Output (needs P2's member paths; placeholder markers work before P5/P6 fill).
4. **P4 / US4** — `classifyBaseDocumentation` + picker/metadata badge + adaptive
   `pf_welcome_paragraph`.
5. **P5 / US5** — `buildHistoryProposal` + `pf_history_entry` + `renderHistoryMd` +
   projection write.
6. **P6 / US6** — `layout-chart/` renderer + projection integration + `ChartPreference`
   + welcome layout section + descriptor listing + determinism/legibility tests.
7. **P7 / US7** — 12 lint check modules (13 codes) + bijection test + `collectDocLintInput` +
   `useDocumentationFindings` + upstream classifier + `LintSummary` count fix +
   SC-007 fixtures.

Cross-cutting from P2 on: SC-004 byte-identity round-trip test grows with each phase;
SC-002 sweep utility lands with P2.

## Complexity Tracking

No constitution violations — table intentionally empty.
