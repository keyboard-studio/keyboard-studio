# Tasks: Langtags-driven identity autocomplete

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Branch**: `km/030-langtags-identity-autocomplete`

Tests are included: the [contracts](contracts/) require langtags contract tests and flow-order tests, and the repo build gates on `pnpm -r test`.

**Team ownership** (Constitution Article VI): Phase 2 + Phase 8 langtags/codegen/type tasks are **Engine**; the survey-flow tasks (Phases 3–7) are **Content**. Grouped so `/km-lead` can dispatch km-programmer (engine) and km-frontend (survey) accordingly.

---

## Phase 1: Setup

- [x] T001 Establish a green baseline before changes: run `pnpm build` (prebuild fetches the pinned langtags `99b856b` + codegen) then `pnpm --filter @keyboard-studio/engine build` and `pnpm --filter @keyboard-studio/studio test src/survey`; record the pre-change flow order so the reorder diff is reviewable.

## Phase 2: Foundational — Engine langtags extension (BLOCKS all user stories)

- [x] T002 [P] Extend `LanguageDefaults` + `LanguageSummary` and add `RegionVariant` in `packages/contracts/src/langtags.ts` (additive OPTIONAL fields: `englishNames?`, `localNames?`, `regionVariants?`, `hasRegionVariants?`); update any co-located zod schema / drift guard in the same change (non-`Pattern` type — no version bump).
- [x] T003 Extend `scripts/codegen-langtags.mjs` to retain `names[]` / `localnames[]` / `regionname` from each source tagset and group region-distinct tagsets of a bare subtag into `regionVariants`; keep the existing emitted fields (`autonym`/`englishName`/`regions`) byte-stable.
- [x] T004 Regenerate the slim index `packages/engine/src/langtags/generated/index.ts` via codegen and commit the regenerated artifact (do not hand-edit).
- [x] T005 Populate the new fields in `packages/engine/src/langtags/index.ts`: `getLanguageDefaults` returns `englishNames`/`localNames`/`regionVariants`; `lookupByName` sets `hasRegionVariants`. Keep existing return shape/behavior intact.
- [x] T006 [P] Surface the new fields to the survey layer in `packages/studio/src/lib/langtagsDefaults.ts` (extend `searchLanguages`/`defaultsFor` return usage; add a resolver for a subtag → `regionVariants`).
- [x] T007 [P] Engine contract tests in `packages/engine/src/langtags/index.test.ts`: single-region language → `regionVariants` length 1 + `localNames` includes primary; multi-region language → `regionVariants` length > 1 with distinct `regionName`s; `lookupByName` sets `hasRegionVariants` correctly; existing primary-field assertions still pass (back-compat).
- [x] T008 Build-time verification (research R1): confirm the pinned `99b856b` langtags data actually carries `names`/`localnames`/`regionname` with real multiplicity for the exemplar languages used in T007; if coverage differs, update `research.md` and the test exemplars.

**Checkpoint**: engine langtags API returns the extended data; `pnpm --filter @keyboard-studio/engine test src/langtags` green. Survey stories can now build on it.

## Phase 3: User Story 1 — Find my language by its English name (P1) 🎯 MVP

**Goal**: First question is an English-name autocomplete that resolves a langtags entry (script/local names/code); free-text accepted for unlisted languages.

**Independent test**: Enter "Swahili" → language resolves and seeds downstream defaults; enter an unlisted name → accepted, flow continues with no defaults.

