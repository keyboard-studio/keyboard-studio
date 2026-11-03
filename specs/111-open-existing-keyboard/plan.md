# Implementation Plan: Open an existing keyboard

**Branch**: `111-open-existing-keyboard` | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/111-open-existing-keyboard/spec.md`

## Summary

Turn the Adapt track into **Open**: update an existing keyboard in place. The plan reuses the existing working copy, keeping the internal mode `"adapt-existing"`.

Three mechanisms carry the feature:
1. **Text-sourced starting point.** The keyboard's files, including the `.kps`, enter the working copy as text. An applied code edit replaces the starting point, and decisions replay on top (research R1).
2. **Splice projection.** Tool changes reach the `.kmn` as node-level splices into the starting text: carve's existing delete-splice, extended to replace and insert (R2, [contracts/kmn-projection.md](contracts/kmn-projection.md)).
3. **Baseline ratchet.** The criteria run at load; findings are keyed by criterion and file and marked pre-existing or new; new failures need a fix or a review note (R5).

Around them, mostly reuse:
- The Open entry records the existing `authoring-track` decision, and screen gates hide the identity-first steps (R6).
- The `.kps` is patched in place (R3).
- Either repository is fetched through `/review-proxy` (R4).
- Expected characters are the exemplar union of the keyboard's languages, through check 18.6 (R10a).
- Help sections are replaced only between the existing generated-block markers (R8).
- The PR body gets source and review blocks (R12, [contracts/pr-body.md](contracts/pr-body.md)).

## Technical Context

**Language/Version**: TypeScript 6 (strict), Node ≥ 22.19.0

**Primary Dependencies**: React + Vite (studio), the engine codec (`parse` / `emit` / `joinContinuations`), `@keymanapp/keyboard-lint`, Monaco (code views), Lingui (i18n)

**Storage**: draft envelope (IndexedDB / cloud drafts) and in-memory VirtualFS only. No new store.

**Testing**: vitest per package (never bare `vitest` at root), Playwright E2E (studio), corpus fixtures from `../keyboards` on the keyboard-studio/keyboards fork

**Target Platform**: browser SPA plus Vercel rewrites (no new function)

**Project Type**: pnpm monorepo web application (contracts → engine → keyboard-lint → studio)

**Performance Goals**:
- The baseline criteria run completes in the existing worker without blocking the UI.
- The exemplar union for 278 languages is an index lookup, so negligible.
- The splice projection is linear in file length.

**Constraints**:
- One D3 validation cycle (no new diagnostic timer).
- No host-disk writes.
- Copy output unchanged (SC-004).
- `/api` bundle-safety untouched: no `/api` change.

**Scale/Scope**: about 920 corpus keyboards. The largest language list is 278. Seven user stories, delivered as seven phases.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Verdict | Notes |
|---|---|---|
| I Pattern schema | PASS | Untouched. |
| II IR is the spine | **AMEND** | Mutations stay on the IR; projecting to text becomes a splice on Open, and code edits become new starting points. The text is in [contracts/constitution-amendment.md](contracts/constitution-amendment.md). It lands with Phase 1 and needs owner approval. |
| III State model | **AMEND** | On Open, the starting point is file text plus its parse, and a code edit is a starting-point switch (already sanctioned by Article X). Review notes live in the criteria slice, never as decisions. Same amendment. The 053/088 mapping is unchanged because no new decision kind is added. Accepted and declined suggestions are recorded in the 053 record only. |
| IV Validator layering | PASS | The baseline reuses the existing assembly and worker; rechecks ride the D3 cycle. No new timer. |
| V VirtualFS only | PASS | The `.kps` and docs enter the VFS; nothing touches host disk. |
| VI Team boundaries | PASS | **Engine** owns the projection, import, gate, output, entry and panes. **Content** owns criteria rows (incl. upgrade criteria), suggestion and review-note wording, help questions and PR-block wording. |
| VII Out of scope | PASS | No general byte-identical round trip. Only untouched content is preserved (FR-010). Multi-source merge is not involved: the repository choice picks *one* source. |
| VIII Conventions | PASS | Commit titles per house style; no issue numbers in code. |
| IX Registry-only surfaces | PASS | Screen gates are declarations in `declaredScreenGates`; the Open entry records an existing decision. Any new question (language list, review note) is declared through the registry, which is a functional requirement of the phase that adds it. |
| X Defaults are proposals | PASS | Carried values are the keyboard's own content, not proposals. Every studio change on Open is a suggested fix needing acceptance. Switching repositories is a starting-point switch that keeps decisions. |
| XI Done means integrated | PASS (planned) | Each phase ends with its surface reachable from the Open entry. Upgrade pairs depend on criterion 7.28 merging (owner: whoever lands the `km/casedkeys-criterion` branch; trigger: its merge). |

**Gate result**: proceed, **conditional on owner approval of the Article II/III amendment** before Phase 1 merges. Re-checked after Phase 1 design: no new violations. The splice contract and data model stay inside the amended articles.

## Personal Data Check (Constitution Article XII, spec 100)

*Personal data: none — no new store, recipient, category, or telemetry.* (Review notes are author text sent with the PR through the existing GitHub delivery path, like the existing PR body.)

## Project Structure

### Documentation (this feature)

```text
specs/111-open-existing-keyboard/
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── kmn-projection.md
│   ├── constitution-amendment.md
│   └── pr-body.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/engine/src/
├── pattern-apply/spliceKmn.ts          # NEW: diffIrToKmnEdits / spliceKmn / projectKmnText (carveViaSplice folds in)
├── codec/index.ts                      # export emitRule / emitStore
├── loader/fetchKeyboardSourceToVfs.ts  # Open: keep .kps in the VFS, rewrite ../build/ entries
├── package-descriptor/patch.ts         # Open branch: keep Description/Languages unless edited
├── stub-mutator/index.ts               # insert &KEYBOARDVERSION when absent (Open)
└── shared/renderHistoryMd.ts           # "Updated" entry on Open

