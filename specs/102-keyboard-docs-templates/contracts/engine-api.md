# Contract: engine API (spec 102)

All symbols are exported from `@keyboard-studio/engine` (`packages/engine/src/index.ts`). "Unchanged" means the signature and behaviour stay as they are today.

## Version resolution (`output/output-version.ts`)

Signatures are unchanged. Only the `"new-from-base"` (Copy, Track 1) branch changes.

```ts
export type OutputVersionMode = "new-from-base" | "adapt-existing"; // literals kept

export function resolvePublishVersion(input: {
  mode: OutputVersionMode;
  rawVersion: string;
  hasTestBuilds: boolean;
}): string;

export type TestBuildVersionResult =
  | { ok: true; version: string }
  | { ok: false; reason: "versionUnsupported" };

export function resolveTestBuildVersion(input: {
  mode: OutputVersionMode;
  rawVersion: string;
  buildNumber: number; // integer >= 1, else RangeError (unchanged)
}): TestBuildVersionResult;
```

| mode | `resolvePublishVersion` | `resolveTestBuildVersion` (build N) |
|---|---|---|
| `"new-from-base"` | always `"1.0"`, whatever `rawVersion` is (valid, invalid or empty) | always `{ ok: true, version: "0.N" }`, computed against P = 1.0; `rawVersion` is ignored |
| `"adapt-existing"` | unchanged | unchanged |

Callers (`serializeWorkingCopy`, the `flowStepOptions` history proposal, `useDocumentationFindings`, `usePreviewArtifact`) keep their calls. The resolved version reaches `&KEYBOARDVERSION`, the `.kps` `<Version>`, the download file name and the newest HISTORY heading (FR-009). The `.kps` file format version is not touched.

## History (`shared/renderHistoryMd.ts`)

```ts
export const HISTORY_INITIAL_RELEASE_BULLET = "Initial release."; // unchanged

/** Unchanged text: "Adapted from <id> v<version> via keyboard-studio." */
export function adaptedFromBullet(id: string, version: string): string;

/** NEW. Exact text: "Created from <id> v<version> via keyboard-studio." */
export function createdFromBullet(id: string, version: string): string;

export function splitHistoryPreamble(text: string): { preamble: string; rest: string }; // unchanged

export interface HistoryLineage {
  kind: "created" | "adapted";
  id: string;      // start keyboard id
  version: string; // start keyboard's raw version
}

export interface RenderHistoryMdOptions {
  version: string;
  dateIso: string;
  /** Replaces `adaptedFrom`. "created" on Track 1, "adapted" on Track 2, null for none. */
  lineage: HistoryLineage | null;
  startHistoryText: string | null;
}

export function renderHistoryMd(
  entry: HistoryEntryState | null,
  opts: RenderHistoryMdOptions,
): string;
```

- Removed: `RenderHistoryMdOptions.adaptedFrom: { id: string; version: string } | null`. `{ kind: "adapted", id, version }` produces exactly what `adaptedFrom` produced (FR-007).
- The lineage bullet is injected first in the newest entry, for both kinds and for undecided and decided entries alike, unless the bullets already contain it verbatim (existing dedupe).
- With `lineage.kind === "created"` and no decided entry, the newest entry's bullets are the created-from bullet, then `"Initial release."`.
- `buildHistoryProposal` keeps the Track 2 attribution only; the Copy line is injected at render.
- The file text is produced through the `history` form (see [doc-forms.md](doc-forms.md)).

## Form renderer (`shared/renderDocForm.ts`, NEW)

