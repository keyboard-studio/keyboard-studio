# Tasks: keyboard attribution and license provenance

**Feature**: `059-keyboard-attribution` | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

**Scope of this file**: Slice A (US1) in full, plus the **Slice B core** (US2) — see Phase 5.

Slice B was originally held back pending rulings on D4 and D5. The user has since ruled directly
on the substance: *"a derived keyboard needs to have the base author's notice with the new author
added to it not replacing it."* The accumulation is therefore built, with D4 (LICENSE.md
authoritative, never merged with the `.kmn`) and D5 (unparseable notice blocks rather than being
dropped) implemented **as proposed in [research.md](research.md)** — both remain overturnable,
and neither changes the accumulation behaviour itself.

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
- [x] T012 [P] [US1] Extend `packages/studio/src/hooks/useGitHubAuth.ts` to surface the retained `name`/`email` alongside `login`
- [x] T013 [US1] Test the null cases in `packages/engine/src/output/github.test.ts` — profile `name` absent and `email` private must both resolve without error and must never fall back to the bare `login` handle as a copyright holder

### Capture

- [x] T014 [US1] Hold `Attribution` on `packages/studio/src/stores/workingCopyStore.ts` with a setter, so it persists via the existing 034 draft with no new storage
- [x] T015 [US1] Add attribution to the live flow membership in `content/flows/identity_lite.modular.yaml` — **could NOT be membership-only; see the note below.** Reviving the demoted ids directly is structurally impossible, so three thin ids (`il_author_name`, `il_author_email`, `il_copyright_holder`) import the Content-authored prompt/help text and override only `id` and `next`. Engine still authored no prompt text (Article VI honoured)
- [x] T016 [US1] Seed the three revived questions from the GitHub profile in `packages/studio/src/editors/adapters/` so attribution is propose-then-confirm, never a blank form (FR-001)
- [x] T017 [US1] Publish the captured contact into `SurveyContext` as `author_contact` in `packages/studio/src/editors/adapters/panelAdapters.tsx` (`contextFromIdentity`) — satisfies FR-016 and activates the Phase F pre-fill seam already in place
- [x] T018 [US1] Update the identity_lite golden assertions in `packages/studio/tests/survey/flow-parity.test.ts` (currently asserts exactly 6 questions) and refresh the snapshot
- [x] T019 [US1] Update the registry count floor in `packages/studio/tests/survey/inputs-writes-coverage.test.ts` if the live membership change moves it

**CAPTURE DONE 2026-08-04.** studio 3736 tests green. One architectural finding changed the
approach:

**T015 could not be "membership only".** Routing lives in each module's `definition.next`
(loadModularFlow ROUTING DECISION B), so a module belongs to exactly ONE flow chain.
`pa_copyright_holder` continues to `provenance_opt_in`, which `identity_lite` does not contain —
adding the demoted ids would have dead-ended at an unresolved goto, and repointing their `next`
would have broken the proposed `phase_a_identity` graph they still belong to.

Resolution: three thin new ids that **import the Content-authored prompt and help text** from the
demoted modules and override only `id` and `next`. One source of survey copy (Article VI honoured
— Engine authored no prompt text), the demoted modules stay byte-identical for the no-delete
guardrail, and `il_target_script`'s DEFAULT branch now continues into attribution while its gated
branch still terminates — so an author who cannot make a keyboard is never asked who owns one.

Only the author NAME is required: the holder defaults to it (D1) and the email may be private (D7).

Verified by mutation — dropping the D1 holder default, returning attribution with no author name,
ceasing to publish `author_contact`, and ceasing to persist attribution each turn the suites red.
**One mutation initially survived and exposed a pre-existing test weakness**: assertions inside
`panelAdapters.test.tsx`'s `onComplete` callback surface as uncaught React errors and do NOT fail
the test. The store is now snapshotted inside the callback and asserted outside it.

### Emission

- [x] T020 [US1] Replace the fabricated `Copyright © ${yyyy} ${displayName}` line in `packages/engine/src/scaffolder/index.ts` with `renderLicense()`, taking the emit year as a parameter per D2/P9 (FR-004)
- [x] T021 [US1] Pass the real copyright through `identity.copyright` so `resetIdentity` stops fabricating `Copyright © <year> <displayName>` (`packages/engine/src/scaffolder/index.ts` → `scaffold-ir.ts`) — per the verified T010 finding this is the SECOND fabrication site and must share T020's single source of truth. Codec unchanged; no raw `.kmn` manipulation (Article II)
- [x] T022 [US1] Add `<Copyright>` and `<Author>` to the `<Info>` block in `buildKpsContent()` in `packages/engine/src/scaffolder/index.ts`, with `<Author URL="mailto:…">` when an email is present
- [x] T023 [US1] Require an author name before emission per D6/FR-015 — engine invents no holder and reports `ScaffoldResult.attributionMissing`; the studio now GATES download on `attribution === null` (`usePreviewArtifact.ts`) and `OutputScreen` states the real reason rather than blaming the compile

