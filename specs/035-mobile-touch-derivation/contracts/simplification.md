# Contract: Simplification coverage guard (FR-008)

**Package**: `@keyboard-studio/engine` (pure) + `@keymanapp/keyboard-lint` (check 18.6) ·
**Team**: Engine

The compact phone template already embodies spec simplification rules 1–5 (see
[research.md](../research.md) R1). The only new mechanism is the **hard constraint**: no rule
or replay may make an inventory character uncoverable.

## New: `touchCoverage`

`packages/engine/src/pattern-apply/touchCoverage.ts`

```ts
import type { TouchLayoutIR } from "@keyboard-studio/contracts";

export interface TouchCoverageResult {
  /** Inventory chars with zero reachable touch mechanism. Empty ⇒ SC-003 satisfied. */
  uncovered: readonly string[];
}

export function touchCoverage(
  layout: TouchLayoutIR,
  inventory: readonly string[],
): TouchCoverageResult;
```

**Contract**:
1. **Reachability definition** — a char is *covered* if it is produced by any reachable key's
   `text` or `output`, or by any `sk` / `flick[dir]` / `multitap` entry of a reachable key, on
   any platform/layer that is navigable (a layer reachable via some `nextlayer` chain from
   `default`, or the `default` layer itself). Star-labels (`*Shift*`, `*123*`, …) and spacers
   (`sp:8`/`sp:10`) are not char producers.
2. **Pure** — no mutation, no I/O.
3. **Extraction** — this traversal is exactly the `detectedChars` walk currently inline in
   [TouchGallery.tsx](../../../packages/studio/src/editors/assignLoop/TouchGallery.tsx)
   (the `detectedChars` memo); that inline set is replaced by a call to `touchCoverage` so
   gallery and lint agree. Two preservation requirements: the extracted walk must be fed
   the **derived seed for the chosen seed source** (today it walks
   `scaffoldTouchLayout(baseIr)` unconditionally — wrong for Case B), and the "already in
   layout" suggestion behavior it powers (Accept → `touch_inherited`) must survive the
   extraction unchanged.

## Extended: criterion 18.6 gains a touch-side check (`KM_LINT_TOUCH_UNCOVERED`)

Criterion **18.6 already has a shipped check** —
[check-18-6-inventory-coverage.ts](../../../packages/keyboard-lint/src/checks/check-18-6-inventory-coverage.ts)
(`KM_LINT_INVENTORY_UNCOVERED`): desktop-rule coverage via `buildProducedSet(ir)`, warning
severity, scope-guarded to `ir.origin === "scaffolded"` with no raw fragments, runnable only
through `lintWithContext()` (needs `keyboardIR` + `inventory`). This feature does **not**
register a second 18.6 rubric; it adds a **sibling check code** for the touch surface.

`packages/keyboard-lint/src/checks/check-18-6-touch-coverage.ts` — a check that runs
`touchCoverage(layout, inventory)` and emits **one finding per uncovered char**
("`U+XXXX` <char> has no touch mechanism"), code `KM_LINT_TOUCH_UNCOVERED`, mapped to the
**existing** criterion row `18.6-inventory-fully-covered`. **No new criteria.json row** —
the criteria count (148) is test-enforced (the 18.13 addition was reverted for this).

**Contract**:
- **Scope guard differs from the sibling**: do **not** copy `origin === "scaffolded"` —
  imported bases (Case B) are this feature's primary audience; the raw-fragment skip does
  not apply because this check walks the touch layout, not IR rules.
- **Severity/gating (R5)**: **warning** while editing in the gallery (a sparse imported
  seed legitimately starts with many not-yet-configured inventory chars; a wall of errors
  at stage entry is noise). **Blocking at stage completion**: `handlePhaseEComplete` (or
  the stage-exit gate) re-runs `touchCoverage` and refuses to finalize the touch stage
  while `uncovered` is non-empty — this is FR-008's "MUST NOT" enforcement point.
- **Wiring**: [useTouchLint](../../../packages/studio/src/hooks/useTouchLint.ts) currently
  calls plain `engine.lint(fs, keyboardId)`, which cannot run context-dependent checks.
  Extend the hook to accept optional context (the derived layout + confirmed inventory) and
  route through `lintWithContext` — same debounced effect, **no new debounce timer**
  (Constitution IV).
- Runs on the same projected/edited VFS the preview uses (`editedVfsForLint`) so lint,
  preview, and output agree.

## Acceptance mapping

| Spec | Assertion |
|---|---|
| FR-008 / SC-003 | for any derivation, `touchCoverage(finalLayout, inventory).uncovered` is empty |
| US2-AS3 | after reseed+simplify, every placed char remains reachable |
| spec edge case | a char with no obvious touch position is reachable via a longpress/secondary affordance (else 18.6 flags it) |