- [x] T009 [US1] Reorder the live flow: in `content/flows/identity_lite.modular.yaml` make `il_language_english` the first membership entry; in `packages/studio/src/survey/questions/a/il_language_english.ts` change it to `type: autocomplete` with `options_source: "@langtags_iso639"` and set `next` to `il_language_autonym` (region wiring added in US3); update `il_language_autonym.ts` `next` → `il_language_code`.
- [x] T010 [US1] In `packages/studio/src/survey/IdentityLite.tsx` add `resolvedEntryRef`; on `il_language_english` commit resolve the langtags entry (via the T006 wrapper), set `selectedVariantRef` to the primary variant, and set `resolvedEntryRef = null` on a free-text/no-match value.
- [x] T011 [US1] Rework `getSeedValue` in `IdentityLite.tsx` to seed downstream from `resolvedEntryRef` (single-variant baseline) and REMOVE the obsolete autonym→English seed direction; preserve the seed-on-first-arrival / never-overwrite contract.
- [x] T012 [P] [US1] Update the `il_language_english` fixtures in `packages/studio/tests/survey/questions/a/` (and the module `fixtures` block) for the autocomplete-first shape.
- [x] T013 [US1] Tests in `packages/studio/src/survey/loadModularFlow.test.ts` (+ IdentityLite test): live flow resolves English-name-first order; free-text no-match still completes the flow (graceful degradation).

**Checkpoint**: US1 independently testable — English name resolves a language and seeds defaults; unlisted names degrade gracefully.

## Phase 4: User Story 2 — Choose (or type) my own-language name (P2)

**Goal**: Own-language step offers the resolved variant's local names as choices, with free-text override.

**Independent test**: For a resolved language with multiple recorded local names, all appear as choices; a custom typed value is accepted instead.

- [x] T014 [US2] Change `packages/studio/src/survey/questions/a/il_language_autonym.ts` to an autocomplete/datalist seeded with the selected variant's `localNames` as options, free-text override preserved, `required: true`.
- [x] T015 [US2] `getSeedValue("il_language_autonym")` in `IdentityLite.tsx` returns `selectedVariantRef.localNames` (choices) and pre-fills the primary when present.
- [x] T016 [P] [US2] Update `il_language_autonym` fixtures for the multi-choice + free-text shape.
- [x] T017 [US2] Tests: multiple local names offered as choices; custom typed value accepted and carried forward; single-name case pre-fills and stays editable.

**Checkpoint**: US2 works on top of US1 using the primary variant (region refinement comes in US3).

## Phase 5: User Story 4 — Confirm the language code (P2)

**Goal**: Language code becomes an auto-filled confirmation step after the names; assembles the BCP47 tag.

**Independent test**: Resolved language → code pre-filled for confirmation; override works; unmatched language → free-text/blank still allowed.

- [x] T018 [US4] Position `packages/studio/src/survey/questions/a/il_language_code.ts` after the name steps; keep it `type: autocomplete`, `required: false`; `getSeedValue("il_language_code")` returns `resolvedEntryRef.subtag`; preserve free-text/blank for unmatched languages.
- [x] T019 [US4] Update `buildTargetBcp47` in `IdentityLite.tsx` to assemble the tag from confirmed code + resolved script + selected region (FR-011).
- [x] T020 [P] [US4] Update `il_language_code` fixtures for the auto-filled-confirmation shape.
- [x] T021 [US4] Tests: code pre-filled and confirmable; override honored; unmatched → typed code or blank; `bcp47` composed from code+script+region.

**Checkpoint**: US4 completes the happy-path identity capture without hand-typing a code.

## Phase 6: User Story 3 — Region disambiguation (P3)

**Goal**: When the English name is ambiguous across regions, ask the region; the pick narrows the variant (driving US2 choices + the BCP47 region).

**Independent test**: Enter an ambiguous English name → region question appears with candidate countries; picking one narrows Q2's local-name choices and the recorded region; unambiguous name → no region question.

- [x] T022 [US3] Create `packages/studio/src/survey/questions/a/il_language_region.ts`: choice/autocomplete over the resolved entry's `regionVariants[].regionName`, `required: false`, conditional `next` → `il_language_autonym`.
- [x] T023 [US3] Register `il_language_region` in `packages/studio/src/survey/questions/registry.a.ts`.
- [x] T024 [US3] In `IdentityLite.tsx`, on `il_language_region` commit set `selectedVariantRef` to the chosen variant; make `il_language_english.next` route to `il_language_region` only when `hasRegionVariants`, else straight to `il_language_autonym`; skipping the region falls back to the primary variant (never blocks).
- [x] T025 [US3] Add `il_language_region` to the `content/flows/identity_lite.modular.yaml` membership list (between english and autonym) and confirm membership order agrees with the `next` chain.
- [x] T026 [P] [US3] `il_language_region` fixtures + tests: region step appears only when the resolved entry is ambiguous; skip → primary variant; region selection drives Q2 `localNames` and the BCP47 region subtag.