### Verification

- [x] T024 [US1] Assert SC-003 in `packages/engine/src/scaffolder/scaffolder.test.ts` — `LICENSE.md`, `store(&COPYRIGHT)`, and `.kps <Copyright>` all agree on the holder
- [x] T025 [US1] Assert SC-001 in `packages/engine/src/scaffolder/scaffolder.test.ts` — the keyboard's display name is never emitted as the copyright holder
- [x] T026 [US1] Assert SC-006 in `packages/engine/src/scaffolder/scaffolder.test.ts` — the MIT body is byte-identical across two differently-named keyboards
- [x] T027 [US1] Assert the emitted ZIP's `LICENSE.md` carries the confirmed holder — done in `packages/engine/src/output/zip.test.ts` against **real zip bytes read back with `unzipSync`**, rather than as a Playwright spec. The claim is decided by scaffold → `toZip`, not by the browser, so this is better isolated and needs no dev server. Also asserts the `.kmn` store and `.kps` agree (SC-003) and that no holder is invented when attribution is absent

**Checkpoint**: US1 is independently shippable. Slice B has not started, and nothing here
depends on D4 or D5.

**EMISSION DONE 2026-08-04.** Engine 1531 tests green. Two things came out differently than
planned:

1. **`resetIdentity`'s fallback now PRESERVES the base's copyright** instead of fabricating
   `Copyright © <year> <displayName>`. Three existing tests asserted the fabricated string, i.e.
   they pinned the defect SC-001 exists to remove; they now assert the base's notice survives.
   With no attribution and a base present, the `.kmn` therefore keeps the original author's
   notice — which is what MIT requires of a derivative, and strictly better than either
   fabricating or omitting.
2. **The missing-attribution signal is `ScaffoldResult.attributionMissing`, not a warning.**
   A first pass pushed onto `warnings`, which broke four tests for the right reason: that field
   is documented as "fell back to stub-only output", so overloading it made every un-attributed
   scaffold look like a fetch failure.

Verified by mutation testing: reverting the LICENSE.md fabrication, restoring `resetIdentity`'s
fabrication, dropping the `identity.copyright` pass-through, and removing the `.kps` fields each
turn the scaffolder suite red (6, 4, 2 and 3 failures respectively).

---

**SLICE A COMPLETE 2026-08-04** — contracts 454, engine 1537, studio 3740, all green;
all three packages typecheck clean.

**One known coverage gap, deliberately left and documented at the point of risk**
(`packages/studio/src/hooks/useKeyboardArtifact.test.ts`): the line forwarding
`attribution` into `scaffold()` is not test-covered. Mutation testing found that removing it
typechecks cleanly and breaks nothing. Covering it needs `vi.spyOn` over the
`getScaffolderService` module factory plus a `renderHook` of the whole fetch/compile pipeline,
and that combination exits the vitest worker rather than failing — so no broken test was left
behind. The exposed failure mode is narrow: attribution captured and download enabled, but the
zip emitted without it. Worth closing at the services boundary rather than the hook boundary.

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

## Content hand-off (Article VI) — written up in [HANDOFF-CONTENT.md](HANDOFF-CONTENT.md)

T015 lands **membership only**. The three revived questions were written for a fuller Phase A
battery, not for a prefilled confirm-this step, so their **prompt and help text almost certainly
need rewording** — and that text is Content-owned. Raise it as a separate Content-owned change
rather than having Engine rewrite survey copy inside this feature.

---

## Phase 5: User Story 2 — a derived keyboard retains the base author (Priority: P1)

**Goal**: MIT requires the original copyright notice be retained in a derivative. A keyboard
derived from a base carries the base's holders **verbatim** with the new author **appended** —
never substituted.

**Independent test**: Derive from a base whose `LICENSE.md` reads
`Copyright (c) 2016-2021 Original Author`; confirm the emitted `LICENSE.md` contains that line
byte-identically plus a new line for the deriving author, ordered oldest first.