```ts
/** Renders `{{id}}` and `{{#id}}...{{/id}}` only. Values are inserted as given (already escaped). */
export function renderDocForm(form: string, slots: Partial<DocSlotModel>): string;

/** Returns the slot ids `form` references; throws DocFormParseError on an unbalanced block or unknown construct. */
export function parseDocForm(form: string): string[];

export class DocFormParseError extends Error {
  readonly formId: string | undefined; // set by callers that know the form
  readonly problem: string;            // e.g. "unbalanced block {{#usageTips}}"
}
```

- `{{id}}`: replaced by `slots[id]`; an absent slot renders as `""`.
- `{{#id}}...{{/id}}`: kept (markers removed) when `slots[id]` is non-empty after trim; otherwise dropped together with the newline that follows `{{/id}}` (FR-024).
- No loops, no value conditions, no expressions (FR-023).
- Deterministic: the same `form` and `slots` give the same string (FR-020).

## Slot vocabulary (`shared/docSlots.ts`, NEW)

```ts
export type DocSlotId = keyof DocSlotModel;
export const DOC_SLOT_IDS: readonly DocSlotId[];

export interface DocSlotModel {
  // identity
  displayName: string;
  keyboardId: string;
  languages: string;
  platforms: string;
  copyrightHolder: string; // one source for every file (FR-026)
  year: string;            // license form only
  docLang: string;
  helpPageUrl: string;
  helpHeader: string;      // helpSiteHeader(displayName), help form only
  // history
  version: string;         // history form only
  date: string;
  historyEntries: string;
  lineage: string;
  inheritedHistory: string; // start keyboard's HISTORY entries, Track 2 only
  // author answers (HelpDocsAnswers, meanings unchanged, FR-031)
  description: string;
  usageTips: string;
  credits: string;
  contactInfo: string;
  projectHomeUrl: string;
  projectHelpUrl: string;
  additionalDetail: string; // the opt-in battery, in its existing order
  // inherited (Track 2 only)
  inheritedProse: string;
  // composition: the rendered body form, passed into welcome and help (the only composition)
  body: string;
  // derived (studio buildDocContent)
  typingGuide: string;
  mechanisms: string;
  layoutPictures: string;
  touchNotes: string;
  characterInventory: string;
}

export const DOC_GENERATED_START = "<!-- ks:generated:start -->";
export const DOC_GENERATED_END = "<!-- ks:generated:end -->";

/** Removes every DOC_GENERATED_START..DOC_GENERATED_END block and any legacy
 *  "<!-- Keyboard Studio additions -->" tail from inherited prose. */
export function stripGeneratedBlocks(inheritedProse: string): string;

export function escapeDocHtml(value: string): string;     // .htm / .php forms (wraps escapeHtml)
export function escapeDocMarkdown(value: string): string; // minimal Markdown escaper, .md forms
```

- These slot ids are the initial vocabulary. Adding a slot is non-breaking; renaming or removing one breaks `doc-forms.json`.
- Values reach `renderDocForm` already escaped for the target file (FR-027).
- The markers wrap the generated sections only when there is inherited prose (Track 2). Copy output carries no markers (FR-033).

## Help docs (`shared/helpDocsRender.ts`)

Exports kept. Signatures unchanged except that the input gains `generated`:

```ts
export { helpSiteHeader, helpSitePageName, helpPhpStub } from "./packageDocs.js";

export interface DocSection { heading: string; body: string }

export type GeneratedDocSlots = Pick<
  DocSlotModel,
  "typingGuide" | "mechanisms" | "layoutPictures" | "touchNotes" | "characterInventory"
>;

export interface HelpDocsRenderInput {
  answers: HelpDocsAnswers | null;
  displayName: string;
  primaryBcp47?: string;
  platforms: string[];
  /** NEW. Derived slots from the studio's buildDocContent; absent means none. */
  generated?: GeneratedDocSlots;
}

export function buildDocSections(answers: HelpDocsAnswers | null): DocSection[];
export function renderWelcomeLayoutSection(welcomeImageFiles: readonly string[]): string;
export function extractWelcomeImageRefs(welcomeHtml: string): string[];
export function renderReadmeMd(input: HelpDocsRenderInput, startReadmeMdText?: string | null): string;
export function renderReadmeHtm(input: HelpDocsRenderInput): string;
export function renderWelcomeHtm(
  input: HelpDocsRenderInput,
  startWelcomeHtmText: string | null,
  welcomeImageFiles?: readonly string[],
): string;
export function renderHelpPhp(
  input: HelpDocsRenderInput,
  startHelpPhpText: string | null,
  startWelcomeHtmText?: string | null,
): string;
```

- `renderWelcomeHtm` and `renderHelpPhp` render the shared `body` form, so their bodies are identical (FR-025). `renderHelpPhp` keeps the `helpSiteHeader` prefix and the fragment-only shape.
- `renderReadmeMd` never inserts `typingGuide` (FR-029).
- `licenseMd(holder: string | null, year: number): string` in `shared/packageDocs.ts` keeps its signature and renders through the `license` form.
