# Implementation Plan: README template driven by authoring choices

**Branch**: `km/readme-template` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/110-readme-template/spec.md`

## Summary

The studio builds one structured **`ReadmeFacts`** value per output production, from the working-copy IR, the touch layout, the decisions and the working copy. It passes that value to the engine on `HelpDocsRenderInput.readme`. The engine renders both `README.md` (full template) and `source/readme.htm` (brief page) from those facts, so the two files cannot disagree (FR-010). Facts are plain text, and each renderer escapes for its own format.

On Track 2 the README is regenerated, not appended to the inherited one. The description falls back to the starting point's `.kps` description, and then to the original README's description.

## Technical Context

**Language/Version**: TypeScript 5 (ESM), Node ≥ 22.19
**Primary Dependencies**: none new. The facts reuse `charProducers` and `displayChar` (studio `irToCarveNodes.ts`), `buildProducedSet` (engine), `getCategory` (contracts unicode), langtags (`getLanguageDefaults`) and `SCRIPT_DISPLAY_NAME`.
**Storage**: none (output projection only)
**Testing**: vitest, run through the package configs (`pnpm --filter @keyboard-studio/engine test`, `pnpm --filter @keyboard-studio/studio test`)
**Target Platform**: browser SPA plus engine library
**Project Type**: monorepo library plus SPA
**Performance Goals**: synchronous and deterministic. The work is the same order as `buildDocContent`, which already runs on every preview.
**Constraints**: output projection only. There is no new debounce timer (D3 untouched) and no host-disk writes.

## Constitution Check

- **I. Pattern schema** — untouched. PASS.
- **II. IR is the spine** — characters and keystrokes are derived from the working IR, the same source `buildDocContent` uses. PASS.
- **III. Decisions as live truth** — use-case, autonym, layout family and touch seed are read from the decision store at projection time. Nothing is cached. PASS.
- **V. VirtualFS only** — output is written into the cloned VFS in `projectWorkingCopyForOutput`. PASS.
- **VI. Team boundaries** — Content owns the new form wording in `doc-forms.json`, the use-case phrases and the design-note phrasing. Engine owns the facts, the renderers and the wiring. PASS. The wording is flagged for Content review in the PR.
- **IX. No survey surface outside the registry** — no new questions are added. PASS.
- **X. Defaults are proposals** — no silent decision. The README only reports recorded answers and IR facts. PASS.
- **XI. Done means integrated** — wired into both the output projection and the live docs preview (FR-012). PASS.
- **Precedence** — spec 102 FR-029 / User Story 4 and spec 080 FR-006 are amended for README.md by this spec. That amendment is recorded in spec 102 and spec 080 with a pointer here (task T020). PASS once recorded.

## Personal Data Check (Constitution Article XII, spec 100)

*Personal data: none — no new store, recipient, category, or telemetry.*

## Project Structure

### Documentation (this feature)

```text
specs/110-readme-template/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/contracts/data/doc-forms.json                     # readmeMd / readmeHtm forms rewritten (Content wording)
packages/engine/src/shared/readmeFacts.ts                  # NEW: ReadmeFacts type, description extraction helper
packages/engine/src/shared/helpDocsRender.ts               # HelpDocsRenderInput.readme; renderReadmeMd/Htm render facts
packages/engine/src/shared/helpDocsRender.test.ts          # README/readme.htm render tests
packages/engine/src/index.ts                               # export ReadmeFacts types
packages/studio/src/lib/readmeFacts.ts                     # NEW: buildReadmeFacts(input) — pure
packages/studio/src/lib/readmeFacts.test.ts                # NEW
packages/studio/src/lib/readmeFactsInput.ts                # NEW: gathers decisions + working copy → input (shared by projection & preview)
packages/studio/src/lib/serializeWorkingCopy.ts            # pass facts; Track 2 regenerates
packages/studio/src/hooks/useDocsPreview.ts                # pass facts; same Track 2 rule
packages/engine/src/shared/packageDocs.ts                  # retire dead readmeMd/readmeHtm only if unused elsewhere
specs/102-keyboard-docs-templates/spec.md, specs/080-.../AS-BUILT.md   # amendment notes
```

**Structure Decision**: The facts are built in the studio, because they need the decision store, the working copy and the studio-only `charProducers`. Rendering stays in the engine next to the other doc renderers, so the README and readme.htm share one renderer module.

## Complexity Tracking

No violations.