- [x] T031 [US2] Fetch the base's `LICENSE.md` into `FetchKeyboardSourceResult.baseLicenseText` in `packages/engine/src/loader/fetchKeyboardSourceToVfs.ts` (FR-011) — it lives at the keyboard ROOT, not under `source/`, so it is a separate fetch from the sibling-asset walk. Absence is non-fatal and not a warning: ~545 of 554 legacy keyboards have none
- [x] T032 [US2] Parse it with `parseCopyright` and resolve inherited holders in `packages/engine/src/scaffolder/index.ts`, applying **D4** — `LICENSE.md` authoritative, the two sources NEVER merged into separate holders
- [x] T033 [US2] Make `attributionText()` ACCUMULATE via `addHolder`/`orderHolders` instead of emitting a single holder (FR-007/FR-008/D3)
- [x] T034 [US2] Surface **D5** as `ScaffoldResult.licenseUnparseable` — an unreadable notice must block, never be silently dropped (FR-010)
- [x] T035 [US2] Report `ScaffoldResult.inheritedHolderCount` so callers can tell a retained chain from a fresh keyboard
- [x] T036 [US2] Assert the accumulation in `packages/engine/src/scaffolder/scaffolder.test.ts` — retention, byte-identical inherited lines, chronological order, third-generation chains, the SIL rename left alone, year-range extension on re-derivation, and all four D5 cases

**PHASE 5 DONE 2026-08-04.** contracts 454, engine 1549, studio 3740 — all green.

Verified by mutation: replacing instead of accumulating (7 failures), not fetching the base
license (10), swallowing the D5 case (2), and putting only the new author in the `.kmn` store (1)
each turn the suite red.

**One documented limitation** *(format settled by T038)*. `store(&COPYRIGHT)` and `.kps
<Copyright>` are single-valued, so a multi-holder chain is collapsed using the corpus's
`<primary>. Portions <earlier>` convention. `LICENSE.md` keeps one holder per line and is the
authoritative notice (D4); the other two are metadata mirrors. Consequence: `parseCopyright`
splits on newlines, so re-reading a `.kmn` store sees one compound holder rather than several —
exactly as it does for `fv_dakelh` today. Acceptable because D4 makes `LICENSE.md` the source a
fork reads, but the `.kmn` is not a lossless fallback for a multi-generation chain.

**T037 DONE 2026-08-04.** contracts 454, engine 1555, studio 3749 — all green.

Verified by mutation: dropping the D5 term from the download gate (3 failures), accepting a blank
holder (1), and — after a gap was found — omitting the `retry()` re-scaffold (1).

That last one initially SURVIVED, and it was the load-bearing half: without the re-run the block
clears while the already-emitted `LICENSE.md` still lacks the holder, so the author would believe
the notice was retained when it was not. The harness mocked `retry` with a fresh `vi.fn()` per
call, which is unassertable; it is now hoisted.

**T038 DONE 2026-08-04.** contracts 454, engine 1563, studio 3749 — all green.

Verified by mutation: reverting to the `"; "` join (4 failures), making the oldest holder primary
instead of the deriving author (3), dropping the portions clause entirely (6), and normalising
inherited markers inside it (3) each turn the suite red.

**US2 is now complete.** Nothing in spec 059 remains open.

### Formerly open in US2 — both now closed

- [x] T037 [US2] Surface `licenseUnparseable` in the UI as a hard block with the manual-entry escape hatch D5 requires — **DONE**. `ScaffoldOptions.baseHolderOverride` lets the author name the original holder; the scaffolder then uses it as the inherited holder and stops reporting the block. Emitted with NO year, because the year is exactly what the unreadable line failed to establish — inventing one would put a fabricated fact in a legal notice. Held on the working copy (and persisted, so a reload does not re-block), gated in `usePreviewArtifact`, surfaced in `OutputScreen` with the offending line quoted and an input to resolve it. Confirming re-runs the pipeline so the notice is genuinely retained
- [x] T038 [US2] Decide how the single-valued `store(&COPYRIGHT)` / `.kps <Copyright>` express a multi-holder chain — **DONE, and it overturned the first implementation.** The corpus already settles it: 33 shipped keyboards use `<primary>. Portions <earlier>`, identically in both files (`release/fv/fv_dakelh`: `(c) 2008-2024 FirstVoices, SIL International. Portions (c) 2006 Chris Harvey`). The `"; "` join was an invention and is replaced. The DERIVING author is primary and the base author becomes the portion, which is the derivation relationship: this work is the new author's, incorporating parts of the base. Inherited markers are preserved inside the clause
