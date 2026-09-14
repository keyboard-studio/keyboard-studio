# Contract: Engine documentation APIs (spec 076)

New/changed exports of `@keyboard-studio/engine`. All functions are pure and
deterministic unless noted. Types referenced are defined in
[../data-model.md](../data-model.md).

## `renderLayoutCharts` (new module `engine/src/layout-chart/`)

```ts
function renderLayoutCharts(input: LayoutChartInput): LayoutChartFile[];
function layoutChartFilename(platform: LayoutChartFile["platform"], layerId: string): string;
```

Guarantees:
- **Deterministic** (FR-014): same input → byte-identical `svg` strings. No
  timestamps, no randomness, fixed number formatting, model-order iteration.
- One entry per (platform, layer) in the model; none for absent platforms.
- Legibility (FR-016): combining marks on U+25CC carrier; unknown-glyph heuristic
  renders `U+XXXX`; output-less keys visually distinct.
- `layoutChartFilename` emits `ks-layout-<platform>-<sanitizedLayer>.svg`; the
  `ks-layout-` prefix is reserved (FR-015 collision guarantee).

## `extractWelcomeImageRefs` (new, `engine/src/shared/helpDocsRender.ts`)

```ts
function extractWelcomeImageRefs(welcomeHtml: string): string[];
```

Pure: returns the distinct relative `<img src>` targets of a welcome page (no scheme, no
leading slash), in document order. Used by the projection to compute
`missingInheritedImages` (spec edge case: base page references images the base does not
ship) and by the classifier's layout-section strip.

## `deriveDocMemberStates` (new, `engine/src/shared/`)

```ts
interface DeriveDocMemberStatesInput {
  instantiationMode: "new-from-base" | "adapt-existing" | null;
  helpDocs: HelpDocsAnswers | null;
  historyEntryState: HistoryEntryState | null;
  base: {
    welcomeHtmText: string | null;
    helpPhpText: string | null;
    readmeMdText: string | null;
    historyMdText: string | null;
    hasWelcomeImages: boolean;
  };
  keyboardId: string;
  missingInheritedImages: string[];
}
function deriveDocMemberStates(input: DeriveDocMemberStatesInput): DocMemberState[];
```

Guarantees: exactly six entries; FR-005 tier priority; Track 1 never reports
`inherited` for prose members (FR-007); `history-md.placeholder` true iff the stub
would ship (FR-011).

## `buildHistoryProposal` (new, `engine/src/decision-audit/` adjacent)

```ts
interface HistoryProposalSeed {
  base: { id: string; version: string } | null;   // adaptation attribution
  charactersAdded: string[];
  mechanismsAssigned: string[];                    // human-readable mechanism names
  keysRemoved: number;
}
function buildHistoryProposal(
  seed: HistoryProposalSeed, version: string, dateIso: string
): HistoryProposal;
```

Guarantees: heading `## <version> (<dateIso>)`; bullets satisfy criteria 3.5 format;
adaptation seeds always yield the "Adapted from" bullet (FR-012 / criterion 19.2).

## `renderHistoryMd` (new, `engine/src/shared/` or `output/`)

```ts
function renderHistoryMd(
  entry: HistoryEntryState | null,
  opts: { version: string; dateIso: string; adaptedFrom: { id: string; version: string } | null;
          baseHistoryText: string | null }
): string;
```

Guarantees: confirmed/edited entries render at top; base history preserved verbatim
below (criterion 3.4); dismissed/null renders the existing stub unchanged; the
"Adapted from" bullet is injected on adaptations regardless of author edits.

## `classifyBaseDocumentation` (new, `engine/src/base-browser/` or `loader/`)

```ts
function classifyBaseDocumentation(
  kpsFiles: KpsFileEntry[],
  welcomeText: string | null,
  helpText: string | null
): BaseDocumentationProfile;
```

Guarantees: folder convention wins over flat (edge case); `full` ⇔ usable description
per the spec's threshold (≥1 non-placeholder, non-layout paragraph after header/layout
strip); never throws on malformed input — degrades to `unknown`/`minimal`.

## `fetchKeyboardSourceToVfs` (changed, `engine/src/loader/`)

Result gains `baseReadmeMdText?`, `baseHistoryMdText?`, `baseWelcomeImages?`,
`baseWelcomeConvention?` (data-model §6). Welcome resolution order: `.kps`-named →
`source/welcome/welcome.htm` → `source/welcome.htm`. Fetches remain
**fetch-don't-write** (nothing lands in the VFS); missing files are non-fatal.

## Descriptor (changed, `engine/src/package-descriptor/`)

- `buildKpsContent`: `<Files>` lists `welcome\welcome.htm` plus every welcome-folder
  file passed in a new `welcomeFolderFiles: string[]` input; `<Options><WelcomeFile>`
  = `welcome\welcome.htm`.
- `applyIdentityToKps`: gains the welcome-path migration — rewrites a flat
  `welcome.htm` `<Files>`/`<Options>` reference to the folder form and appends
  missing welcome-folder file entries. This is the sole sanctioned exception to its
  "don't touch `<Options>`/`<Files>`" rule; every rewrite is reported in `warnings`.

## Projection contract (studio `serializeWorkingCopy.ts` step 5c — behavior, not export)

- Writes `source/welcome/welcome.htm` (never flat; FR-002).
- Writes inherited base images and/or generated charts into `source/welcome/`
  according to `ChartPreference` and FR-015.
- Writes `renderHistoryMd` output to `HISTORY.md`.
- Help page: fresh pages get the standard header (see
  [help-header.md](help-header.md)); inherited pages keep theirs (FR-003).
- All writes unconditional per production (spec 061 FR-010 / FR-023).
