---

description: "Task list for Text-sample prefill (paste or upload)"
---

# Tasks: Text-sample prefill (paste or upload)

**Input**: Design documents from `specs/050-text-sample-prefill/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md) (scope-corrected 2026-08-19), [research.md](research.md), [data-model.md](data-model.md), [contracts/text-sample-affordance.md](contracts/text-sample-affordance.md)

**Tests**: INCLUDED — component tests for paste/upload/empty/encoding-failure/union cases are the US1–US3 acceptance-scenario proof.

**Organization**: Tasks are grouped by user story (US1 paste, US2 upload, US3 union). Scope is narrower than the spec's original text per the Ground-truth correction: no store/engine changes, no `pb_text_sample*` changes.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [x] T001 Create feature branch `050-text-sample-prefill` off `main` (shipped as `km/050-text-sample-prefill` per the crew's actual branch convention, PR #1683 head ref — same substance, different literal name)
- [ ] T002 Re-confirm `TextSamplePlaceholder`'s current location and comment in `packages/studio/src/survey/PhaseB.tsx` (line ~964 per research) and `usePhaseBDraftStore`'s `addProposed`/`DraftProvenance` (`"text"` member) are both still present exactly as research described before editing (a point-in-time pre-edit sanity check with no artifact of its own — PR #1683's diff is consistent with the preconditions having held, but whether the check was literally performed isn't re-verifiable retroactively. Left unchecked.)

---

## Phase 2: User Story 1 - Paste a paragraph and get an alphabet (Priority: P1) 🎯 MVP

**Goal**: Pasting text into the build-list page's affordance proposes every distinct character, attributed to the text.

**Independent Test**: Paste a known paragraph, continue, assert the proposed alphabet equals its distinct-character set (minus whitespace).

### Tests for User Story 1 (write first)

- [x] T003 [P] [US1] Write component tests (colocated with `PhaseB.tsx`'s existing suite) for: a non-empty paste proposes the right characters attributed to `"text"` (AS1); a removed proposed character stays removed on re-entry (AS2, exercises the existing sticky-`rejected` behavior via `addProposed`); an empty/whitespace-only paste leaves the draft untouched with no error (AS3) — these fail until T004+ land (shipped in `packages/studio/src/survey/PhaseBTextSample.test.tsx`, a new sibling file rather than literally colocated in `PhaseB.test.tsx` — same suite scope, all three acceptance scenarios present)

### Implementation for User Story 1

- [x] T004 [US1] Replace `TextSamplePlaceholder`'s "Coming soon" body in `PhaseB.tsx` with a real component (structurally mirroring `ExemplarApplyAffordance`: a `<section>` with `aria-label`, local textarea state per data-model.md's `TextSampleAffordanceLocalState`)
- [x] T005 [US1] On submit: call `harvestFromText(sample, base)` (via `getCharacterDiscoveryService()`), then call `addProposed(char, "text")` once per resulting `InventoryChar` (FR-004/FR-005/FR-006 — no second extraction path, reuses the existing provenance-aware store action)
- [x] T006 [US1] Empty/whitespace-only input: show an inline message, skip the `addProposed` calls entirely, leave the step usable (FR-008, AS3)
- [x] T007 [US1] Defer extraction to submit time, not per-keystroke (Performance Goals — `harvestFromText` is async, must not block first paint)

**Checkpoint**: T003's tests pass; US1 is independently demoable.

---

## Phase 3: User Story 2 - Upload a file instead of pasting (Priority: P2)

**Goal**: Uploading a `.txt` file produces the same result as pasting its contents.

**Independent Test**: Upload a fixture `.txt`; assert the same proposal as pasting the same bytes.

**Depends on**: US1 (the extraction-to-`addProposed` adapter from T005 is reused verbatim).

### Implementation for User Story 2

- [x] T008 [P] [US2] Add a file input (`accept=".txt"`) to the component from T004 (shipped as `accept=".txt,text/plain"` — a superset, same intent)
- [x] T009 [US2] On file selection: call `File.text()` to decode the file, then feed the result into the SAME extraction call as T005 (no second extraction path, FR-004)
- [x] T010 [US2] Detect an undecodable/non-UTF-8 file (heuristic: check for U+FFFD replacement characters post-decode per research R4) and surface a plain message without blocking the step (FR-003 AS2)
- [x] T011 [US2] Test: uploading a fixture `.txt` produces an identical proposal to pasting its exact contents (SC-004); a corrupted/binary file upload surfaces the plain failure message (AS2)

**Checkpoint**: SC-004 — paste and upload converge on identical output.

---

## Phase 4: User Story 3 - Combine a text with exemplar coverage (Priority: P3)

**Goal**: Accepting both an exemplar offer and a text sample in one session unions both, each character attributed to its source(s).

**Independent Test**: For a covered tag, paste a text missing one exemplar character; assert the union is proposed with per-character attribution.

**Depends on**: US1 (needs the text-sample path to exist to union against the exemplar path).

### Implementation for User Story 3

- [x] T012 [US3] Test: accept an exemplar offer (`ExemplarApplyAffordance`) AND submit a text sample with at least one extra character in the same session; assert the draft contains the union of both, each character's `provenance` reflecting whichever source added it first (research R5 — no new merge logic needed, `addProposed`'s existing union-safe contract is what's under test here, not new code)
- [x] T013 [US3] Confirm neither action overwrites the other's contribution — re-submitting the text sample after accepting exemplars does not revert exemplar-attributed characters to `"text"` (AS1 "neither action overwrites the other's contribution")

**Checkpoint**: US3's acceptance scenarios pass with zero new store logic — confirms research R5's "free by construction" finding.

---

## Phase 5: Polish & Cross-Cutting Validation

- [x] T014 [P] Run the full repeatable gate: `pnpm --filter @keyboard-studio/studio typecheck`, `pnpm --filter @keyboard-studio/studio test`, `pnpm lint` (not run standalone at the package scope named here, but PR #1683's CI `build` job — which runs `pnpm -r typecheck`, `pnpm lint`, `pnpm -r test` — passed before merge)
- [x] T015 [P] Confirm FR-009 (character frequency, if surfaced, is advisory only — never filters the proposal) if the component surfaces any frequency-derived hint; otherwise confirm none was accidentally added (no frequency-derived hint was added — confirmed against the diff)
- [x] T016 Confirm FR-010 / Article V: the pasted/uploaded text itself is never written to host disk, never persisted beyond the session, never uploaded off-device — a code-review-level check, not a new test (client-side-only by construction per research R4) (confirmed: `File.text()`/textarea state stay client-side, `addProposed` writes only to the in-memory `phaseBDraftStore`, no network call added)
- [x] T017 Confirm `pb_text_sample`/`pb_text_sample_review`/`pb_discovery_intro` (the older "manual" path's own text-sample mechanism) are byte-for-byte unchanged — this feature does not touch them (§3.8, research R1) (PR #1683's diff touches only `PhaseB.tsx`, `PhaseBTextSample.test.tsx`, `test-setup.ts`, and `en`/`fr` `messages.json` — none of the three files are in the diff)

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: no deps.
- **US1 (Phase 2, P1)**: after Setup. Tests (T003) written before implementation (T004–T007).
- **US2 (Phase 3, P2)**: after US1 (T005's extraction adapter is reused, not rebuilt).
- **US3 (Phase 4, P3)**: after US1 (needs the text-sample path to union against exemplars) — independent of US2 (upload is a separate input method, not a precondition for the union scenario).
- **Polish (Phase 5)**: after the desired stories complete.

## Notes

- `[P]` = different files, no incomplete-task dependency (most of this feature is one file, `PhaseB.tsx`, so parallel opportunities are limited — T003/T008 are the two genuinely independent items, tests vs. a different UI control).
- No store, engine, or contracts change anywhere in this task list — confirmed by research as unnecessary (`addProposed`/`DraftProvenance("text")`/`harvestFromText` all pre-exist). Do not add any despite the temptation to "clean up" `SourcedInventory`'s type during implementation.
- `pb_text_sample`/`pb_text_sample_review` are explicitly untouched (T017 is a verification task, not a cleanup task).
