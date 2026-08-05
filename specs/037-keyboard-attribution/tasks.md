# Tasks: keyboard attribution and license provenance

**Feature**: `037-keyboard-attribution` | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

**Scope of this file**: **Slice A (US1) only** — attribution capture and emission. Slice B (US2,
the base-`LICENSE.md` fetch, parse, and provenance chain) is deliberately **not broken down
here** because it is gated on rulings for **D4** (`LICENSE.md` vs `.kmn` precedence) and **D5**
(unparseable-license failure mode). Slice A does not depend on either.

US3 (persistence) has **no tasks of its own**: `Attribution` rides the existing localStorage
draft ([034](../034-mvp-authoring-walk/spec.md) US3) by virtue of living on the working copy.

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelizable: different files, no dependency on an incomplete task
- **[US1]** — maps to User Story 1 in [spec.md](spec.md)
- Setup / Foundational / Polish tasks carry no story label

## Path Conventions

- Contracts: `packages/contracts/src/`
- Engine: `packages/engine/src/`
- Studio SPA: `packages/studio/src/`
- Content flows: `content/flows/`

---

## Phase 1: Setup (Shared Infrastructure)

No project initialization needed — this is an existing pnpm workspace with the toolchain in
place. One prerequisite only.

- [x] T001 Build ALL workspace packages so imports resolve for test runs: `pnpm --filter @keyboard-studio/engine build`, `--filter @keyboard-studio/glottolog build`, `--filter '*keyboard-lint*' build`. **Do this first**: without `glottolog` and `keyboard-lint` built, 21 studio test files fail at import and look like repo defects. With all three built the studio suite is 270/270 files, 3699 tests green

---

## Phase 2: Foundational (Blocking Prerequisites)

**All of the feature's risk lives here, and it is all pure.** Nothing in Phase 3 may begin
until the copyright functions are green, so the messy-input handling is settled in isolation
rather than discovered through the scaffolder.

- [x] T002 [P] Harvest the parser fixture table from the corpus into `packages/contracts/src/__fixtures__/copyrightLines.ts` — real lines only, sourced from [corpus-scan.py](corpus-scan.py) output per FR-014 (all three markers, single/range/comma/absent years, the compound double-space holder, BOM, and the three P4 rejections)
- [x] T003 Add `CopyrightHolder`, `CopyrightBlock`, `ParseResult`, `ParseFailure`, and the frozen `MIT_BODY` constant to `packages/contracts/src/copyright.ts` per [data-model.md](data-model.md)
- [x] T004 Implement `parseCopyright()` in `packages/contracts/src/copyright.ts` per contract P1–P5 (failure-as-a-value; all marker and year forms; BOM stripped; internal holder spacing preserved verbatim)
- [x] T005 Implement `renderLicense()` in `packages/contracts/src/copyright.ts` per contract P6 and the D3 ordering rule (inherited first; year-less first, stable)
- [x] T006 Implement dedupe and year accumulation per contract P8 in `packages/contracts/src/copyright.ts` — exact-name match only, extend an existing holder's range rather than duplicating the line
- [x] T007 Write `packages/contracts/src/copyright.test.ts` — drive the T002 fixture table, assert the three rejections, and assert round-trip stability `parse(render(x)) === x` (P7) over two-, three-, and four-holder blocks
- [x] T008 [P] Add `Attribution` to `packages/contracts/src/attribution.ts` per [data-model.md](data-model.md) (no `year` field — derived at emit per D2)
- [x] T009 Export the new modules from `packages/contracts/src/index.ts`

**Checkpoint**: `parseCopyright` / `renderLicense` are green against real corpus input, with no
consumer wired. T004–T007 touch one file, so they are sequential despite being separable ideas.

**DONE 2026-08-04.** 92 tests, and the contract needed one amendment. Implementing against the
harvested corpus disproved the assumption that `{name, years, marker}` can reconstruct any line:
32+ shipped keyboards carry two markers and two year groups on one line
(`release/fv/fv_dakelh`), one mixes a comma list with a range (`release/e/ekwtamil99uni`), and one
repeats the word *Copyright* (`release/e/enga`). `CopyrightHolder` therefore gained a `raw` field
and inherited lines re-emit verbatim — see contract P6b. Verified by mutation testing: nine
separate mutations (BOM, fuzzy dedupe, template acceptance, unstable sort, whitespace collapse,
ignoring `raw`, stale `raw`, range-only years, single-`Copyright` strip) each turn the suite red.
Two of those mutations initially SURVIVED, which exposed two real gaps in the tests; both are now
covered.

---

## Phase 3: User Story 1 — A new keyboard is attributed to its actual author (Priority: P1) 🎯 MVP

**Goal**: The emitted package names the actual author and copyright holder, rather than naming
the keyboard's own display name as the rights holder.

**Independent test**: Complete a walk as a signed-in user; confirm `LICENSE.md`,
`store(&COPYRIGHT)`, and `.kps <Copyright>`/`<Author>` all carry the confirmed holder and a
plausible year, and that none of them contains the keyboard's display name as the holder.

### Investigation (do first — it resizes the rest)

- [x] T010 [US1] Verify D8 in `packages/engine/src/scaffolder/` — **DONE, inference disproven**. `resetIdentity` ([scaffold-ir.ts:174](../../packages/engine/src/scaffolder/scaffold-ir.ts)) OVERWRITES the parsed copyright with `Copyright © <year> <displayName>`, so a base-derived keyboard STRIPS the original author's notice from the `.kmn` too. There are TWO fabrication sites, not one, and the existing `identity.copyright` seam is the fix. Finding recorded in [research.md](research.md)

### Identity source

