# Quickstart: validating spec 110

## Prerequisites

```sh
pnpm install
pnpm --filter @keyboard-studio/contracts build
pnpm --filter @keyboard-studio/engine build
```

## Tests

```sh
pnpm --filter @keyboard-studio/engine test -- helpDocsRender
pnpm --filter @keyboard-studio/studio test -- readmeFacts readmeFactsInput docContent serializeWorkingCopy useDocsPreview
pnpm --filter @keymanapp/keyboard-lint test
pnpm typecheck && pnpm lint
```

## Expected outcomes

- **Right Alt + deadkey fixture**:
  - README.md lists the added characters under Characters.
  - How to type shows an AltGr row, a deadkey row, and the literal-trigger row.
  - readme.htm shows the name, the language line, the "Adds:" line and the welcome pointer, with no table.
- **ASCII-only keyboard**: there is no Characters section, no How to type section and no Fonts section.
- **Track 2 with no description answered**: the README is fully generated, and its description comes from the `.kps`.
- **Studio preview** (`pnpm dev`, Output step, Docs preview): the README and readme.htm match the downloaded zip.
