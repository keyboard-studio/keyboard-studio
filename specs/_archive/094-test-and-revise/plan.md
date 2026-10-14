# Implementation Plan: Test-and-revise loop before publishing

**Branch**: `094-test-and-revise` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/094-test-and-revise/spec.md`

## Summary

This feature turns Output from a dead end into a loop: test build, then tester reports, then
revise the same working copy, then the next test build, then publish. Three pieces of existing
machinery do most of the work:

- **Revising from Output** reuses the `jumpToLocation` `returnTo` seam that the Decision trail
  already uses, with `returnTo: { route: "output" }`. The return is extended to full-layout
  steps through the spec 081 footer cluster, and a "discard and go back" action restores a
  snapshot taken at arrival ([research.md](research.md) R3).
- **Test builds** are `.kmp` downloads projected with a test version and a "Test build N" label.
  The override travels only on the `.kmp` path, so the source zip and managed PR are untouched
  (R2). Versions follow the R1 scheme. One pure engine resolver replaces the three hand-synced
  bump sites.
- **Builds and reports** live in a new `testingStore`, persisted as an optional additive
  `testing` field on `DurableDraft`. Merging is by id, so two devices can't silently collide (R6).
  "Changed since" comes from a SHA-256 fingerprint of the publish projection plus decision-record
  cursors (R7).

**One planning decision changes publish behaviour**, as confirmed with the user and recorded in
the spec:

- An adapted keyboard with a three-part base version (about half the corpus) that has test builds
  publishes with its middle segment bumped: 1.2.3 publishes at 1.3.0, and its tests are 1.2.4,
  1.2.5, and so on.
- The reason is that Keyman's package compiler allows only three version parts, so nothing fits
  between 1.2.3 and 1.2.4.
- Every other case publishes exactly as today.

## Technical Context

- **Language/Version**: TypeScript 5.x, Node ≥ 22.19.0
- **Primary Dependencies**:
  - React + Vite SPA (`packages/studio`), with zustand stores and Lingui v6
  - `@keyboard-studio/engine`: the codec, output, `buildKmp` and kmc-package
- **Storage**:
  - Browser localStorage (`ks.draft.<projectKey>.v1`), extended additively
  - Opaque cloud draft blob (Vercel Blob plus Postgres metadata): unchanged, no `/api` edits
- **Testing**:
  - vitest per package (engine, studio), including the studio golden walks
  - Playwright E2E (`packages/studio/e2e`, non-blocking)
- **Target Platform**: modern evergreen browsers, the SPA as served by Vercel
- **Project Type**: web SPA plus engine library in a pnpm monorepo
- **Performance Goals**:
  - A test build takes the same time as today's `.kmp` download, plus one SHA-256 over the
    projection, which is well under 100 ms for corpus-sized keyboards.
  - Nothing new runs in the 300 ms validation cycle.
- **Constraints**:
  - Single working copy (Article III), VFS-only (Article V), and no second debounce (Article IV
    / D3).
  - Versions must pass kmc-package's `^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,2}$`.
  - The draft stays under 4 MiB for cloud sync, which is negligible for builds and reports.
- **Scale/Scope**: about 6 new modules and about 10 edited ones in `studio`, plus 1 new engine
  module. There are no unresolved NEEDS CLARIFICATION items.

## Constitution Check

*Pre-research gate: PASS. Re-checked after Phase 1 design: PASS.*

| Article | Verdict | Evidence |
|---|---|---|
| I. Pattern schema locked | Pass | No `Pattern`, `Criterion` or contracts change. The new types are studio-local ([data-model.md](data-model.md)). |
| II. KeyboardIR spine | Pass | The test version reaches the `.kmn` through the existing identity overlay and `applyIdentityStubMutation` path at output. `.kps` and `welcome.htm` are package files, not `.kmn`. No `parse()` wrapping. |
| III. Single working copy | Pass | Test builds project clones at output, as today's download does. The revision "discard" restores the same copy from an in-memory snapshot of itself, and no second copy is ever live (R3). The snapshot is the same in-memory form the durable-draft autosave already takes every 500 ms, so it adds no new kind of intermediate serialization. |
| IV. Validator layering / D3 | Pass | No new validation path or timer. The fingerprint is computed on user action. The testing store rides the existing 500 ms autosave, which is a persistence timer outside D3's scope. |
| V. VFS only | Pass | The only host-disk writes are the author's own downloads (FR-020). |
| VI. Team boundaries | Pass | **Engine** owns the version resolver, projection, store, persistence and navigation. **Content** owns the new author-facing wording (the `output.testing.*`, `output.sections.*`, `output.publishHandover.*` and `step.revision.*` copy). |
| VII. Out of scope | Pass | No hosting (sharing is download-based), no tester-side or mobile-app integration, and no multi-language welcome variants. The welcome notice is one localized block in the author's UI locale. |
| VIII. Conventions | Pass | No issue numbers in code. Commit titles use `feat(studio)`, `feat(output)` and `feat(engine)`. |
| IX. Decision registry | Pass | No new survey questions or steps. The section list derives from `buildProgressDots`, which comes from registry order, so there is no hand-kept order. |

**Escalation note.** The three-part publish-version rule changes `.kmn`, `.kps` and HISTORY
version output only for adapted keyboards with test builds. It is not a schema change, and the
user decided it during planning.

## Project Structure

### Documentation (this feature)

```text
specs/094-test-and-revise/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R8
├── data-model.md
├── quickstart.md
├── contracts/
│   └── interfaces.md    # C1–C7
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
packages/engine/src/output/
├── output-version.ts            # NEW  C1: resolvePublishVersion / resolveTestBuildVersion
├── output-version.test.ts       # NEW
└── adapt-staging.ts             # bumpKeyboardVersion kept; resolver delegates to it

