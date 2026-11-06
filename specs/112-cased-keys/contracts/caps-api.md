# Contract: caps functions

Signatures are the contract; bodies are implementation. Types are in [data-model.md](../data-model.md).

## `@keyboard-studio/contracts` (`src/ir/casedKeys.ts`, exported from the barrel)

```ts
export type Plane = "base" | "shift" | "ralt" | "shift-ralt";

/** Moved from engine/src/character-discovery/casePair.ts; engine re-exports it unchanged. */
export function caseCounterpart(
  char: string,
  bcp47?: string,
): { counterpart: string; direction: "toUpper" | "toLower" } | null;

export function keyPlaneOutputs(ir: KeyboardIR): Map<string, Partial<Record<Plane, string>>>;

/** The parsed &CasedKeys store, ranges expanded. Undefined when not declared. */
export function declaredCasedKeys(ir: KeyboardIR): Set<string> | undefined;

export interface CasedKeySet {
  keys: string[];
  extra: string[];
  conflicts: { vkey: string; plane: Plane; unshifted: string; shifted: string }[];
}

export function casedKeySet(
  ir: KeyboardIR,
  opts: { bcp47?: string; floor: readonly string[] },
): CasedKeySet;

/** Store items for a key list: `[K_A]..[K_Z]` when the floor is complete, then the rest. */
export function casedKeysStoreText(keys: readonly string[]): string;
```

Invariants:
- Pure; no I/O; deterministic order.
- `caseCounterpart` behaviour is byte-for-byte the engine's current one (its tests move with it).
- `ldml-export/lower/capsExpand.ts` `casedKeys()` delegates to `declaredCasedKeys` (one parser).

## `@keyboard-studio/engine` (`src/caps/`)

```ts
/** Delete CAPS-testing rules and remove NCAPS tokens, on the given keys only. */
export function replaceCapsRules(ir: KeyboardIR, keys: ReadonlySet<string>): void;

/** Write or replace store(&CasedKeys); raise &VERSION to 14.0 when lower. */
export function writeCasedKeysStore(
  ir: KeyboardIR,
  keys: readonly string[],
): { versionRaised: { from: string | null; to: "14.0" } | null };

export function removeCasedKeysStore(ir: KeyboardIR): void;

export function upgradeToCasedKeys(
  ir: KeyboardIR,
  opts: { bcp47?: string },
): { ir: KeyboardIR; set: CasedKeySet; versionRaised: { from: string | null; to: "14.0" } | null };

export function compareCapsBehaviour(
  beforeKmn: string,
  afterKmn: string,
  opts: { keyboardId: string; keys: readonly string[] },
): Promise<CapsComparison>;

/** Desktop-independent: operates on the touch layout. */
export function syncTouchCapsLayer(ir: TouchLayoutIR, opts: { bcp47?: string }): void;
export function syncTouchCapsLayerRaw(rawJson: string, opts: { bcp47?: string }): string;
```

Invariants:
- `upgradeToCasedKeys` never mutates its input (clone first).
- `compareCapsBehaviour` compiles with the same compiler path as the download (no second compiler);
  it is never called from the 300 ms validation cycle (Art. IV).
- `syncTouchCapsLayerRaw` leaves every key it doesn't change byte-identical (spec 035 R9 Case B).
- `ensureCasedKeysStore`, `stripCapsRules` and `removeCapsContextElements` are removed from
  `scaffold-ir.ts` once their last callers move; `scaffoldIR` no longer touches caps at all.

## Studio

```ts
// survey/questions/gallery/capsHandling.ts
export const capsHandlingModule: GalleryModule; // provides ["caps-handling"], screen "layout",
                                                // requires ["character-inventory", "windows-layout"]

// lib/projectWorkingCopyVfs.ts — step 2.8, after 2.7 and before 3
// input: ProjectionInput.capsHandling: { mode } | null  (null = not asked / caseless)
```

Spec 111 consumes `upgradeToCasedKeys` + `compareCapsBehaviour` through its upgrade-pair registry
(111 T044). This spec does not build that registry or the suggested-fix UI.
