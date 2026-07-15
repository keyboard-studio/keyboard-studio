# Quickstart: Validate mobile/touch layout derivation

Runnable validation for feature 035. Proves the two user stories end-to-end and the FR-008
coverage guard. References [contracts/](contracts/) and [data-model.md](data-model.md) rather
than restating implementation.

## Prerequisites

- `pnpm install` at repo root; `pnpm build` (runs `prebuild` — fetches langtags + kmcmplib.wasm).
- Bases: one keyboard that **ships** a `.keyman-touch-layout` (US1) and one that **does not**
  (US2). Locate via [docs/keyboard-index.md](../../docs/keyboard-index.md); confirm the touch
  file with `resolveBaseTouchJson` semantics (a `source/*.keyman-touch-layout` outside `tests/`).

## Unit checks (fast — run first)

```bash
# Engine: replay + coverage pure functions
pnpm --filter @keyboard-studio/engine test src/pattern-apply/applyDesktopModifications.test.ts
pnpm --filter @keyboard-studio/engine test src/pattern-apply/applyDesktopModificationsToRawJson.test.ts
pnpm --filter @keyboard-studio/engine test src/pattern-apply/touchCoverage.test.ts
# Engine: projection still emits the compact phone platform + replay in both cases
pnpm --filter @keyboard-studio/engine test src/scaffolder/scaffoldTouchLayout.test.ts
# Studio: advance routes mechanisms → touch_seed_source → touch
pnpm --filter @keyboard-studio/studio test src/steps/advance.test.ts
```

**Expected**: `applyDesktopModifications` drops every `removals` char and reflects every
`placements` char (tagged `physical-suggested`); `touchCoverage` returns exactly the orphaned
inventory chars and empty when all reachable; `advance("mechanisms", …)` → `touch_seed_source`,
`advance("touch_seed_source", …)` → `touch`.

## Scenario A — US1 import-and-adapt (default, P1)

1. `pnpm dev`, start authoring from the base that **ships** a touch layout.
2. Walk to Carve: remove **N** characters. Continue to Mechanisms: place **M** letters. The
   desktop locks at the end of Mechanisms.
3. At the **Touch Seed Source** step: confirm the default is **Import & adapt** and a preview
   of the base's touch layout is shown. Confirm.
4. In the Touch gallery, finish (optionally add a longpress).
5. Emit (ZIP) and open `source/<id>.keyman-touch-layout`.

**Expected outcome (SC-001, FR-002/004/005)**:
- The layout **starts from the base's** platforms/layers (not the minimal QWERTY fallback).
- **None** of the N removed characters appear anywhere (`text`/`output`/`sk`/`flick`/`multitap`).
- **All** M placed letters are present at sensible positions.
- The file **compiles** (no compiler errors in the preview / on emit).

## Scenario B — US2 reseed-from-desktop (fallback, P2)

1. Start authoring from the base that ships **no** touch layout. Carve + place as in A.
2. At **Touch Seed Source**: the default is **Reseed from desktop** (no base layout to import);
   confirm. *(Also verify US2-AS4: on the Scenario-A base, explicitly choosing Reseed discards
   the base layout — including any shipped tablet/desktop platforms, which the chooser warns
   about — and uses the desktop projection.)*
3. Finish the Touch gallery; emit; open the touch layout file.

**Expected outcome (SC-002)**:
- The layout is a **compact phone projection** (default + shift + numeric, ≤10 keys/row) of the
  locked desktop — contains the author's placed characters, is **not** QWERTY-only.
- Compiles and previews (SC-004).

## Scenario C — coverage guard (FR-008 / SC-003)

1. In either scenario, carve a character that is the **sole realization** of an inventory
   letter (or contrive a placement whose host key was removed).

**Expected outcome**: the Touch gallery lint summary shows a **`KM_LINT_TOUCH_UNCOVERED`**
(criterion 18.6) warning naming the uncovered char (`U+XXXX <char> has no touch mechanism`);
it clears once the char is made reachable (e.g. via a longpress in the gallery). Attempting
to complete the touch stage while a char is uncovered is refused;
`touchCoverage(finalLayout, inventory).uncovered` is empty before the stage completes.

## E2E (CI parity)

```bash
cd packages/studio && npx playwright test   # US1 + US2 touch-derivation walks
```

**Expected**: both story specs pass, each asserting emitted-layout content (removals absent,
placements present, not QWERTY) and a clean compile. See [research.md](research.md) R8.
*(Local caveat: the Playwright CLI is unavailable on the primary dev machine — these specs
are CI-first; verify locally via Node probes / headless-Chromium CDP.)*

## Constitution spot-checks

- No host-disk writes during authoring; touch file appears only in the emitted ZIP / VFS (V).
- Touch derivation + lint run inside the single 300 ms debounce — no second timer (IV).
- Projection reads `KeyboardIR` rules, never raw `.kmn` text (II).