packages/studio/src/
├── lib/
│   ├── serializeWorkingCopy.ts  # C2: testBuild option; publish version via resolver
│   ├── buildOutputBundle.ts     # C3: buildTestBuildKmp; optional bundle opts
│   ├── outputBlockers.ts        # NEW C6
│   ├── workingCopyFingerprint.ts# NEW R7 (computeSha256Hex over projection)
│   ├── draftTypes.ts            # testing?: TestingRecord
│   ├── draftPersistence.ts      # save/load/resume/applyRemoteDraft carry + merge testing;
│   │                            #   captureRevisionSnapshot / restoreRevisionSnapshot (R3)
│   └── jumpToLocation.ts        # returnTo route "output" (type already Location)
├── stores/
│   └── testingStore.ts          # NEW C4
├── components/
│   ├── OutputScreen.tsx         # section list, testing panel, blockers, hand-over
│   ├── OutputSectionList.tsx    # NEW FR-001
│   ├── TestBuildPanel.tsx       # NEW FR-006..FR-009, FR-012..FR-014
│   ├── PublishHandover.tsx      # NEW FR-016
│   ├── ManagedPRSubmitPanel.tsx # outputBlockedReason from outputBlockers
│   ├── StepHost.tsx             # output-origin return, full-layout footer actions, discard
│   └── SurveyResetButton.tsx    # catalog copy; says builds/reports are deleted
├── StudioShell.tsx              # start-over resets testingStore
├── decisions/progressDots.ts    # deadkeys/rules stage labels
├── hooks/useDocumentationFindings.ts      # version via resolver
├── editors/adapters/flowStepOptions.tsx   # deriveHistoryVersion via resolver
└── locales/{en,fr}/messages.json          # C7

packages/studio/tests/steps/stepHost.goldenWalk.test.tsx  # revise-from-Output loop
packages/studio/e2e/copy-edit.spec.ts                      # build → revise → rebuild
```

**Structure Decision.** Everything sits inside the existing `packages/engine` and
`packages/studio` workspaces. No new package, no `/api` change, and no `utilities/*` change.

## Phasing (for /speckit-tasks)

This is multi-phase: one conversation per user-story phase (constitution, "One conversation per
phase").

- **Setup + Foundational:** C1 resolver and call-site migration; C6 `outputBlockers` and the PR
  reason fix; C4 store and draft persistence (R6).
- **P1, US1:** section list, output-origin return for pane and full-layout steps, discard,
  blocker "Open" buttons.
- **P1, US2:** C2/C3 test-build projection and download, fingerprint, build list, version rules
  including the three-part publish rule.
- **P2, US3:** reports.
- **P2, US4:** publish hand-over.
- **Polish:** E2E, the fr catalog, and the accessibility tracker rows.

## Complexity Tracking

No constitution violations to justify.
