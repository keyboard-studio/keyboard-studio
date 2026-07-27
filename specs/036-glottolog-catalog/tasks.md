---
description: "Task list for Glottolog classification catalog + related-keyboard-base bridge"
---

# Tasks: Glottolog classification catalog + related-keyboard-base bridge

**Input**: Design documents from `specs/036-glottolog-catalog/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: INCLUDED — the spec's acceptance scenarios, SC-005 (determinism), SC-006 (related/pseudo-family), and [quickstart.md](quickstart.md) explicitly call for vitest coverage and a codegen-determinism test.

**Team**: Engine (Constitution Article VI). Branch: `km/glottolog-catalog`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories)
- Paths are repo-root-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the new package skeleton and the version pin.

- [ ] T001 Create package skeleton `packages/glottolog/` — `package.json` (name `@keyboard-studio/glottolog`, `"type":"module"`, dep `@keyboard-studio/contracts: workspace:*`, devDeps `typescript ^6.0.3` + `vitest ^4.1.6`, scripts `build`/`clean`/`typecheck`/`test`), `tsconfig.json` (extends `../../tsconfig.base.json`, composite, `rootDir: src`, `outDir: dist`), and `vitest.config.ts` — mirroring `packages/llm/`
- [ ] T002 [P] Gitignore the vendored data dir: add `packages/glottolog/data/glottolog/languages.csv` (keep `SOURCES.json` tracked) to `.gitignore`, mirroring the langtags entry
- [ ] T003 [P] Create `scripts/glottolog-version.json` — pinned `glottolog/glottolog-cldf` release (`source`, `commit`/`tag`, `urlTemplate` with `{commit}`, `path: cldf/languages.csv`, placeholder `sha256`, `license: CC-BY-4.0`, `notice`), shape-identical to `scripts/langtags-version.json` (research.md D1)
- [ ] T004 [P] Add `@keyboard-studio/glottolog` as a `references` entry in the root `tsconfig.json` project graph (and any aggregate build config), so `tsc -b` builds it

**Checkpoint**: `pnpm --filter @keyboard-studio/glottolog build` resolves (empty package compiles).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Produce the checked-in generated index and the shared types every story needs.

**⚠️ CRITICAL**: No user story can begin until the generated index and types exist.

- [ ] T005 Implement `scripts/fetch-glottolog.mjs` — read the pin, download `cldf/languages.csv`, SHA-256-verify (fail loudly on placeholder/mismatch, non-zero exit), write `packages/glottolog/data/glottolog/languages.csv` + `SOURCES.json` (commit, sha256, url, notice, bytes, recordCount); port `scripts/fetch-langtags.mjs` incl. `--compute-sha` (FR-001, FR-002)
- [ ] T006 [P] Define types in `packages/glottolog/src/types.ts` — `Glottocode`, `Iso639P3`, `Script`, `LanguoidRecord`, `Languoid`, `RelatednessResult`, `KeyboardBaseCandidate`; import `BaseKeyboard` from `@keyboard-studio/contracts` (data-model.md)
- [ ] T007 [P] Create `packages/glottolog/src/pseudo-families.ts` — curated `readonly Set<Glottocode>` of pseudo-family roots (`book1242`, `uncl1493`, `unat1236`, `arti1236`, `sign1238`, `mixe1287`, `pidg1258`, `spee1234`); confirm exact codes against the pinned release (FR-012, research.md D6)
- [ ] T008 Implement `scripts/codegen-glottolog.mjs` — parse `languages.csv`, reconstruct tree from `Parent_ID`, derive `level` (research.md D2), emit deterministic `packages/glottolog/src/generated/index.ts` exporting `languoids: Record<Glottocode, LanguoidRecord>` and permissive `byIso: Record<Iso639P3, Glottocode[]>` (sorted keys/arrays, fixed record key order, write-only-on-change, per-record `as` cast); port `scripts/codegen-langtags.mjs` (FR-003, research.md D11)
- [ ] T009 Wire both scripts into root `package.json`: add `fetch-glottolog` + `codegen-glottolog` scripts and append them to the `prebuild` chain after the langtags steps (FR-004)
- [ ] T010 Run `pnpm run fetch-glottolog && pnpm run codegen-glottolog` to produce and commit `packages/glottolog/src/generated/index.ts` + `SOURCES.json` (depends on T005, T008, T009; requires one-time network access)

**Checkpoint**: generated index exists and imports cleanly; types available to all stories.

---

## Phase 3: User Story 1 - Find genealogically close languages (Priority: P1) 🎯 MVP

**Goal**: Given a target (glottocode or ISO 639-3), return its ancestry and a relatedness-ranked list of other languoids / related ISO codes — offline, synchronous, deterministic.

**Independent Test**: Feed a known glottocode/ISO from the pinned data; assert root-first ancestry, permissive multi-glottocode ISO resolution, closest-first relatedness, and that a pseudo-family-only pair is not related — with zero I/O.

### Tests for User Story 1

- [ ] T011 [P] [US1] Catalog tests in `packages/glottolog/src/index.test.ts` — `getLanguoid` hit/null; `byIso639p3` returns all matches deduped (incl. a known multi-glottocode ISO); `ancestors` root-first + `[]` for an isolate (contracts/glottolog-catalog-api.md)
- [ ] T012 [P] [US1] Relatedness tests in `packages/glottolog/src/relatedness.test.ts` — a known related pair ranks related; a cross-family pair returns none; two languages sharing only a pseudo-family are NOT related; ordering by shared-depth→path→glottocode; no default cap (FR-011, FR-012, FR-013, SC-006)

### Implementation for User Story 1

- [ ] T013 [US1] Implement the resolved-`Languoid` loader in `packages/glottolog/src/index.ts` — read `generated/index.ts`, compute `familyId`/`isPseudoFamily`, and implement `getLanguoid` + `byIso639p3` (permissive, deduped) + `ancestors` (root-first, excludes self) (FR-007, FR-008, FR-009, D7)
- [ ] T014 [US1] Implement `relatedLanguages` + `RelatednessOptions` in `packages/glottolog/src/relatedness.ts` — shared-subgroup-depth via longest-common-prefix of root-first ancestries, tie-breaks, pseudo-family + cross-family exclusion, no default cap (FR-011, FR-012, FR-013, D3)
- [ ] T015 [US1] Implement `relatedIsoCodes` (ISO-in → union across matched glottocodes → dedupe keeping closest → drop ISO-less) in `packages/glottolog/src/index.ts` (FR-011a, D4)
- [ ] T016 [US1] Export the public catalog surface from the package root (`index.ts`) and confirm the root `exports` map in `package.json`

**Checkpoint**: US1 is a usable, independently-testable relatedness catalog (MVP).

---

## Phase 4: User Story 2 - Suggest an existing keyboard as a base (Priority: P2)

**Goal**: Given a target with no keyboard, return ranked candidate bases — genealogical (same-family, same-script) first, then the existing script-based fallback — one per keyboard, never wrong-script.

**Independent Test**: With fixture `languagesById` + a stub `resolveLanguage`, a target with a same-script relative returns a genealogical candidate; a wrong-script relative is excluded; a keyboard covering two relatives appears once with `alsoSupports`; both-tiers-empty ⇒ `[]`.

### Tests for User Story 2

- [ ] T017 [P] [US2] Bridge tests in `packages/glottolog/src/bridge.test.ts` — direct/genealogical/script-fallback tiers; script coincidence (wrong-script excluded); per-keyboard dedup + `alsoSupports`; ordering; `[]` only when both tiers empty; purity (FR-014–FR-017c, FR-015, FR-016a, SC-002)

### Implementation for User Story 2

- [ ] T018 [US2] Implement `findKeyboardBaseCandidates` in `packages/glottolog/src/bridge.ts` — injected `resolveLanguage` / `languagesById` / optional `scriptFallback` / `getBase`; direct + genealogical(∩script) + fallback tiers; per-keyboard dedup by closest relative; closest-first ordering; empty-only-when-both-empty (contracts/keyboard-base-bridge-api.md)
- [ ] T019 [US2] Add the `./bridge` subpath export to `packages/glottolog/package.json` + `exports` map, and a `bridge.ts` re-export barrel if needed
- [ ] T020 [US2] Wire the bridge into the studio base-resolution: add `@keyboard-studio/glottolog: workspace:*` to `packages/studio/package.json`; in `packages/studio/src/lib/suggestBase.ts` / `BaseResolution.tsx`, inject `resolveLanguage` (from `@keyboard-studio/engine/langtags`), `languagesById` (base-browser phonebook), the existing `suggestBases` as `scriptFallback`, and `getBase` (base-browser); slot the genealogical tier between `language-match` and `script-match`
- [ ] T021 [P] [US2] Studio integration test/E2E hook for the wired base-resolution path (extend an existing base-resolution test or `packages/studio/e2e`) — a target with no direct keyboard surfaces a genealogical base ahead of a pure script-match

**Checkpoint**: US1 + US2 both work; the full unsupported-language → ranked-base bridge is live.

---

## Phase 5: User Story 3 - Update the catalog to a newer Glottolog release (Priority: P3)

**Goal**: A maintainer bumps the pin and regenerates deterministically; corrupt downloads fail loudly.

**Independent Test**: Run codegen twice → byte-identical index; feed a mismatched/placeholder SHA → build aborts non-zero; a clean checkout produces the catalog via `prebuild`.

### Tests for User Story 3

- [ ] T022 [P] [US3] Determinism test in `packages/glottolog/src/codegen-determinism.test.ts` — codegen twice against the vendored source ⇒ byte-identical `generated/index.ts` (FR-003, SC-005), mirroring the langtags determinism test
- [ ] T023 [P] [US3] Fetch-guard test — placeholder/mismatched `sha256` causes `fetch-glottolog.mjs` to exit non-zero without writing a partial file (FR-002, SC-005)

### Implementation for User Story 3

- [ ] T024 [US3] Author `packages/glottolog/README.md` — the pin-bump procedure (edit version file → fetch → codegen → review pseudo-families → commit), no-code-change guarantee, and offline/no-host-IO invariants (FR-005, SC-007)
- [ ] T025 [US3] Verify a clean-checkout `pnpm build` runs `fetch-glottolog`+`codegen-glottolog` in prebuild order and produces the catalog (evidence in the PR)

**Checkpoint**: the catalog is maintainable via pin-and-regen with loud failure on tamper.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T026 [P] Add the `@keyboard-studio/glottolog` row to the CLAUDE.md package inventory and README package list (FR-019)
- [ ] T027 [P] If the wired bridge references any keyboard not yet in `docs/keyboard-index.md`, add its phonebook row in the same change (FR-020)
- [ ] T028 Verify `pnpm depcruise` passes — `@keyboard-studio/glottolog` imports only `@keyboard-studio/contracts` (no engine/studio edge); run `pnpm lint`
- [ ] T029 Run the [quickstart.md](quickstart.md) end-to-end scenario (SC-001) against the pinned data and record the concrete target/relative pair used

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)**: no deps.
- **Foundational (P2)**: after Setup; **blocks all stories** (T010 generated index + T006 types are prerequisites).
- **US1 (P3)**: after Foundational. MVP.
- **US2 (P4)**: after US1 (bridge consumes `relatedIsoCodes` from US1).
- **US3 (P5)**: after Foundational; independent of US1/US2 (tests the fetch/codegen mechanics). Can run in parallel with US1/US2.
- **Polish (P6)**: after the stories it covers.

### Within/again notable edges

- T005, T008 → T010 (must exist to run); T009 wires them.
- T013 → T014/T015 (relatedness + ISO projection read the loader); T014 → T017/T018 (bridge uses relatedness).
- T018 → T019/T020/T021 (export + wiring depend on the implementation).

### Parallel opportunities

- Setup: T002, T003, T004 in parallel (T001 first).
- Foundational: T006, T007 in parallel with T005; T008 after the pin exists.
- US1 tests T011, T012 in parallel (write-first); US3 tests T022, T023 in parallel.
- US3 phase can proceed alongside US1/US2 once Foundational is done.
- Polish: T026, T027 in parallel.

---

## Parallel Example: User Story 1

```bash
# Write US1 tests together (fail first):
Task: "Catalog tests in packages/glottolog/src/index.test.ts"
Task: "Relatedness tests in packages/glottolog/src/relatedness.test.ts"
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (generated index + types) → 3. Phase 3 US1 → **STOP & VALIDATE** the relatedness catalog independently (it is useful to any consumer on its own).

### Incremental delivery

Foundation → US1 (relatedness catalog, MVP) → US2 (keyboard-base bridge + studio wiring) → US3 (maintainer regen guarantees). Each story adds value without breaking the previous.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- Tests are write-first within each story; verify they fail before implementing.
- Keep the package `contracts`-only — the bridge takes injected callbacks (research.md D8); do NOT import engine/studio from `packages/glottolog`.
- Commit per task or logical group with `feat(engine|tools): …` / `feat(deps): …`; open the PR with `closes #N` only after AC reconciliation.
