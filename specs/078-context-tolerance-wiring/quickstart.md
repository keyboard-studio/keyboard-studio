# Quickstart: validating context tolerance end to end

This guide checks that the feature works. For the shapes, see
[data-model.md](data-model.md) and [contracts/](contracts/).

## Prerequisites

- Node ≥ 22.19.0, and `pnpm install && pnpm build` from the repo root. `pnpm build`
  runs prebuild.
- `../keyboards` checked out at `keyboard-studio/keyboards` `master`, so the
  corpus is pinned.
- PR #1757's harness present at `utilities/nfd-tolerance-corpus`.
- The flag set: `VITE_KM_CONTEXT_TOLERANCE=1` in `packages/studio/.env.local`.

## 1. Engine: browser-safe entry (Phase 2)

```
pnpm --filter @keyboard-studio/engine test -- context-tolerance simulator
pnpm --filter @keyboard-studio/studio build
```

Expected results:

- Loader-equivalence tests pass under the Node loader and the browser loader.
- The studio bundle-safety test finds no `node:vm` and no `keyman/engine/`
  specifier.
- The root entry chunk does not contain the simulator.

## 2. Corpus gate (FR-012)

```
node utilities/nfd-tolerance-corpus --corpus ../keyboards
```

Expected results:

- `regressed = 0`.
- `gap-fixed / (keyboards with a gap) ≥ 40%` (SC-004).
- Every rule is accounted for (SC-005).

## 3. US1: the finding appears

1. Run `pnpm dev`, import `sil_yoruba8`, and wait for the preview.
2. Check the notice in the main walk:
   - It appears in the status region. It is announced once, and it arrives
     after the preview is ready, never before it.
   - Expanding it lists each affected rule with a case. For example:
     `U+006F LATIN SMALL LETTER O`, `U+0323 COMBINING DOT BELOW`, then the acute
     key.
   - No bare "NFC", "NFD", "normalization" or "canonical" appears without a
     gloss.
   - Download stays enabled.
3. Import a keyboard that already handles both forms. There is no notice.
4. Import a keyboard that has opaque rules. The could-not-check notice appears
   with a count and the reasons.

## 4. US2: accept and partial accept

1. Walk the survey to the marks series. The context-tolerance station is
   pre-filled, with every site ticked.
2. The preview shows:
   - the added-rule count;
   - the shadowed rules;
   - the mnemonic backspace note (`sil_yoruba8` is mnemonic).
3. Confirm, then check:
   - The decision trail shows "Accepted suggested … from analysis".
   - After the next compile, the notice reports the rules as made tolerant.
4. In the simulator, type decomposed `o` + U+0323, then each of the five accent
   keys. Each produces its correct accent (SC-003).
5. Composed input gives output byte-identical to the unfixed keyboard (FR-008).
6. Repeat with two sites unticked:
   - Only the ticked sites change.
   - The unticked rules stay in the notice.
   - The trail records "partial" together with the proposed site ids.
7. Confirm again. The working copy is unchanged (idempotent).

## 5. US3: decline

1. Choose "Leave my keyboard as it is", then download.
   - The output equals the emitted working copy without the feature (SC-008).
   - The trail shows the decline with the tool's proposal attached.
2. Revisit the marks series. The prior decision shows and is not re-proposed.
3. Edit an affected rule. After the next compile, the station is proposed
   again (FR-009).

## 6. Regression suites

```
pnpm --filter @keyboard-studio/studio test -- contextTolerance marks decisions
pnpm --filter @keyboard-studio/contracts test
pnpm lint          # depcruise: keyboard-lint stays engine-free
pnpm --filter @keyboard-studio/studio test:e2e -- context-tolerance
```