- [x] T011 [P] [US1] Widen the `/user` response type in `packages/engine/src/output/github.ts` (`verifyToken`) to retain `name` and `email` per D7/FR-002 — no additional request
- [ ] T012 [P] [US1] Extend `packages/studio/src/hooks/useGitHubAuth.ts` to surface the retained `name`/`email` alongside `login`
- [x] T013 [US1] Test the null cases in `packages/engine/src/output/github.test.ts` — profile `name` absent and `email` private must both resolve without error and must never fall back to the bare `login` handle as a copyright holder

### Capture

- [ ] T014 [US1] Hold `Attribution` on `packages/studio/src/stores/workingCopyStore.ts` with a setter, so it persists via the existing 034 draft with no new storage
- [ ] T015 [US1] Add `author_display_name`, `author_contact_email`, `pa_copyright_holder` to the live flow membership in `content/flows/identity_lite.modular.yaml` — **membership only; do not edit the question prompts** (Article VI: prompt text is Content-owned — see the Content hand-off below)
- [ ] T016 [US1] Seed the three revived questions from the GitHub profile in `packages/studio/src/editors/adapters/` so attribution is propose-then-confirm, never a blank form (FR-001)
- [ ] T017 [US1] Publish the captured contact into `SurveyContext` as `author_contact` in `packages/studio/src/editors/adapters/panelAdapters.tsx` (`contextFromIdentity`) — satisfies FR-016 and activates the Phase F pre-fill seam already in place
- [ ] T018 [US1] Update the identity_lite golden assertions in `packages/studio/tests/survey/flow-parity.test.ts` (currently asserts exactly 6 questions) and refresh the snapshot
- [ ] T019 [US1] Update the registry count floor in `packages/studio/tests/survey/inputs-writes-coverage.test.ts` if the live membership change moves it

### Emission

- [ ] T020 [US1] Replace the fabricated `Copyright © ${yyyy} ${displayName}` line in `packages/engine/src/scaffolder/index.ts` with `renderLicense()`, taking the emit year as a parameter per D2/P9 (FR-004)
- [ ] T021 [US1] Pass the real copyright through `identity.copyright` so `resetIdentity` stops fabricating `Copyright © <year> <displayName>` (`packages/engine/src/scaffolder/index.ts` → `scaffold-ir.ts`) — per the verified T010 finding this is the SECOND fabrication site and must share T020's single source of truth. Codec unchanged; no raw `.kmn` manipulation (Article II)
- [ ] T022 [US1] Add `<Copyright>` and `<Author>` to the `<Info>` block in `buildKpsContent()` in `packages/engine/src/scaffolder/index.ts`, with `<Author URL="mailto:…">` when an email is present
- [ ] T023 [US1] Require an author name before emission for guests with no GitHub session per D6/FR-015 — no placeholder holder may be emitted

### Verification

- [ ] T024 [US1] Assert SC-003 in `packages/engine/src/scaffolder/scaffolder.test.ts` — `LICENSE.md`, `store(&COPYRIGHT)`, and `.kps <Copyright>` all agree on the holder
- [ ] T025 [US1] Assert SC-001 in `packages/engine/src/scaffolder/scaffolder.test.ts` — the keyboard's display name is never emitted as the copyright holder
- [ ] T026 [US1] Assert SC-006 in `packages/engine/src/scaffolder/scaffolder.test.ts` — the MIT body is byte-identical across two differently-named keyboards
- [ ] T027 [US1] End-to-end: complete a walk and assert the emitted ZIP's `LICENSE.md` carries the confirmed holder, in `packages/studio/e2e/`

**Checkpoint**: US1 is independently shippable. Slice B has not started, and nothing here
depends on D4 or D5.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [ ] T028 [P] Run `npx tsc --noEmit` in `packages/contracts/`, `packages/engine/`, and `packages/studio/` — expect only the pre-existing `@keymanapp/keyboard-lint` and `@keyboard-studio/glottolog` resolution errors
- [ ] T029 Run the full suites and compare failed-*file* counts against the pre-change baseline (21 in studio, 0 in engine) rather than expecting zero, since several files fail at import on unbuilt workspace packages
- [ ] T030 Update [research.md](research.md) with the T010 finding and mark D8 verified

---

## Dependencies

```
Phase 1 (T001)
   └─> Phase 2 (T002 … T009)          <-- all risk, all pure, no consumers
          └─> Phase 3 (T010 … T027)
                 └─> Phase 4 (T028 … T030)
```

Within Phase 2: T002 and T008 are parallel; T003 → T004 → T005 → T006 → T007 are sequential
because they share `copyright.ts`.

Within Phase 3: T010 first (it resizes the remainder). T011/T012 are parallel with the capture
group. T020–T022 all edit `scaffolder/index.ts`, so they are sequential. T018/T019 must follow
T015, which is what moves the counts.

**Slice B is blocked on**: a ruling for D4 and D5. Nothing in Phase 1–4 waits on it.

## Parallel execution examples

```
Phase 2 kickoff:   T002 (fixtures)  ||  T008 (Attribution type)
Phase 3 kickoff:   T011 (verifyToken)  ||  T014 (store field)
```

## Implementation strategy

**MVP is Phase 1 + Phase 2 + Phase 3.** That delivers US1 whole: today's output names the
keyboard as its own copyright holder, and this fixes it end to end.

Sequence rationale — Phase 2 before Phase 3 is not stylistic. The parser is the one part that
meets untrusted real-world input, so it is settled in a pure module with a corpus-harvested
fixture table before any consumer can mask a defect behind end-to-end plumbing.

## Content hand-off (Article VI)

T015 lands **membership only**. The three revived questions were written for a fuller Phase A
battery, not for a prefilled confirm-this step, so their **prompt and help text almost certainly
need rewording** — and that text is Content-owned. Raise it as a separate Content-owned change
rather than having Engine rewrite survey copy inside this feature.
