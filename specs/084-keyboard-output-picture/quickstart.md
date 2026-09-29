# Quickstart: verifying the keyboard output picture (spec 084)

## Prerequisites

- PR #1854 merged, and `origin/main` merged into this branch (research D16).
- `../keyboards` checked out at the pinned corpus commit (see CLAUDE.md, "Keyboard phonebook"). It is needed for the codegen and corpus tests.
- `pnpm install && pnpm build`.

## Regenerate and check the base keyboard data

```bash
pnpm run codegen-host-layouts          # writes packages/contracts/data/host-layouts.generated.json
pnpm --filter @keyboard-studio/contracts test -- hostLayouts
```

The staleness test re-derives the file from `../keyboards/release/basic` and fails if the committed copy differs.

## Engine checks

```bash
pnpm --filter @keyboard-studio/engine test -- output-picture modifierCombos simulator
```

Key fixtures:
- **SC-001:** `sil_cameroon_qwerty` with UK English likely. Every AltGr combo the keyboard leaves undefined is in the handling set with the Windows UK output, including `K_4@altgr = €`.
- **SC-002/SC-003:** the 20-keyboard corpus fixture set. There are zero defined combos in the handling set, and simulated output matches the table on every undefined, mapped cell.

## Manual walk (Playwright CLI, per project convention)

1. `pnpm dev`, then copy `sil_cameroon_qwerty`, with language tag `bfd-CM`.
2. In the carve step, answer "Which physical keyboard layout…" with QWERTY. Confirm the likely base keyboards and their provenance appear.
3. Carve `ɛ`. **Review removed keys** lists RALT+A under **newly opened**: "was ɛ; now á on UK English".
4. Turn on "combine QWERTY and QWERTZ". Per-family support shows both families, and the layout distance shows the Y/Z difference.
5. In the test pane, select UK English and type AltGr+4 on a combo the keyboard leaves undefined: `€` appears. Select US English: nothing appears.
