# Research: spec 110

## R1. Where the facts are built

- **Decision**: in the studio, with a pure `buildReadmeFacts(input)`. A thin gatherer reads the decision store and the working copy, and both the projection and the preview call it.
- **Rationale**:
  - The keystroke labels come from `charProducers`, which is studio-only (`irToCarveNodes.ts`). That is the same source the welcome page's typing guide uses, so the README never contradicts it.
  - The decisions live in studio stores.
- **Alternatives**:
  - Building the facts in the engine would mean moving `charProducers` across packages. That is too large a change for this feature.
  - Parsing the HTML `GeneratedDocSlots` back into rows is fragile.

## R2. One facts value, two renderers

- **Decision**: `ReadmeFacts` holds plain text only. `renderReadmeMd` escapes it with `escapeDocMarkdown`, and `renderReadmeHtm` escapes it with `escapeDocHtml`.
- **Rationale**: this meets FR-010. The two files differ in which facts they show, never in their values.

## R3. Typing method per row, and the cap of 8

- **Decision**: each produced character outside printable ASCII gets its shortest producer, the same rule as `shortestKeys`. The row's method is:
  - **rightAlt** when a step contains "AltGr";
  - **sequence** when there is more than one step;
  - **direct** otherwise.

  Touch long-press and flick rows come from the touch layout, method **touch**.

  Rows are picked in two passes. The first pass takes one row per method present, in the order rightAlt, sequence, touch, direct. The second pass fills up to 8 in code-point order. `omitted` is set when any row was left out.
- **Literal-trigger rows**: these come from the first step of every sequence row whose step is a single character key. When `charProducers(ir, thatChar)` finds a producer whose steps are more than that one key, the row is that producer. Rows are deduplicated and do not count toward the cap.

## R4. Composition

- **Decision**: classify the produced characters outside ASCII.
  - If any character is a combining mark (Mn or Mc), or any produced string is longer than one code point and contains a mark, the output counts as **decomposed**.
  - If any character is precomposed (its NFD form differs from the character itself), the output counts as **precomposed**.
  - When both kinds are present the result is **mixed**. When neither is present, the sentence is omitted.

## R5. Font note

- **Decision**: when `answers.fontGuidance` is non-blank, the note uses that text. Otherwise the generic note appears when any produced character falls outside Latin-1 (cp > U+00FF). Latin-1 is the practical "basic Latin" that common system fonts cover.

## R6. Track 2 description fallback

The description is the first non-blank of:

1. `answers.description`;
2. the starting point's `.kps` `<Description>`, read from `startVfs` (`source/<id>.kps`) with the existing kps parser;
3. the inherited README's description block.

For the third source, extraction is in the engine (`extractReadmeDescription`). It handles:

- a setext or ATX "Description" heading, taking the text up to the next heading;
- the `__DESCRIPTION__` marker style;
- otherwise, the first paragraph after the title.

## R7. Track 2 replacement

- **Decision**: `renderReadmeMd` no longer appends to `startReadmeMdText`. The parameter is replaced by a `fallbackDescription` field on the facts. Inherited README prose is dropped, which is the FR-006 amendment.

## R8. Design notes sources

- **Starting point**: `startKeyboard.displayName` and `startKeyboard.version`.
  - Track 1 renders "Started from {name} {version}".
  - Track 2 renders "Adapted from the released {version}".
- **Typing methods by group**: rows grouped by character group, with the methods used for each. For example: "Letters: Right Alt, key sequences".
- **Marks**: the `mark-input-order` decision and the `fallbackPolicy` setting.
- **Touch layout**: the `touch-seed-source` decision.
  - `reseed-from-desktop` renders "generated from the desktop layout".
  - `import-adapt` renders "adapted from {copied keyboard}".
- **Removed characters**: `carveChars.size`.
- **Rationale**: `answers.designRationale`.
- **Cap**: at most 6 bullets, in the order above.
