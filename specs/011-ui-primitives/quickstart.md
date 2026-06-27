# Quickstart: Validating the `ui/` Primitive Extraction

How to prove P1 is correct — maps directly to the Success Criteria. No new tooling; uses the existing vitest + dependency-cruiser setup.

## Prerequisites

```bash
pnpm install
pnpm --filter @keyboard-studio/studio build   # or `pnpm dev` for the SPA
```

## SC-001 — No inline duplication remains

After the refactor, the six call sites import controls from `ui/` and define none inline:

```bash
# Should return NOTHING (no inline control style-constants left in the 6 files):
rg -n "INPUT_STYLE|NEXT_BTN_|BACK_BTN|CARD_BASE|OPTION_ROW_STYLE" \
  packages/studio/src/survey/QuestionField.tsx \
  packages/studio/src/components/{TrackStep,ProjectNameStep,ScaffoldForm,TrackOneIdentityPanel,BaseResolution}.tsx

# Each of the 6 should import from ui/:
rg -n "from \"\.\./ui|from \"\.\./\.\./ui" packages/studio/src/{survey,components}
```

Expected: zero inline control definitions; every refactored file imports primitives.

## SC-002 — Zero behavioral/visual diff (existing tests unchanged)

```bash
pnpm --filter @keyboard-studio/studio test
```

Expected: green, with **no edits** to pre-existing tests (`StudioShell.test.tsx`, `BaseResolution.test.tsx`, `TrackOneIdentityPanel.test.tsx`, survey/`QuestionField` tests). `git diff` on those test files across the refactor must be empty. New per-primitive tests under `ui/*.test.tsx` are additive.

## SC-003 — The leaf boundary is enforced

```bash
pnpm depcruise          # clean tree: PASS
```

Probe (proves the rule actually fires):

```bash
# Temporarily add to any ui/ file:  import { useWorkingCopy } from "../stores/workingCopyStore.ts";
pnpm depcruise          # MUST FAIL naming rule "ui-is-a-leaf"
# revert the probe import
pnpm depcruise          # PASS again
```

## SC-004 — Single theme token source

```bash
# galleryTheme.ts is now a re-export, not a second definition:
cat packages/studio/src/lib/galleryTheme.ts        # expect: export { … } from "../ui/theme.ts";
# No duplicate hex token DEFINITIONS outside ui/theme.ts (spot-check canonical tokens):
rg -n "#0d1117|#30363d|#6ea8fe" packages/studio/src/ui/theme.ts   # defined here
```

Expected: tokens are defined once in `ui/theme.ts`; `galleryTheme.ts` re-exports. (Divergent one-off values intentionally preserved at call sites per data-model.md — these are not "the token source".)

## SC-005 — No broken imports

```bash
pnpm --filter @keyboard-studio/studio typecheck
pnpm --filter @keyboard-studio/studio build
```

Expected: clean — all moved/added imports keep explicit `.ts`/`.tsx` extensions.

## Manual smoke (optional)

```bash
pnpm dev
```

Walk the survey (a question field, radios, multiselect), the Track step, Project-name step, Scaffold form, identity panel, and base-resolution picker. Each should look and behave exactly as before.