**Checkpoint**: full live flow behaves per spec; region asked only when needed.

## Phase 7: Mirror into the proposed Phase A flow (FR-015)

- [x] T027 Mirror the reordering in the proposed flow: `content/flows/proposed/phase_a_identity.modular.yaml` (membership english→autonym→iso_code), `language_name_english.ts` (autocomplete `@langtags_names`, `next` → `language_name_autonym`) / `language_name_autonym.ts` (`next` → `iso_code`), and `desktop_first_notice.ts` `next` → `language_name_english`. NOTE: no `language_name_region` analogue added — the proposed flow is display-only (rendered as a graph, no runtime resolver), so region disambiguation stays a live-flow-only interactive refinement.
- [x] T028 [P] Proposed-flow fixtures/tests confirming its order mirrors the live IdentityLite order.

## Phase 8: Polish & Cross-Cutting

- [x] T029 Update order-asserting snapshots/tests to the new order + conditional region node: `packages/studio/tests/survey/__snapshots__/flow-parity.test.ts.snap`, `packages/studio/src/dashboard/buildStepGraph.test.ts`, `packages/studio/src/__tests__/stepHost.goldenWalk.test.tsx`.
- [x] T030 [P] Provenance tagging (FR-010): mark seeded English/local-name/code/script fields with langtags provenance via `getSeedProvenance` in `IdentityLite.tsx` so the Flow Map shows "suggested — edit if needed".
- [ ] T031 Full gate: `pnpm typecheck && pnpm -r test && pnpm lint && pnpm depcruise` (all green modulo the known Node-26-local jsdom/crypto env failures that pass on CI Node 22).
- [x] T032 [P] Docs: record the identity-flow redesign in `docs/spec-signoff.md` (or the survey docs) and cross-link `spec.md §8`; no keyboard-phonebook change expected (verify).

---

## Dependencies

- **Phase 2 (Foundational) blocks everything** — the survey stories consume the extended langtags data.
- **US1 (Phase 3) blocks US2, US4, US3** — they all consume the resolved entry / selected variant.
- **US3 (Phase 6) refines US2** — US2 works with the primary variant; US3 adds the region-driven variant selection (so US3 after US2).
- **Phase 7 (proposed-flow mirror) after the live flow (Phases 3–6) is stable.**
- **Phase 8 (snapshots/polish) last** — snapshots settle only once the final order + region node exist.

## Parallel opportunities

- Within Phase 2: T002 (contracts types) ∥ T007 (engine tests scaffold) ∥ T006 (studio wrapper) once T003–T005 land; T002 can start immediately.
- `[P]` fixture tasks (T012, T016, T020, T026, T028) run parallel to their sibling implementation tasks (different files).
- T030 (provenance) ∥ T032 (docs) in Phase 8.

## Independent test criteria (per story)

- **US1**: English-name autocomplete resolves a known language and seeds defaults; unlisted name degrades gracefully — no dead end.
- **US2**: multiple recorded local names offered as choices; custom typed name accepted.
- **US4**: language code pre-filled and confirmable; override + unmatched free-text/blank work; BCP47 assembled.
- **US3**: region asked only when ambiguous; pick narrows local-name choices + records the region; skip → primary.

## Implementation strategy

- **MVP = Phase 1 + Phase 2 + Phase 3 (US1)** — English-name autocomplete resolves the language with graceful free-text fallback. Shippable and demonstrable on its own.
- **Increment 2** = US2 + US4 (local-name choice + code confirmation) — completes the happy-path identity capture.
- **Increment 3** = US3 (region disambiguation) — correctness refinement for ambiguous names.
- **Increment 4** = Phase 7 (proposed-flow mirror) + Phase 8 (snapshots/provenance/docs/gate).
