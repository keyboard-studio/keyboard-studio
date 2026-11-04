# Data model: spec 110

## ReadmeFacts (engine `shared/readmeFacts.ts`)

All strings are plain text and unescaped.

| Field | Type | Notes |
|---|---|---|
| `languages` | `{ name: string; tag: string; autonym?: string }[]` | primary first; the autonym appears only on the primary entry |
| `scriptName?` | `string` | English script name |
| `basedOn?` | `{ name: string; layoutFamily?: string }` | Track 1 only |
| `useCase?` | `string` | already phrased ("learning to read and write") |
| `characterGroups` | `{ label: string; chars: string[] }[]` | display form: a combining mark is shown on ◌ |
| `removed` | `string[]` | carved characters, display form |
| `composition?` | `"precomposed" \| "decomposed" \| "mixed"` | |
| `typingRows` | `{ keys: string; output: string }[]` | at most 8 |
| `literalRows` | `{ keys: string; output: string }[]` | not capped |
| `typingRowsOmitted` | `boolean` | |
| `needsFontNote` | `boolean` | the generic note, used when no author answer |
| `designNotes` | `string[]` | at most 6 |
| `fallbackDescription?` | `string` | Track 2 only |

Fields read from `HelpDocsRenderInput` and not duplicated in the facts:

- `displayName`
- `answers` (description, fontGuidance, usageTips, knownLimitations)
- link inputs
- `platforms`

## ReadmeFactsInput (studio `lib/readmeFacts.ts`, pure)

| Field | Source |
|---|---|
| `ir` | `workingIr ?? startIr` |
| `touchLayout` | `parseTouchLayoutOrNull(touchLayoutJson)` |
| `languageTags` | `identity.bcp47` plus extra language tags, or `startKeyboard.languages` |
| `languageName`, `autonym` | `identity.languageName`; decision `language-autonym` |
| `isAdaptation` | the projection's `isAdaptation` |
| `startKeyboard` | `{ displayName, version }` |
| `layoutFamily` | `getLayoutFamilyAnswer()` |
| `useCase` | decision `use-case` |
| `markInputOrder` | decision `mark-input-order` |
| `fallbackPolicy` | working copy |
| `touchSeedSource` | decision `touch-seed-source` |
| `carveChars` | working copy |
| `designRationale` | `helpDocs.designRationale` |
| `kpsDescription`, `startReadmeMdText` | Track 2 description fallback |
