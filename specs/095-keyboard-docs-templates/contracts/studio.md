# Contract: studio (spec 095)

## Derived content (`packages/studio/src/lib/docContent.ts`, NEW)

```ts
import type { KeyboardIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import type { GeneratedDocSlots } from "@keyboard-studio/engine";

export interface DocContentInput {
  ir: KeyboardIR;                    // the working-copy IR
  touchLayout: TouchLayoutIR | null; // null: no phone/tablet layout
  inheritedProse: string | null;     // Track 2 welcome/help prose; null on Track 1
}

export interface DocContent {
  slots: GeneratedDocSlots;          // already escaped for the .htm/.php forms
  typingGuideSuppressed: boolean;    // true when slots.typingGuide was emptied (FR-034)
}

export const TYPING_GUIDE_SUMMARY_THRESHOLD = 200;

export function buildDocContent(input: DocContentInput): DocContent;
```

- Pure and synchronous: no timer, no compile (FR-021, D3). `serializeWorkingCopy` and `useDocsPreview` call it with the same input.
- Deterministic: the same input gives the same `DocContent` (FR-020).
- `typingGuide`: produced characters outside U+0020..U+007E, ordered by code point, each with the fewest-step `charProducers` path (ties broken by joined label). Above `TYPING_GUIDE_SUMMARY_THRESHOLD` rows it becomes a grouped summary pointing at the layout pictures.
- `mechanisms`: paragraphs from `DOC_FORMS.mechanisms`, fixed order, detected mechanisms only.
- `touchNotes`: `""` when `touchLayout` is null, so the section and its heading are absent.
- Every character: combining marks on U+25CC, named by Unicode name, `U+XXXX` when unnamed (FR-019).
- `typingGuideSuppressed` is true when one table or list in `inheritedProse` holds at least 50 % of the guide's characters. The other slots are unaffected.

## UI identifier

| Kind | Identifier | English text |
|---|---|---|
| i18n message id | `output.docs.checklist.typingGuideSuppressed` | Typing guide not generated: the original docs already include one. |

`DocumentationChecklist` (Output step) shows it when `typingGuideSuppressed` is true. The id is added to `packages/studio/src/locales/*` per spec 046.

## Track mapping

No new decision or persisted field. `DecisionRecord.instantiationMode`, derived from the `authoring-track` decision, selects the behaviour:

| `instantiationMode` | Track | Version | History lineage | Inherited prose |
|---|---|---|---|---|
| `"new-from-base"` | 1, Copy | `"1.0"`; test build N is `"0.N"` | `{ kind: "created", id, version }` | none |
| `"adapt-existing"` | 2, Adapt | unchanged | `{ kind: "adapted", id, version }` | original welcome/help prose, then the marked generated block |
