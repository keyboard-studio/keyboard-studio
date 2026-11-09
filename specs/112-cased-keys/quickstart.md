# Quickstart: validating Caps Lock and `&CasedKeys`

**Spec**: [spec.md](spec.md) | **Contracts**: [contracts/](contracts/)

## Prerequisites

- Node ≥ 22.19.0, pnpm 9; `pnpm install` then `pnpm build` (runs `prebuild`; studio typecheck needs
  the engine built).
- `../keyboards` on the keyboard-studio fork's `master` (corpus runs only).
- Never run bare `vitest` at the root; use the package filters below.

## Story 1 — criterion 7.28

```sh
pnpm --filter @keymanapp/keyboard-lint test -- check-cased-keys
```

Expect: missing-store, caseless, mnemonic, declared and (new) declared-but-incomplete cases green;
the incomplete case names `[K_LBRKT]` for the `ŋ`/`Ŋ` fixture and lists the R1 conflict key as
information.

Corpus classification (SC-001): run the 7.28 corpus sweep used for the recorded baseline and check
fail + pass + not-applicable = 921 with zero parse errors. Record the re-baselined split.

## Story 2 — Copy

```sh
pnpm --filter @keyboard-studio/contracts test -- casedKeys
pnpm --filter @keyboard-studio/engine test -- caps
pnpm --filter @keyboard-studio/studio test -- capsHandling projectWorkingCopyVfs decision-points
```

Expect (decision-point fixtures, "after caps"):
- QWERTY and AZERTY: store text is the family floor plus `[K_LBRKT]` and `[K_N]` for the `ŋ`/`Ŋ`
  fixture (SC-002); `&VERSION` ≥ 14.0.
- Caseless fixture: step `not-asked`, no store.
- `explicit-rules` on a copied keyboard with CAPS rules: rules kept, no store, 7.28 fails.
- A copied keyboard whose letters are NCAPS/CAPS rules keeps its letters under every mode (the R6
  regression).
- G5 green on all four #2302 bases.

Manual walk (Playwright CLI, `pnpm dev`): copy `basic_kbdus` for a Bafut alphabet, reach the layout
screen, see "Caps Lock: cased keys (default)" with its "also covers" list; place `ŋ` and see the `Ŋ`
companion pre-accepted and dismissible; download and check the `.kmn` store and the touch caps layer.

## Story 3 — Open upgrade (engine level until spec 111 lands)

```sh
pnpm --filter @keyboard-studio/engine test -- upgradeToCasedKeys compareCaps
```

Expect on `caps/__fixtures__/upstream_basic_kbdus` (SC-003):
- verdict `identical`; the `.kmn` diff is the added store, `&VERSION` 10.0 → 14.0, and each letter's
  four NCAPS/CAPS rules reduced to two plain rules;
- the result compiles with zero warnings.

On the "no caps handling" fixture: verdict `gains-uppercase`, only `caps`/`shiftCaps` cells change.
On the number-row CAPS fixture: verdict `differs`, the fix withheld, the message names the keys.

SC-004 corpus sweep: for every corpus keyboard where the fix would be offered, assert no row is
`differs`. Run it as an opt-in corpus test (it compiles twice per keyboard).

Once spec 111 Phase 8 lands: open upstream basic_kbdus in the studio, see the 7.28 finding with the
fix preview (text diff + per-key table), accept, see 7.28 pass (111 SC-007).

## Story 4 — touch

```sh
pnpm --filter @keymanapp/keyboard-lint test -- check-touch-caps-layer
pnpm --filter @keyboard-studio/engine test -- syncTouchCapsLayer
```

Expect: upstream basic_kbdus touch layout fails (no caps layer); the fork copy passes; the
missing-letters fixture lists them; after `syncTouchCapsLayerRaw`, the check passes and keys outside
the caps layer and the Shift key are byte-identical. Every Copy decision-point fixture with a cased
alphabet passes the check (SC-005).

## Gates before each phase commit

`pnpm lint` (includes depcruise: lint must not import engine), `pnpm --filter <pkg> typecheck`, the
package tests above, and the studio criteria count tests after any criteria row change.