packages/studio/src/
├── survey/questions/registry.ts        # screen gates for identity_lite/layout/choose_base/track on Open
├── components/OpenKeyboardEntry.tsx    # NEW: welcome entry + picker (reuses StartKeyboardPicker / ReviewPicker index)
├── stores/workingCopyStore.ts          # replaceStartingPointFromText(); SourceRef; baseline
├── lib/projectWorkingCopyVfs.ts        # Open: projectKmnText instead of emitKmn; consent on ok:false
├── lib/serializeWorkingCopy.ts         # Open: no README/readme.htm regen; .kps patch path
├── editors/assignLoop/{Kmn,Osk}CodePane.tsx, touchBuilder/TouchCodePane.tsx  # Open: VFS text in, starting-point out
├── criteria/                           # baseline keying, pre-existing/new, review notes, ratchet gate
├── hooks/useInventoryCoverageGate.ts   # Open: ratchet, not hard block
├── lib/openExpectedInventory.ts        # NEW: exemplar union over .kps languages
├── lib/consistencySuggestions.ts       # NEW: per-Apply delta → suggestions
└── components/ManagedPRSubmitPanel.tsx # source + review blocks

packages/contracts/src/                 # SourceRef, ReviewNote, FindingKey types (additive; no Pattern change)
.specify/memory/constitution.md         # Art II/III amendment (lands with Phase 1)
spec.md, specs/110-readme-template/spec.md, docs/workflow-model.md  # amendments listed in spec "Supersedes"
```

**Structure Decision**: no new package. Engine gains one module (`spliceKmn`); studio gains three small modules and an entry component. Everything else is a mode branch in existing files, guarded by `instantiationMode === "adapt-existing"` so Copy paths are untouched.

## Phases (one per conversation, per the constitution's workflow)

| Phase | Story | Delivers | Depends on |
|---|---|---|---|
| 1 | US1 (P1) | Open entry and gates; `.kps` in the VFS and patched; language list; no doc regeneration; "Updated" HISTORY; `&KEYBOARDVERSION` insert; old-draft restore; constitution amendment | owner approval of the amendment |
| 2 | US2 (P1) | Baseline, finding keys, pre-existing/new marks, review notes, ratchet gate (incl. 18.6), PR blocks | 1 |
| 3 | US3 (P2) | `spliceKmn` + projection; code views on file text; starting-point replacement; consent before re-emit | 1 |
| 4 | US4 (P2) | Repository choice through `/review-proxy`, SourceRef, curated-copy warning | 1 |
| 5 | US5 (P2) + FR-018a | Consistency suggestions; exemplar-union expected inventory | 2, 3 |
| 6 | US6 (P3) | Upgrade pairs (cased keys first) | 2, 3, criterion 7.28 merged |
| 7 | US7 (P3) | Docs gaps; marker-bounded section refresh; preview | 2 |

Icon and HTML editors (TIKE ports) mount on Open when they land. They are not a phase of this spec.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Article II/III amendment (text-sourced starting point) | Updating a hand-written keyboard must keep untouched bytes; about 415 corpus keyboards change content on re-emit. | Preserving formatting in `emit` is a broad codec rewrite for the same goal. Storing code edits as decisions is ruled out by the owner (text isn't a decision). |
