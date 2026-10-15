# Data model: spec 102

This feature adds no persisted state. Every entity below is derived at preview or output time from state that already exists: the `authoring-track` decision, `DecisionRecord.instantiationMode`, the working-copy IR, the parsed touch layout, the inherited docs text and `HelpDocsAnswers`.

## Unchanged inputs

| Input | Where | Role here |
|---|---|---|
| `instantiationMode` | `packages/contracts/src/decisionRecord.ts` | `"new-from-base"` is Copy (Track 1). `"adapt-existing"` is Adapt (Track 2). Both literals are persisted and are not renamed (R1, R2). |
| `OutputVersionMode` | `packages/engine/src/output/output-version.ts` | Keeps its two literals, which mirror `instantiationMode`. |
| `HelpDocsAnswers` | `packages/contracts/src/help-docs.ts` | Unchanged contract. Every field keeps its meaning and reaches the forms through author-answer slots (FR-031, SC-007). |
| Working-copy IR | studio store | Source of all derived content (FR-012). |

## 1. Resolved version

The one version a download, submission or test build ships at. It is computed by `resolvePublishVersion` and `resolveTestBuildVersion`. It is never stored.

**Inputs**: `mode: OutputVersionMode`, `rawVersion` (the start keyboard's `&KEYBOARDVERSION`), `hasTestBuilds` or `buildNumber`.

**Publish rules** (`resolvePublishVersion`):

| Mode | Rule |
|---|---|
| `new-from-base` | Always `"1.0"`. `rawVersion` is ignored, including when it is missing or invalid (FR-004). |
| `adapt-existing` | Unchanged from today (FR-007). |

**Test-build rules** (`resolveTestBuildVersion`):

| Mode | Rule |
|---|---|
| `new-from-base` | Computed against P = `1.0`, so build N is always `0.N`. It never returns `versionUnsupported`, even for an invalid `rawVersion` (FR-008). |
| `adapt-existing` | Unchanged from today. |

**Validation rules**:

- Test-build versions sort strictly below the publish version (FR-008).
- The resolved version is written to four places, and all four must match (FR-009, SC-002). They are `&KEYBOARDVERSION`, the `.kps` `<Version>`, the download file name and the newest HISTORY heading.
- The project file's format version is not touched (FR-009).

**Writers** (R3):

- `serializeWorkingCopy` always sets `identityForProjection.version` to the resolved version on both tracks. Today the copy path sets it only for a test build.
- The copy-version preservation step in `projectWorkingCopyVfs.ts` is removed. The overlay version is then the single source.

**State transition**: the resolved version is a pure function of the current track answer. If the author switches Copy and Adapt, the next preview or output follows the new answer, and nothing from the old one remains.

## 2. History lineage

The `RenderHistoryMdOptions.adaptedFrom` option of `renderHistoryMd` is replaced by `lineage` (R4).

```ts
type HistoryLineage =
  | { kind: "created"; id: string; version: string }
  | { kind: "adapted"; id: string; version: string }
  | null;
```

| Field | Meaning |
|---|---|
| `kind` | `"created"` on Copy, `"adapted"` on Adapt. |
| `id` | The start keyboard's id. |
| `version` | The start keyboard's raw version, not the resolved one. |

**Bullet text**:

- `created` renders through a new `createdFromBullet`: `Created from <id> v<version> via keyboard-studio.` (FR-011).
- `adapted` renders through the existing `adaptedFromBullet`, unchanged.

**Rules**:

- The serializer passes `created` on Track 1 and `adapted` on Track 2.
- The bullet is injected at render time. It is skipped when the stored bullets already contain it verbatim (existing dedupe).
- `buildHistoryProposal` keeps only the Track 2 attribution. It gains no Copy line.

## 3. DocForms (data file)

Content-owned forms and mechanism paragraphs, held in `packages/contracts/data/doc-forms.json` (R8). The type, zod schema and loader live in `packages/contracts/src/docForms.ts`, loaded the way `axisPriors.ts` loads `AXIS_PRIORS`.

```ts
type DocFormId =
  | "body" | "readmeMd" | "readmeHtm" | "welcome"
  | "help" | "history" | "license";

type DocMechanismId = "deadkeys" | "rightAlt" | "repeatToCycle" | "combiningOrder";

interface DocForms {
  forms: Record<DocFormId, string[]>;       // lines, joined with "\n" at load
  mechanisms: Record<DocMechanismId, string>; // one paragraph per mechanism
}
```

| Form id | File produced | Notes |
|---|---|---|
| `body` | none directly | Shared body for `welcome` and `help` (FR-025). |
| `readmeMd` | `README.md` | Description, links, platforms. No typing guide (FR-029). |
| `readmeHtm` | `source/readme.htm` | Description and a pointer to the help page (FR-029). |
| `welcome` | `source/welcome/welcome.htm` | Wraps `body` and the layout section. |
| `help` | `source/help/<id>.php` | Help-site header and fragment-only shape, wrapping `body` (spec 080 Decision B). |
| `history` | `HISTORY.md` | Only form that may reference `{{version}}`. |
| `license` | `LICENSE.md` | Only form that may reference `{{year}}`. |

**Validation rules** (zod at load, plus `docForms.test.ts`):

- Every `DocFormId` and every `DocMechanismId` key is present, and no other key is.
- Each form parses with `parseDocForm`. An unbalanced block or a nested block of the same id is an error naming the form (FR-028).
- Every slot a form references is in `DOC_SLOT_IDS`. An unknown slot fails the test and names the form and slot (FR-028).
- `{{version}}` appears only in `history`. `{{year}}` appears only in `license` (FR-026).
- `{{copyrightHolder}}` is the only source of a holder name in any form (FR-026).

**Ownership**: content owns the wording, headings, order and mechanism paragraphs. Engine owns the schema and the loader (Art. VI).

## 4. Form syntax

A form is plain text with two constructs and nothing else (FR-023).

| Construct | Behaviour |
|---|---|
| `{{id}}` | Replaced by the slot's value. An absent slot inserts nothing. |
| `{{#id}}…{{/id}}` | Kept only when slot `id` is non-empty. Otherwise the block and its trailing newline are dropped, heading included (FR-024). |

`renderDocForm(form, slots)` renders. `parseDocForm(form)` returns the referenced slot ids or throws. Both live in `packages/engine/src/shared/renderDocForm.ts`.

## 5. DocSlotModel and DOC_SLOT_IDS

The full set of named values a form can use. The exact slot ids are pinned in [contracts/engine-api.md](contracts/engine-api.md) (`DocSlotModel`); this section gives their sources. A slot value is a string, already escaped for the target file type. An empty string counts as empty for `{{#id}}` blocks.

| Group | Slots | Source |
|---|---|---|
| Identity | `displayName`, `keyboardId`, `languages`, `platforms`, `copyrightHolder`, `year`, `docLang`, `helpPageUrl`, `helpHeader` | Identity overlay, the projected `&TARGETS`, `HelpDocsAnswers.docLanguageTags`, `helpSiteHeader`. One `copyrightHolder` feeds every file (FR-026). `year` is used by `license` only. |
| Derived | `typingGuide`, `mechanisms`, `layoutPictures`, `touchNotes`, `characterInventory` | `DocContent.slots` (section 6); `layoutPictures` from `renderWelcomeLayoutSection`, unchanged (FR-016). |
| Author answers | `description`, `usageTips`, `credits`, `contactInfo`, `projectHomeUrl`, `projectHelpUrl`, `additionalDetail` | `HelpDocsAnswers`, meanings unchanged (FR-031). `additionalDetail` is the opt-in battery in its existing order. With no answers, `description` falls back to a sentence built from identity slots (FR-030). |
| Inherited | `inheritedProse` | Track 2 only: the start keyboard's welcome or help prose, after stripping (section 7). Empty on Copy (FR-032). |
| History | `version`, `date`, `historyEntries`, `lineage`, `inheritedHistory` | `history` form only. `version` is the resolved version (section 1); `lineage` is the HistoryLineage bullet; `inheritedHistory` is the start keyboard's HISTORY text on Track 2. |
| Composition | `body` | The rendered `body` form, passed into `welcome` and `help`. |

### Escaping

Values are escaped before they reach the renderer (FR-027).

- `.htm` and `.php` forms get `escapeHtml`.
- `.md` forms get a minimal Markdown escaper.
- `inheritedProse`, `layoutPictures` and `body` are already markup, so they pass through as-is.

## 6. DocContent

The output of `buildDocContent` in `packages/studio/src/lib/docContent.ts`. It is pure and synchronous, so it runs inside the existing preview derivation with no timer (FR-021, D3).

**Input**:

```ts
interface DocContentInput {
  ir: KeyboardIR;
  touchLayout: TouchLayoutIR | null;
  inheritedProse: string | null; // Track 2 only
}
```

**Output**:

```ts
interface DocContent {
  slots: GeneratedDocSlots;     // typingGuide, mechanisms, touchNotes, characterInventory
  typingGuideSuppressed: boolean;
}
```

The exact shape is pinned in [contracts/studio.md](contracts/studio.md). An empty slot string drops its section.

### Field rules

**`typingGuide`** (FR-013, FR-014, R6):

- Rows are every character in `buildProducedSet(ir)` outside printable ASCII U+0020 to U+007E.
- For each character, the `charProducers(ir, ch)` producer with the fewest `steps` wins. A producer with only a `triggerFloor` counts as one step. Ties go to the joined label in code-point order.
- Rows are sorted by code point.
- Each row shows the character, its `getName` name or `U+XXXX`, and the keystroke labels.
- Above 200 rows, the guide becomes a summary: counts per character group plus a pointer to the layout charts.

**`mechanisms`** (FR-015, R7): one paragraph per detected mechanism, in this fixed order.

| Order | Mechanism id | Detected when |
|---|---|---|
| 1 | `deadkeys` | Any rule context contains a `deadkey` element. |
| 2 | `rightAlt` | Any rule has `ruleModifier(rule)` equal to `"ralt"`. |
| 3 | `repeatToCycle` | A rule's context is a produced character followed by a key that also produces that character directly. |
| 4 | `combiningOrder` | The keyboard produces a character whose `getCategory` is `Mn` or `Mc`. |

An undetected mechanism gets no paragraph.

**`touchNotes`** (FR-017): the long-press and flick characters of the touch layout. Empty when `touchLayout` is `null`, which drops the section and its heading.

**`characterInventory`** (FR-018): every produced character, grouped as letters, marks, punctuation and symbols, and digits by `getCategory`.

**`typingGuideSuppressed`** (FR-034, R11):

- It is computed only when `inheritedProse` is non-null.
- Each `<table>`, `<ul>`, `<ol>`, Markdown table and Markdown list in the prose is scanned for characters.
- If any one of them holds at least 50 % of the guide's characters, `typingGuide` is `""` and the flag is `true`.
- When the flag is set, `DocumentationChecklist` shows message id `output.docs.checklist.typingGuideSuppressed` (FR-035).

### Invariants

- Every character display follows spec 056 (FR-019). Combining marks sit on U+25CC. Every character carries its Unicode name or `U+XXXX`.
- The same input gives byte-identical output (FR-020). No step depends on map iteration order or locale.

## 7. Generated block (Track 2)

On Adapt, the generated sections follow the inherited prose inside a marked block (FR-033, R10).

| Marker | Text |
|---|---|
| start | `<!-- ks:generated:start -->` |
| end | `<!-- ks:generated:end -->` |

The marker constants live in `docSlots.ts`.

**Lifecycle of `inheritedProse`**:

1. The pristine fetched start-keyboard text is read.
2. Any existing `ks:generated` block is removed.
3. Any legacy `<!-- Keyboard Studio additions -->` tail is removed.
4. The result fills the `inheritedProse` slot.
5. The form appends one new marked block.

Rendering twice gives exactly one block (SC-005). Copy has no inherited prose and gets no markers.

## Relationships

```text
authoring-track decision
  └─ instantiationMode ──► OutputVersionMode ──► Resolved version ──► version slot
                       └─► HistoryLineage.kind ──► lineage slot
working-copy IR + touch layout + inheritedProse
  └─ buildDocContent ──► DocContent ──► derived slots
HelpDocsAnswers ──► author-answer slots
DocSlotModel + DocForms.forms[id] ──► renderDocForm ──► the six files
```
