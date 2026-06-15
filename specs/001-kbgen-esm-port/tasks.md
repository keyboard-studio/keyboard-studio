# Tasks: kbgen ESM TypeScript port

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Branch**: `km/kbgen-esm-port`

**Scope guard**: toolchain port ONLY. No `@keyboard-studio/contracts` dependency,
no `PlacementMap` type (→ #133, blocked by #131). Behaviour-preserving (SC-003).
§13 no-compile boundary holds (FR-006).

**Owner**: Engine team (D-INT-4). `data/supplement.json` is content-owned — read-only here.

---

## Phase 1: Setup (build wiring)

- [ ] T001 Add `utilities/kbgen/tsconfig.json` extending `../../tsconfig.base.json` (ESM, `outDir: dist`, `rootDir: .`, include sources + test). (FR-003)
- [ ] T002 Add `utilities/kbgen/vitest.config.ts` resolving `test/anchors.test.ts`. (FR-004 support)
- [ ] T003 Edit `utilities/kbgen/package.json`: set `"type": "module"`, `bin.kbgen → dist/cli.js`, scripts `build: tsc -b` / `typecheck: tsc --noEmit` / `test: vitest run`; remove the `node test/anchors.test.js` script. (FR-001, FR-002)

---

## Phase 2: Foundational (blocking — capture the oracle BEFORE converting)

**⚠️ Must complete before any source conversion, or the behaviour-preservation oracle is lost.**

- [ ] T004 Run the legacy CommonJS tool on the Milestone-1 Latin-extended/QWERTY fixture and save `placement-map.json` to a baseline path (e.g. `/tmp/placement-map.baseline.json`); record the exact fixture args in `quickstart.md`. (SC-003 oracle)

---

## Phase 3: User Story 1 — builds & typechecks under the toolchain (P1) 🎯 MVP

**Goal**: kbgen is ESM TypeScript and passes `build` + `typecheck`.
**Independent test**: `pnpm --dir utilities/kbgen typecheck && pnpm --dir utilities/kbgen build` succeed on a clean checkout.

Source conversions are 1:1 file renames with CommonJS→ESM idiom translation
(`require`→`import`, `module.exports`→`export`, `__dirname`→`import.meta.url`,
`require.main===module`→`import.meta` CLI guard, `import type` for type-only imports
per `verbatimModuleSyntax`). Different files → parallelizable `[P]`.

- [ ] T005 [P] [US1] Convert `utilities/kbgen/sources/ucd.js` → `ucd.ts`. (FR-001)
- [ ] T006 [P] [US1] Convert `utilities/kbgen/sources/cldr.js` → `cldr.ts`. (FR-001)
- [ ] T007 [P] [US1] Convert `utilities/kbgen/sources/confusables.js` → `confusables.ts`. (FR-001)
- [ ] T008 [P] [US1] Convert `utilities/kbgen/layout.js` → `layout.ts`. (FR-001)
- [ ] T009 [P] [US1] Convert `utilities/kbgen/map.js` → `map.ts`. (FR-001)
- [ ] T010 [P] [US1] Convert `utilities/kbgen/emit.js` → `emit.ts` — keep emit as source-only; add NO compile step. (FR-001, FR-006)
- [ ] T011 [P] [US1] Convert `utilities/kbgen/analyze.js` → `analyze.ts`. (FR-001)
- [ ] T012 [P] [US1] Convert `utilities/kbgen/place.js` → `place.ts`. (FR-001)
- [ ] T013 [P] [US1] Convert `utilities/kbgen/corpus-diff.js` → `corpus-diff.ts`. (FR-001)
- [ ] T014 [P] [US1] Convert `utilities/kbgen/fetch-data.js` → `fetch-data.ts` — translate `__dirname` data-path reads to `fileURLToPath(import.meta.url)`; data files stay read via `fs`, not imported. (FR-001)
- [ ] T015 [US1] Convert `utilities/kbgen/cli.js` → `cli.ts` — translate the `require.main===module` guard to `import.meta`; wire imports to the converted modules (depends on T005–T014). (FR-001)
- [ ] T016 [US1] Add module-local internal TypeScript types needed for strict mode (anchor signals, layout/key-slot, internal placement-map shape) — NOT exported, NOT the contracts type. (data-model.md; FR-009 guard)
- [ ] T017 [US1] Run `pnpm --dir utilities/kbgen typecheck`; resolve `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` findings with guards/narrowing (no `any`). (SC-001)
- [ ] T018 [US1] Run `pnpm --dir utilities/kbgen build`; confirm `dist/` emits and `dist/cli.js` is executable; grep-confirm no `require(`/`module.exports` remain. (FR-001, SC-001)

**Checkpoint**: US1 done — buildable, typechecked ESM TypeScript tool.

---

## Phase 4: User Story 2 — tests run under vitest (P2)

**Goal**: anchor-cascade tests run under vitest, no assertion loss.
**Independent test**: `pnpm --dir utilities/kbgen test` passes; legacy `node` runner gone.

- [ ] T019 [US2] Convert `utilities/kbgen/test/anchors.test.js` → `anchors.test.ts`, rewriting assertions as vitest `describe`/`it`/`expect`, preserving every existing assertion. (FR-004, SC-002)
- [ ] T020 [US2] Run `pnpm --dir utilities/kbgen test`; confirm all anchor assertions pass and assertion count matches the legacy file. (SC-002)

**Checkpoint**: US2 done — workspace-consistent test runner.

---

## Phase 5: User Story 3 — final home decided & workspace green (P3)

**Goal**: home documented; `pnpm -r` green.
**Independent test**: INTEGRATION.md + CLAUDE.md state the home; `pnpm -r build/typecheck/test` green.

- [ ] T021 [US3] Update `utilities/kbgen/INTEGRATION.md`: record that #132 keeps kbgen in `utilities/` (not `packages/*`) until #133 lands `PlacementMap` (D-INT-1), with rationale (avoids non-conformant entry into the `pnpm -r` glob). (FR-007)
- [ ] T022 [US3] Update root `CLAUDE.md` kbgen paragraph to reflect the ESM-TS toolchain + `utilities/` home decision. (FR-007)
- [ ] T023 [US3] Confirm `utilities/kbgen` is NOT added to `pnpm-workspace.yaml`; run `pnpm -r build && pnpm -r typecheck && pnpm -r test` and confirm green. (FR-008, SC-004)

**Checkpoint**: US3 done — home settled, workspace green.

---

## Phase 6: Polish & verification

- [ ] T024 Behaviour-preservation gate: run the ported CLI on the Milestone-1 fixture; `diff` against the T004 baseline; require empty diff (byte-equivalent). (SC-003)
- [ ] T025 No-compile boundary check: grep `utilities/kbgen/*.ts` + `sources/*.ts` for `kmcmplib`/`.kmp`/`compile`; confirm none introduced. (FR-006, SC-005)
- [ ] T026 Conventions sweep: no emoji in CLI output (`[OK]`/`[WARN]`/`[ERROR]`); no GitHub issue numbers in shipped `.ts`/comments (Article VIII).

---

## Dependencies & ordering

- **Setup (T001–T003)** → before everything.
- **Foundational (T004)** → MUST precede all conversions (oracle capture).
- **US1 (T005–T018)** = MVP. T005–T014 parallel `[P]`; T015 depends on them; T016–T018 close the story.
- **US2 (T019–T020)** depends on US1 (needs ESM TS sources).
- **US3 (T021–T023)** depends on US1+US2 being green.
- **Polish (T024–T026)** last.

## Parallel example

```
# After T001–T004, launch the leaf-module conversions together:
T005 ucd.ts · T006 cldr.ts · T007 confusables.ts · T008 layout.ts ·
T009 map.ts · T010 emit.ts · T011 analyze.ts · T012 place.ts ·
T013 corpus-diff.ts · T014 fetch-data.ts
# Then T015 cli.ts (integration point), then T016–T018.
```

## MVP scope

**User Story 1 alone** (T001–T018) delivers a buildable, typechecked ESM TypeScript
kbgen — the core of issue #132. US2 (vitest) and US3 (home + green workspace)
complete the issue's remaining acceptance criteria.

## Acceptance-criteria mapping (issue #132)

| Issue AC checkbox | Tasks |
|---|---|
| CommonJS → ESM TypeScript | T001–T003, T005–T018 |
| tsconfig + build/typecheck scripts; node test → vitest | T001–T003, T019–T020 |
| Decide final home; keep `pnpm -r` green | T021–T023 |
| Keep no-compile boundary (§13) | T010, T025 |
