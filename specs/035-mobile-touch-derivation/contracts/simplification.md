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
   [TouchGallery.tsx:634-663](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx);
   that inline set is replaced by a call to `touchCoverage` so gallery and lint agree.

## New: Layer C touch check 18.6 (coverage)

`packages/keyboard-lint/src/checks/` — register a check that runs `touchCoverage(layout,
inventory)` and emits **one error finding per uncovered char** ("`U+XXXX` <char> has no touch
mechanism"). Surfaced through the existing
[useTouchLint](../../packages/studio/src/hooks/useTouchLint.ts) hook alongside 18.1–18.5 — **no
new debounce timer** (Constitution IV).

**Contract**:
- Severity **error** (blocks a clean touch stage), consistent with the FR-008 "MUST NOT" and
  the criterion 18.6 coverage requirement.
- Runs on the same projected/edited VFS the preview uses (`editedVfsForLint`) so lint,
  preview, and output agree.

## Acceptance mapping

| Spec | Assertion |
|---|---|
| FR-008 / SC-003 | for any derivation, `touchCoverage(finalLayout, inventory).uncovered` is empty |
| US2-AS3 | after reseed+simplify, every placed char remains reachable |
| spec edge case | a char with no obvious touch position is reachable via a longpress/secondary affordance (else 18.6 flags it) |
