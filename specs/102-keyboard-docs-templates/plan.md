# Implementation Plan: Keyboard documentation templates and version policy

**Branch**: `095-keyboard-docs-templates` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)
**Input**: the spec as amended by the 2026-10-14 clarification (no new question; the existing track answer drives version and docs).

## Summary

Three changes, one per story group.

1. **Version (US1).** A Copy (Track 1) keyboard ships at 1.0 instead of the copied keyboard's version. The fix lives in `resolvePublishVersion` / `resolveTestBuildVersion`. Its callers pick that up without edits. Two places in the studio bypass the resolver on the copy path, and both are rerouted through it. Track 2 is untouched. The history file gains a "Created from …" lineage line for Copy.
2. **Derived content (US2).** A new pure studio module, `docContent.ts`, derives the typing guide, mechanism paragraphs, phone/tablet notes and character inventory from the working-copy IR. It reuses the carve gallery's `charProducers` (keystroke paths) and the contracts Unicode table (names, categories). It is synchronous, so the docs preview stays a plain derivation (D3).
3. **Forms (US3, US4).** The six documentation files are rendered from content-owned forms in one data file, `packages/contracts/data/doc-forms.json`, by a two-construct renderer in the engine. `helpDocsRender.ts` and `renderHistoryMd.ts` keep their public exports and are reimplemented on top of the renderer. On Track 2, generated sections sit between start/end markers. Any marked block already in the inherited prose is stripped first, and the typing guide is suppressed when the inherited prose already has one.

## Project Structure

```text
packages/contracts/
  data/doc-forms.json                 NEW  forms + mechanism paragraphs (content-owned)
  src/docForms.ts                     NEW  DocFormId, DocForms type, zod schema, loader (mirrors axisPriors.ts)
  src/index.ts                        export docForms

packages/engine/src/
  output/output-version.ts            new-from-base publishes "1.0"; test builds computed against 1.0
  shared/renderDocForm.ts             NEW  {{slot}} / {{#slot}}…{{/slot}} renderer + parseDocForm (lint)
  shared/docSlots.ts                  NEW  DocSlotModel type, DOC_SLOT_IDS, escapers, generated-block markers
  shared/helpDocsRender.ts            reimplemented on renderDocForm; exports kept; input gains `generated`
  shared/renderHistoryMd.ts           `adaptedFrom` → `lineage` ({ kind: "created" | "adapted" })
  shared/packageDocs.ts               licenseMd via the LICENSE form
  index.ts                            export new symbols

packages/studio/src/
  lib/docContent.ts                   NEW  buildDocContent(ir, touchLayout, inheritedProse) → generated slots
  lib/serializeWorkingCopy.ts         copy path routes version through the resolver; passes docContent
  lib/projectWorkingCopyVfs.ts        drop the copy-path base-version preservation (around line 1016)
  hooks/useDocsPreview.ts             feeds docContent from the working-copy IR
  components/DocumentationChecklist.tsx  typing-guide-suppressed note (i18n id)
  locales/*                           new message id

docs/keyboard-documentation-plan.md   "what the tool gives you" section
```

**Structure Decision**: the derived-content builder lives in the studio, not the engine as the design note proposed. The keystroke derivation it needs (`charProducers`, `keySequenceLabel`, 2,600 lines in `lib/irToCarveNodes.ts`) is studio code, and the engine cannot import the studio. Every caller of the doc renderers (`serializeWorkingCopy`, `useDocsPreview`) is already in the studio. The engine keeps the pure renderer and the slot vocabulary.

## Call flow

```text
projectWorkingCopyForOutput (serializeWorkingCopy.ts)          useDocsPreview
  ├─ resolvePublishVersion({ mode, rawVersion, hasTestBuilds })   │
  │     copy → "1.0" | adapt → bumpKeyboardVersion (unchanged)    │
  ├─ identityForProjection.version = shippedVersion (both tracks) │
  ├─ buildDocContent(ir, touchLayout, inheritedProse) ◄───────────┤ same call, store IR
  │     charProducers / getName / getCategory                     │
  ├─ renderReadmeMd / renderReadmeHtm / renderWelcomeHtm / renderHelpPhp
  │     └─ renderDocForm(forms.<file>, slots)  ← doc-forms.json
  └─ renderHistoryMd(entry, { version, lineage })
        └─ renderDocForm(forms.history, …)
```

## Constitution Check

| Article | Assessment |
|---|---|
| I. Pattern schema locked | PASS. No `Pattern` change. The forms reuse the `{{slotId}}` placeholder syntax and don't redefine it. |
| II. KeyboardIR spine | PASS. Derived content reads the working-copy IR. Nothing parses `.kmn` text for it. |
| III. State model | PASS. No new decision or store slice. Version and docs read the existing `authoring-track` decision and the existing `instantiationMode`, so there is no 053/088 mapping to state. |
| IV. Validator layering / D3 | PASS. `buildDocContent` is synchronous and runs inside the existing memoised preview derivation. No timer. Layer C docs checks are unchanged and must stay green. |
| V. VirtualFS only | PASS. Output writes the same VFS paths as today. |
| VI. Team boundaries | PASS. Engine: resolver, renderer, studio wiring, derivation. Content: `doc-forms.json` wording, headings, order, mechanism paragraphs. |
| VII. Out of scope | PASS. One welcome page. The forms are English and author prose keeps its language. |
| VIII. House conventions | PASS. Commit titles follow the style. No issue numbers in code. |
| IX. Registry is the only survey surface | PASS. No survey content is added. |
| X. Defaults are proposals | PASS. Nothing is decided for the author. The version follows the answer they gave. Generated docs content is a derivation of their keyboard, not a decision. |
| XI. Done means integrated | PASS when the preview and all three output paths render through the forms. The E2E in Testing covers Copy at 1.0. |

No violations, so there is no Complexity Tracking section.

## Testing

- `output-version.test.ts`: the table is both tracks × one, two and three-part sources × with and without test builds × an invalid source. Copy always publishes 1.0 and test build N is 0.N. Adapt rows are unchanged.
- Package consistency (`serializeWorkingCopy.test.ts`): Copy from a 2.3 base gives 1.0 in `&KEYBOARDVERSION`, the `.kps` `<Version>`, the result `version` and the HISTORY heading. The same holds with a renamed and an unrenamed id.
- `renderDocForm.test.ts`: insertion, conditional block, an empty slot dropping its heading, and parse errors (unbalanced block, unknown slot) naming the form.
- `docForms.test.ts` (contracts): every form parses, every referenced slot is in `DOC_SLOT_IDS`, `{{version}}` appears only in `history` and `{{year}}` only in `license` (FR-026, FR-028).
- `docContent.test.ts`: fixtures for deadkey, right-Alt, rota, combining marks, touch with long-press and no touch. Checks one snapshot per slot, determinism (render twice), the 200-row summary switch and suppression at the ≥ 50 % overlap boundary.
- `helpDocsRender.test.ts` / `renderHistoryMd.test.ts`: existing snapshots stay green where content is unchanged. A second render over inherited prose that already carries a marked block gives exactly one block. `<` and `&` in answers stay escaped.
- The Layer C docs checks (13 codes) report zero form-attributable findings on the fixtures (SC-004).
- E2E: pick a keyboard at a version other than 1.0 and choose Copy. The Output step's version and the downloaded file name show 1.0.
