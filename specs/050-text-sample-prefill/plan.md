# Implementation Plan: Text-sample prefill (paste or upload)

**Branch**: `050-text-sample-prefill` | **Date**: 2026-08-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/050-text-sample-prefill/spec.md` (scope corrected 2026-08-19 — see spec.md's Context section)

## Summary

Replace `packages/studio/src/survey/PhaseB.tsx`'s `TextSamplePlaceholder` "Coming soon" stub — a slot spec 044's own FR-016b already reserved for this feature — with a real paste-or-upload affordance. Extraction reuses the existing `harvestFromText` engine function verbatim (no second extraction path); union/attribution reuses `usePhaseBDraftStore`'s existing `addProposed(char, source, opts)` method, whose `DraftProvenance` type already has a `"text"` member anticipating this feature. No store changes, no engine changes — this is a UI component plus a thin extraction-to-store adapter.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React (studio SPA conventions).

**Primary Dependencies**: `@keyboard-studio/engine`'s `harvestFromText` (existing, via `getCharacterDiscoveryService()`); `usePhaseBDraftStore`'s existing `addProposed` action. No new dependencies.

**Storage**: Session-only, in-memory (FR-010 / Article V) — the pasted/uploaded text itself is never persisted into the working copy or written to disk; only the extracted characters (via `addProposed`) join the existing draft state.

**Testing**: vitest + React Testing Library, colocated with `PhaseB.tsx`'s existing test suite (`PhaseB.test.tsx` or a new sibling), mirroring `ExemplarApplyAffordance`'s existing test coverage pattern.

**Target Platform**: Browser SPA (studio).

**Project Type**: Single-package UI feature (`packages/studio`).

**Performance Goals**: Edge case "very large paste/upload... must not block first paint" (spec's Edge Cases) — `harvestFromText` is already async; the new component must not call it synchronously on render, and should debounce/defer extraction until the author submits (mirroring `pb_text_sample`'s existing pattern of extracting on step-completion, not per-keystroke).

**Constraints**: No second extraction implementation (FR-004); no store schema change (research confirms `DraftProvenance` already has `"text"`); plain-text-only upload (`.txt`-style; `.docx`/`.pdf`/`.odt` explicitly out of scope per spec's Assumptions).

**Scale/Scope**: One component rewrite (`TextSamplePlaceholder` → a real affordance, structurally mirroring `ExemplarApplyAffordance`), one small adapter (harvested `InventoryChar[]` → `addProposed` calls), a file-upload input, and their tests. No contracts/engine/store changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | **PASS (non-interference)** | No `Pattern`/`Criterion` field touched. |
| II. KeyboardIR is the engine spine | **PASS** | No IR mutation — Phase B's draft state is pre-instantiation survey state, not IR. |
| III. Single working copy | **PASS** | Not touched. |
| IV. Validator layering / one 300ms debounce | **PASS (non-interference)** | Not touched — this is survey-time state, not the validator's debounce cycle. |
| V. VirtualFS only during authoring | **PASS** | The uploaded file is read client-side via `File.text()` and never written to host disk or the VFS; only its extracted characters (already-in-memory strings) join the draft. |
| VI. Team boundaries | **PASS** | Per spec's own Team Boundaries section: Engine/front-end owns the text area, upload, and extraction wiring; Content owns the entry-point wording. |
| VII. Out of scope for v1 | **PASS** | Not touched. |
| VIII. House conventions | **PASS** | No emoji; commit will follow `<prefix>(<area>)`. |

**No violations. Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/050-text-sample-prefill/
├── plan.md              # This file
├── research.md          # Phase 0 output
└── data-model.md        # Phase 1 output
```

### Source Code (repository root)

```text
packages/studio/src/survey/
├── PhaseB.tsx                     # EDIT: replace TextSamplePlaceholder's "Coming soon" body with a
│                                   #   real affordance (textarea + file input), mirroring
│                                   #   ExemplarApplyAffordance's structure (section/aria-label/
│                                   #   store-selector pattern)
├── PhaseB.test.tsx (or a new       # EDIT/NEW: component tests for paste, upload, empty/whitespace
│   sibling test file)              #   input, encoding-failure, and union-with-exemplar cases
│                                   #   (US1/US2/US3 acceptance scenarios)
└── questions/b/pb_text_sample*.ts # UNCHANGED — the older manual-path chain stays as-is (§3.8,
                                    #   out of scope per research R1)

packages/studio/src/stores/
└── phaseBDraftStore.ts             # UNCHANGED — addProposed + DraftProvenance("text") already exist

packages/engine/src/character-discovery/
└── CharacterDiscoveryServiceImpl.ts # UNCHANGED — harvestFromText already implements FR-004
```

**Structure Decision**: Single-file UI change plus its test, confined to `packages/studio/src/survey/PhaseB.tsx`. No cross-package edits; `@keyboard-studio/engine`'s `harvestFromText` and the studio's `phaseBDraftStore` are both consumed unmodified.
