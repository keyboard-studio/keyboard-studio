# Contract: Help documentation generation

Identifiers below are exact. Tasks and tests code against these names — do not rename, recase, or
pluralize when implementing.

## Contracts package (`@keyboard-studio/contracts`)

- New file `src/help-docs.ts` exporting `HelpDocsAnswers` (interface — see
  [data-model.md](../data-model.md)) and its zod mirror `HelpDocsAnswersSchema` in `src/schemas.ts`,
  with the same compile-time drift guard convention every other locked type already uses.

## Working-copy store (`packages/studio/src/stores/workingCopyStore.ts`)

New state fields (all default `null`):

- `helpDocs: HelpDocsAnswers | null`
- `baseWelcomeHtmText: string | null`
- `baseHelpPhpText: string | null`

New action:

- `setHelpDocs: (helpDocs: HelpDocsAnswers | null) => void` — whole-value replace, matching
  `setAttribution`'s existing semantics exactly (no partial-patch variant).

## Flow-step wiring (`packages/studio/src/editors/adapters/`)

- `flowStepOptions.tsx`: `phaseFOptions.onCommit(result, deps)` calls a new
  `extractHelpDocs(result: SurveyPhaseResult): HelpDocsAnswers | undefined` and, when defined,
  `deps.setHelpDocs(extracted)`.
- `makeFlowStepComponent.tsx`: `FlowStepDeps` gains `setHelpDocs: (patch: HelpDocsAnswers | null) =>
  void`, read via `useWorkingCopyStore((s) => s.setHelpDocs)` alongside the existing
  `setStoreIdentity` read, and threaded into `depsRef.current`.

## Engine render module (`packages/engine/src/shared/helpDocsRender.ts`)

Exact exported names (see [data-model.md](../data-model.md) for signatures):

- `buildDocSections`
- `renderReadmeMd`
- `renderReadmeHtm`
- `renderWelcomeHtm`
- `renderHelpPhp`
- `DocSection`, `HelpDocsRenderInput` (types)

## Loader (`packages/engine/src/loader/fetchKeyboardSourceToVfs.ts`)

`FetchKeyboardSourceResult` gains two new optional fields, named to match the existing
`baseLicenseText` convention exactly:

- `baseWelcomeHtmText?: string`
- `baseHelpPhpText?: string`

## Package descriptor (`packages/engine/src/package-descriptor/build.ts`)

- `PackageDescriptorIdentity` gains `websiteUrl?: string`.
- `buildKpsContent` emits `<WebSite URL="<escaped url>"><escaped url></WebSite>` inside `<Info>`
  immediately after `<Description>`, only when `websiteUrl` is a non-blank string.

## Output projection (`packages/studio/src/lib/serializeWorkingCopy.ts`)

`projectWorkingCopyForOutput` writes rendered content into these existing VFS paths (no new
paths introduced): `README.md`, `source/readme.htm`, `source/welcome.htm`,
`` source/help/${resolvedKeyboardId}.php ``.

## Studio preview surface (Story 2)

- New hook `packages/studio/src/hooks/useDocsPreview.ts`, exported name `useDocsPreview`.
- New component `packages/studio/src/components/DocsPreviewPanel.tsx`, exported name
  `DocsPreviewPanel`.
