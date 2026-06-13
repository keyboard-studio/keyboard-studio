# Simulator vendor provenance

Source repository: https://github.com/keymanapp/keyman
Commit SHA: 18d109934d2371669dad78be4c5e392cca8ce297
Upstream verified: `git -C keyman rev-parse HEAD` → 18d109934d2371669dad78be4c5e392cca8ce297
Vendored date: 2026-06-11
License: MIT (© SIL Global) — see `vendor/LICENSE` (copied from keyman root LICENSE.md)

These files are copies of upstream Keyman Engine for Web source. They are
vendored verbatim to avoid a build-time dependency on the full keyman monorepo
and to provide a stable, Node-compatible headless keyboard processor for the
`simulate()` API (issue #183, Path A).

Do NOT reformat or edit vendored files except to fix type errors or ESM module
evaluation issues that prevent operation in the Node/vitest context. Any such
changes are annotated with a comment at the modification site. All vendored files
have `// @ts-nocheck` prepended so that strict-mode flags on the project root
tsconfig do not apply to upstream code. This `// @ts-nocheck` addition is uniform
across every vendored file and is therefore NOT annotated per-file; this paragraph
is the single disclosure for it. A future re-sync will see a spurious line-1 diff on
every file — strip that line to recover the verbatim upstream source.

## Files changed from verbatim upstream (annotated at site)

- `keyman/common/types/consts/virtual-key-constants.ts` — `CLDRScanToVkey` return
  type widened from `number` to `number | undefined`; `CLDRScanToKeyMap` return
  type widened to `KeyMapMaybeUndef` to match.
- `keyman/engine/js-processor/jsKeyboardInterface.ts` — `activeDevice` property
  declaration changed to `declare activeDevice` to satisfy TS2612.
- `keyman/engine/keyboard/keyboards/keyboardLoaderBase.ts` — `catch (e)` in
  `loadKeyboardInternal` narrows `e: unknown` to `Error` before passing to
  `errorBuilder.invalidKeyboard()`.
- `keyman/engine/keyboard/index.ts` — removed `DOMKeyboardLoader` re-export
  (DOM-only; breaks tsc in Node context).
- `keyman/common/web-utils/index.ts` — removed `TimeoutPromise` and
  `PriorityQueue` re-exports (not vendored; not needed by simulator stack).
- `keyman/engine/keyboard/textStore.ts` — removed static `import { SyntheticTextStore }`
  to break an ESM circular dependency (textStore → syntheticTextStore → textStore) that
  causes `SyntheticTextStore extends TextStore` to fail with `TextStore = undefined` in
  Node ESM evaluation order. Changed `buildTranscriptionFrom` to pass `original` directly
  to `Transcription` (callers always pass a pre-built SyntheticTextStore snapshot). CJS
  and bundled-ESM Keyman builds are unaffected; this is a Node-ESM-only issue.
- `keyman/engine/keyboard/keyboards/transcription.ts` — changed `import { SyntheticTextStore }`
  to `import type { SyntheticTextStore }` to eliminate the runtime import edge
  transcription → syntheticTextStore (SyntheticTextStore is only used as a type here;
  the type-only import is elided by esbuild). Breaks the B side of the same ESM cycle.
- `keyman/engine/keyboard/defaultOutputRules.ts` — changed `import { type TextStore }` to
  `import type { TextStore }` (top-level `import type` form) for reliable esbuild
  type-elision in the Node ESM vitest context.

## New files (not vendored — written for this project)

- `keyman/common/types/main.ts` — minimal re-export shim for
  `@keymanapp/common-types`; provides `USVirtualKeyCodes`, `ModifierKeyConstants`,
  `KeymanWebKeyboard`, `TouchLayout`, `LexicalModelTypes` (minimal stub),
  `Uni_IsSurrogate1/2`.
- `stubs/keyman-version.ts` — stub for `@keymanapp/keyman-version`; supplies a
  fixed `VERSION_RELEASE` string so `web-utils/version.ts` constructs without error.

## Vendored file list (Group A — keyman/engine/keyboard)

From `web/src/engine/src/keyboard/`:
- index.ts, codes.ts, deadkeys.ts, defaultOutputRules.ts, keyEvent.ts,
  keyMapping.ts, stringDivergence.ts, syntheticTextStore.ts, systemStore.ts,
  textStore.ts, textStoreLanguageProcessorInterface.ts, variableStore.ts

From `web/src/engine/src/keyboard/keyboards/`:
- activeLayout.ts, defaultLayouts.ts, jsKeyboard.ts, keyboard.ts,
  keyboardHarness.ts, keyboardLoadError.ts, keyboardLoaderBase.ts,
  keyboardMinimalInterface.ts, keyboardProcessor.ts, keyboardProperties.ts,
  processorAction.ts, spacebarText.ts, stateKeyMap.ts, textTransform.ts,
  transcription.ts

## Vendored file list (Group B — keyman/engine/js-processor)

From `web/src/engine/src/js-processor/`:
- index.ts, jsKeyboardInterface.ts, jsKeyboardProcessor.ts,
  platformSystemStore.ts, processorInitOptions.ts, stores.ts,
  stringDivergence.ts

## Vendored file list (Group C — keyman/common/web-utils)

From `web/src/common/web-utils/src/`:
- index.ts, deviceSpec.ts, globalObject.ts, kmwstring.ts, deepCopy.ts,
  version.ts, managedPromise.ts, isEmptyTransform.ts

## Vendored file list (Group D — @keymanapp/common-types subset)

From `common/web/types/src/`:
- consts/virtual-key-constants.ts, consts/modifier-key-constants.ts,
  keyboard-object.ts, lexical-model-types.ts,
  keyman-touch-layout/keyman-touch-layout-file.ts,
  util/util.ts, util/consts.ts

Note: `lexical-model-types.ts` and `util/util.ts` are verbatim upstream copies
physically present in the vendor tree. The `@keymanapp/common-types` entry point
(`main.ts`) does NOT re-export them — it uses inline stubs for the small subset
of types the simulator stack actually needs (Transform, Suggestion,
ProbabilityMass, Uni_IsSurrogate*). The files are present because they are
reachable transitively from other vendored files; keeping them verbatim avoids
modifying the upstream import graph.
