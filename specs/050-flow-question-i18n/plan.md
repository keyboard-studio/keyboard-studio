# Implementation Plan: Flow-Question Content i18n (Tier B coverage for the modular flow engine)

**Branch**: `050-flow-question-i18n` | **Date**: 2026-07-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/050-flow-question-i18n/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Every modular flow-engine question's `prompt`/`label`/`body`/`help_text` (and `options[].label`) renders as raw hardcoded English today — `QuestionField.tsx` has no Tier A or Tier B resolution path for them at all. Add a fourth Tier B catalog type, `flowQuestions`, alongside the existing `patterns`/`adaptationQuestions`/`criteria` (spec 046 T027/T028): extend `utilities/i18n-content-extract` to read the live per-phase question registries (not the demoted `reserve` ones) the same way it already reads `ALL_CRITERIA` from `@keyboard-studio/contracts`, wire `QuestionField.tsx`'s render sites through `resolveContentString("flowQuestions", …)`, author the French catalog, and extend the Crowdin mapping + `content-i18n-lint` to cover it — mirroring spec 046 T029-T031's precedent exactly, just for a new catalog type.

## Technical Context

**Language/Version**: TypeScript (repo baseline, pnpm workspace) — matches spec 046 exactly, no new language/runtime.

**Primary Dependencies**: None new. Reuses `packages/studio/src/lib/contentI18n.ts` (Tier B loader, T028), `utilities/i18n-content-extract` (extraction, T027), `utilities/content-i18n-lint` (drift gate, T031), `crowdin.yml` Tier B mapping (T030).

**Storage**: Flat JSON sidecar catalogs under `content/i18n/{locale}/flowQuestions.json`, same format as the existing three Tier B catalogs (see [contracts/flow-question-catalog-format.md](contracts/flow-question-catalog-format.md)).

**Testing**: `vitest` — extractor unit test (control-field exclusion, live-vs-reserve scoping), `contentI18n.ts` resolution test extended for the new type, a `QuestionField.tsx` render test asserting translated text under a seeded `fr` catalog and English fallback when untranslated.

**Target Platform**: Browser SPA (`packages/studio`) — unchanged from spec 046.

**Project Type**: Web application (existing three-pane SPA) — no new project.

**Performance Goals**: N/A — sidecar catalogs are code-split per locale exactly as the existing three types (T028), no new load-path cost beyond one more lazy chunk.

**Constraints**: Must not import any React/Vite-only module into the plain-`tsx` `utilities/i18n-content-extract` tool (it runs outside the pnpm workspace, per CLAUDE.md's "Standalone utilities" note) — confirmed during research that the full question-registry import chain (`packages/studio/src/survey/questions/registry.ts` and its phase sub-registries) is React/Vite-free (see [research.md](research.md)).

**Scale/Scope**: ~60 live question modules across phases A/B/F/G (identity-lite, provenance/character-inventory, welcome-footer, project-naming) at time of writing; `registry.reserve.ts`'s demoted modules are explicitly excluded (dead content — see research.md).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Article I (Pattern schema locked)** — N/A. No `Pattern`/`Criterion` field is touched; `FlowQuestion` (`packages/studio/src/survey/types.ts`) is a studio-internal type, not the locked contract.
- **Article II (KeyboardIR spine)** — N/A. This feature touches survey-question *rendering* and *translation catalogs*, never the codec or `KeyboardIR`.
- **Article III (single working copy)** — N/A. No working-copy mutation involved.
- **Article IV (validator layering)** — N/A. No validator/debounce-cycle change.
- **Article V (VirtualFS only during authoring)** — N/A. No output/serialization path touched.
- **Article VI (team boundaries)** — **(content, + engine seam)**, mirroring spec 046 US2's own annotation exactly: the extraction/catalog/Crowdin/lint work is content-owned; the `QuestionField.tsx` render-site wiring is the engine seam. Same split as T026-T031.
- **Article VII (out of scope for v1)** — N/A. Does not touch any out-of-scope area (CJK/Ethiopic, LDML, touch-first authoring, etc.).
- **Article VIII (house conventions)** — Followed: no emoji, markdown-link file references, commit style `feat(studio)`/`feat(contracts)` per area, no bare GitHub issue numbers in code/comments.

**Result**: PASS. No violations to justify; Complexity Tracking section left empty.

**Post-design re-check** (after Phase 1 data-model/contracts/quickstart): unchanged — PASS. The design stayed within the four touchpoints identified in Summary; nothing in `data-model.md`/`contracts/`/`quickstart.md` introduces a new working-copy path, validator layer, or schema change.

## Project Structure

### Documentation (this feature)

```text
specs/050-flow-question-i18n/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── flow-question-catalog-format.md   # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
utilities/i18n-content-extract/
├── extract.ts                    # add extractFlowQuestionStrings(), reads live phase registries
└── extract.test.ts               # add control-field-exclusion + reserve-exclusion tests

packages/studio/src/lib/
├── contentI18n.ts                 # add "flowQuestions" to ContentCatalogType + NAMESPACE
└── contentI18n.test.ts            # extend resolution tests for the new type

packages/studio/src/survey/
├── QuestionField.tsx               # wire prompt/label/body/help_text/options[].label render sites
└── QuestionField.test.tsx          # translated-render + English-fallback assertions

content/i18n/en/
└── flowQuestions.json              # new English-source catalog (generated, not hand-authored)

content/i18n/fr/
└── flowQuestions.json              # new French catalog (hand-authored ahead of live Crowdin sync, T030 precedent)

utilities/i18n-content-extract/
└── cli.ts                          # add flowQuestions.json to the emitted-files list (freshness --check follows for free)

package.json                         # add a lint step running `cli.ts --check` (flowQuestions freshness gate, research.md D7)

crowdin.yml                          # NO edit needed — its Tier B block already globs /content/i18n/en/*.json (verify-only)

utilities/content-i18n-lint/
└── index.js                        # add flowQuestions.json to CATALOG_FILES (locale key-set parity only; freshness is the CLI --check step, research.md D7)
```

**Structure Decision**: No new package or directory — this slots into the existing Tier B pipeline's four touchpoints (extractor, loader, render site, ops config) exactly where spec 046 T027-T031 already put the first three catalog types. `content/` stays content-owned; `packages/studio/src/survey/QuestionField.tsx` is the one engine-owned seam (Article VI split, same as T026-T031).

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
