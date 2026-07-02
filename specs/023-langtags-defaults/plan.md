# Implementation Plan: SIL langtags defaults at the front of the survey

**Branch**: `km/langtags-defaults` | **Date**: 2026-06-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/023-langtags-defaults/spec.md`

## Summary

Vendor the SIL langtags dataset at build time (pinned + SHA-256-verified), codegen a compact lookup
index, expose it from the engine as `@keyboard-studio/engine/langtags`, and wire the front of the
survey so identifying a language pre-proposes its default **script**, **region**, **autonym**, and
**English name** as editable, provenance-labeled confirmations — resolving the existing
`@langtags_iso639` placeholder and supplying the data source [specs/002-defaults-engine](../002-defaults-engine/spec.md)
already assumes. Reuses the established fetch+pin+codegen pattern
([fetch-kmcmplib.mjs](../../scripts/fetch-kmcmplib.mjs),
[compile-recognizer-rules.mjs](../../scripts/compile-recognizer-rules.mjs)) and the existing
per-question forward-seed mechanism; no new debounce path, no schema change, no host-disk writes.

## Technical Context

**Language/Version**: TypeScript (engine `tsc` 5.x; root tooling 6.x), Node ≥ 20 ESM for build scripts;
React 18 + Vite for the studio SPA.

**Primary Dependencies**: existing only — `@keyboard-studio/contracts`, `@keyboard-studio/engine`,
the studio survey machinery (`SurveyRunner`, `QuestionField`, per-question modules), `node:crypto`/
`node:https` for fetch+hash. No new runtime dependency.

**Storage**: vendored data file (raw `langtags.json`, build-time only) + checked-in codegen output
(slim index TS module) under `packages/engine/src/langtags/generated/`. No database, no runtime fetch.

**Testing**: vitest (engine adapter + codegen determinism; studio question-module fixtures).

**Target Platform**: build scripts run on Node; the slim index ships to the browser SPA (WASM/ESM).

**Project Type**: pnpm monorepo (web SPA + engine library + contracts + build scripts).

**Performance Goals**: slim index loaded on demand (dynamic import → separate chunk), not in the
initial app payload (FR-011); lookups are O(1) map access; codegen is deterministic.

**Constraints**: do not ship raw ~5.4 MB `langtags.json` to the client (FR-011); build fails loudly on
integrity/codegen error (FR-012); MIT notice retained with vendored data (FR-010); additive types only
(no Pattern/Criterion change); single 300 ms debounce preserved; VirtualFS-only authoring preserved.

**Scale/Scope**: langtags has ~the world's languages (thousands of equivalence sets); the slim index is
one compact record + one summary per language subtag (2- and 3-letter keys).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Status | Notes |
|---|---|---|
| I. Pattern schema locked | PASS | No Pattern/Criterion edit. New `LanguageDefaults`/`LanguageSummary` types are additive and unrelated to the locked schema. |
| II. KeyboardIR is the spine | PASS | Proposals seed survey answers/identity; any IR write goes through existing question-module `mutate()` seams over `KeyboardIR`. No raw `.kmn` handling. |
| III. Single working copy | PASS | No new working copy or intermediate serialization; proposals populate the existing copy's identity fields. |
| IV. Validator layering / one debounce | PASS | No validator or debounce change in scope. (Script-mismatch validation is explicitly deferred to specs/002.) |
| V. VirtualFS only | PASS | Data is vendored at build time + codegen'd; the SPA loads a static slim index. No host-disk writes during authoring. |
| VI. Team boundaries | PASS | Engine team owns the SPA, scaffolder, engine, build scripts (spec §12). ISO-639 list labels/text are a Content touch-point — km-author/km-doc review the user-facing strings. |
| VII. Out of scope v1 | PASS | Ethiopic/Han/Hangul still route to the existing "not supported" stub; the default-script proposal is shown honestly, never used to enable an out-of-scope script. |
| VIII. House conventions | PASS | `[OK]/[WARN]/[ERROR]` console output; markdown-link file refs; no issue numbers in code; `feat(...)`/`chore(...)` commit titles; branch `km/langtags-defaults`. |

**Result: PASS — no violations, Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/023-langtags-defaults/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (engine langtags API contract)
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # /speckit-tasks output (not created here)
```

### Source Code (repository root)

```text
scripts/
├── langtags-version.json        # NEW — pinned commit + SHA-256 + raw URL template (mirrors kmcmplib-version.json)
├── fetch-langtags.mjs           # NEW — download + SHA-256 verify (reuses download()/createHash pattern)
└── codegen-langtags.mjs         # NEW — derive slim index → generated TS (mirrors compile-recognizer-rules.mjs)

packages/engine/
├── data/langtags/               # NEW — vendored raw langtags.json + LICENSE/NOTICE + SOURCES manifest (build input)
├── src/langtags/
│   ├── index.ts                 # NEW — getLanguageDefaults / listLanguages / lookupByName
│   └── generated/               # NEW — codegen'd slim index + languages list (checked in, never hand-edited)
└── package.json                 # MODIFY — add "./langtags" subpath export (mirrors "./placement")

packages/contracts/src/
└── langtags.ts                  # NEW — LanguageDefaults, LanguageSummary, LangtagsProvenance types (additive)

packages/studio/src/survey/
├── questions/a/il_language_code.ts   # MODIFY — text → autocomplete (options_source @langtags_iso639) + free-text fallback
├── questions/a/il_target_script.ts   # MODIFY — seed default script from selected language
├── questions/a/iso_code.ts           # MODIFY — feed resolved @langtags_iso639 options
├── questions/a/region.ts             # MODIFY — seed default region; keep free-text override
├── IdentityLite.tsx                  # MODIFY — capture selected language record; seed dependents
├── SurveyRunner.tsx                  # MODIFY — render seed-provenance caption (getSeedProvenance)
├── QuestionField.tsx                 # MODIFY — autocomplete renders options from a resolved source
└── lib/langtagsDefaults.ts           # NEW — studio-side lazy loader + selection→proposal glue

package.json (root)              # MODIFY — prebuild: + fetch-langtags + codegen-langtags; add npm scripts
```

**Structure Decision**: Engine-owned data foundation (`scripts/` + `packages/engine`), additive shared
types in `packages/contracts`, and studio survey wiring in `packages/studio`. The slim index is a
checked-in codegen artifact in the engine, lazy-loaded by the studio — keeping the raw dataset out of
the client bundle while giving the engine a typed lookup API that specs/002 can later consume.

## Complexity Tracking

> No Constitution violations — section intentionally empty.
