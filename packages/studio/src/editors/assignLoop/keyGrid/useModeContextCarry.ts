// useModeContextCarry — the touch step's mode-toggle CONTEXT CARRY (spec 058
// T074; FR-036c; specs/058-touch-key-editor/contracts/layer-families.md).
//
// The touch step has two lenses on ONE layout — the by-character walk and the
// by-key grid (`touchEditorMode` in workingCopyStore) — and FR-036c requires
// switching between them to carry the author's place, in BOTH directions:
//
//   character -> by-key: select and reveal the KEY(S) producing that
//     character (via `enumerateTouchMethodsForChar`), or the CANDIDATE keys
//     (keys with no reachable output) when the character is unplaced.
//   key -> by-character: land on a character that key produces.
//
// On several producing (or candidate) keys, the grid selects the FIRST in
// LAYOUT ORDER — active platform first, then layers in FAMILY order (spec
// 058 T061, layerFamilies.ts), then rows/keys in their existing row/column
// order — badges the rest, and offers next/previous cycling. The inspector
// shows exactly one key at a time (never several at once).
//
// ## What TouchGallery.tsx / KeyInspector.tsx should call
//
// This file exports pure functions PLUS a thin `useModeContextCarry` hook,
// deliberately holding no React state of its own — same shape as this
// folder's `useGridNav.ts` precedent: "current position" is whatever the
// CALLER already tracks (KeyGrid's `selectedAddress`, the character walk's
// current char), not a second copy living here.
//
//   - On a character -> by-key toggle: call `carryFromCharacter(char)`
//     (or the pure `carryCharacterToKey` directly). Its `.primary` is the
//     address to select in the grid (and, via `parseTouchKeyAddress`, which
//     platform/layer tab to switch to — this module never re-exposes
//     platform/layer separately; the address already encodes them). Its
//     `carryBadgeCount(.targets)` is the badge count (`undefined` when there
//     is nothing to badge); `stepTarget`/`stepCarryTarget` cycles Next/Previous
//     through `.targets` the same way `stepChar` (useCharCycleKeys.ts) cycles
//     the character strip.
//   - On a key -> by-character toggle: call `carryFromKey(address)` (or the
//     pure `carryKeyToCharacter` directly) and select the returned character
//     in the walk, when defined.
//   - For the kind badge and the cycle affordance's position copy:
//     `composeCarryKindLabel` / `composeCarryCycleLabel`, both i18n (optional
//     `i18n` param, same convention as `existingMethodLabels.ts` — pass
//     `useLingui()`'s `i18n` from a real component; unit tests call with no
//     `i18n` at all and assert on the English source text baked into the
//     `msg()` descriptor). The "+N other keys" COUNT badge is deliberately
//     NOT composed here: catalog-format.md requires counts to go through the
//     ICU `plural()` macro, and `lib/i18nResolve.ts`'s `resolveMessage()`
//     fallback (used when no live `i18n` is available) does not evaluate ICU
//     plural-category selection — the exact gap `lib/relativeTime.ts`'s own
//     doc comment names, resolved there the same way: keep the COUNT
//     (`targets.length - 1`) a plain, non-i18n number here, and let the
//     component that has a live `i18n` (KeyInspector.tsx) render the actual
//     `plural()`-based "+N other keys" text, the way `MyKeyboardsList.tsx`
//     renders `relativeTime()`'s count.
//
// ## Family order — sourced from the real engine decomposition (T061)
//
// `packages/engine/src/index.ts` now re-exports `decomposeLayerId` and
// `groupLayerFamilies` (plus their types) from layerFamilies.ts, so
// `orderLayerIdsByFamily` below imports the real decomposition instead of
// carrying its own copy of the grammar (segment parsing, fragment
// vocabulary, plane-sentinel table) — see specs/058-touch-key-editor/
// contracts/layer-families.md for the contract those functions implement.
//
// Ranking a family's members by ascending modifier-combo complexity needs a
// total order over `ModifierToken`, which `TOUCH_LAYER_PRECEDENCE_ORDER`
// supplies and `comboToTouchLayerId` cannot: its id fragments are lossy for
// the chiral pairs (both `LALT` and `ALT` render as `"alt"`), so per-chirality
// precedence is unrecoverable from the id-building surface. That constant is
// now on the barrel too, so nothing here mirrors engine data.
//
// ## What "candidate keys" means for an unplaced character
//
// FR-036 frames the by-key mode's own worklist as "keys with no reachable
// output." `findCandidateKeyAddresses` uses exactly that predicate — a key
// that carries none of `output` / a decodable `U_<HEX>` id / any rule-bound
// production (via the same `producedByKeyId` join `keyGridViewModel.ts`
// reads for its `producedChars`), is not a spacer/blank (`isSpacerKeyClass`),
// and is not itself a layer switch (`nextlayer`, which is never a placement
// candidate). This is coarser than a full parallelism/hygiene check — it is
// the same "keys with no letter" figure FR-036d wants shared with the
// character walk's "characters still unplaced," not a new, independently
// tuned worklist.

import { useCallback, useMemo } from "react";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
  bindingsForKeyId,
  decodeUnicodeKeyId,
  isSpacerKeyClass,
  producedByKeyId,
  type TouchKeyIR,
  type TouchKeyRuleIndex,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  decomposeLayerId,
  enumerateTouchMethodsForChar,
  groupLayerFamilies,
  parseTouchKeyAddress,
  resolveKeyAddress,
  TOUCH_LAYER_PRECEDENCE_ORDER,
  touchKeyAddress,
  type ParsedLayerId,
} from "@keyboard-studio/engine";
import { resolveMessage } from "../../../lib/i18nResolve.ts";

// ---------------------------------------------------------------------------
// Family order — decomposition, grouping, and token precedence all sourced
// from the engine (T061). See this module's doc comment, "Family order."
// ---------------------------------------------------------------------------

/** Ascending modifier-combo complexity within one family: fewer tokens first, then per-position `TOUCH_LAYER_PRECEDENCE_ORDER` rank. */
function compareWithinFamily(a: ParsedLayerId, b: ParsedLayerId): number {
  if (a.tokens.length !== b.tokens.length) return a.tokens.length - b.tokens.length;
  for (let i = 0; i < a.tokens.length; i++) {
    const aToken = a.tokens[i];
    const bToken = b.tokens[i];
    const aRank = aToken !== undefined ? TOUCH_LAYER_PRECEDENCE_ORDER.indexOf(aToken) : 0;
    const bRank = bToken !== undefined ? TOUCH_LAYER_PRECEDENCE_ORDER.indexOf(bToken) : 0;
    if (aRank !== bRank) return aRank - bRank;
  }
  return 0;
}

/**
 * Order `layerIds` by FAMILY (FR-063 grouping, via the real
 * `groupLayerFamilies`/`decomposeLayerId`), NOT raw array order: families in
 * first-appearance order (`groupLayerFamilies`' own insertion order), each
 * family's own members ordered by ascending modifier-combo complexity.
 * Matches the layer-families contract's worked examples (`default`, `shift`,
 * `caps`, `rightalt-shift`, `rightalt-caps`, `symbol`, `symbol-caps`). A
 * freeform id (FR-067) is never grouped into any family; every freeform id is
 * appended after every family, in its original relative order
 * (`groupLayerFamilies`' own `freeformLayerIds`).
 */
export function orderLayerIdsByFamily(layerIds: readonly string[]): readonly string[] {
  const grouping = groupLayerFamilies(layerIds);

  const ordered: string[] = [];
  for (const family of grouping.families) {
    const decorated: { id: string; decomposition: ParsedLayerId }[] = [];
    for (const id of family.layerIds) {
      const decomposition = decomposeLayerId(id);
      // Defensive only: groupLayerFamilies already excluded freeform ids from
      // family membership, so every id reaching here decomposed successfully.
      if (decomposition.kind !== "parsed") continue;
      decorated.push({ id, decomposition });
    }
    decorated.sort((a, b) => compareWithinFamily(a.decomposition, b.decomposition));
    for (const entry of decorated) ordered.push(entry.id);
  }
  ordered.push(...grouping.freeformLayerIds);
  return ordered;
}

// ---------------------------------------------------------------------------
// Layout order — active platform first, then family-order layers, then
// rows/keys in their existing order.
// ---------------------------------------------------------------------------

/** `layout.platforms`' ids, with `activePlatform` moved to the front when present — otherwise unchanged. */
export function orderedPlatformIds(
  layout: TouchLayoutIR,
  activePlatform: string,
): readonly string[] {
  const ids: string[] = layout.platforms.map((p) => p.id);
  if (!ids.includes(activePlatform)) return ids;
  return [activePlatform, ...ids.filter((id) => id !== activePlatform)];
}

/**
 * Every main-key address in `layout`, mapped to its position in LAYOUT ORDER
 * (active platform first, then family-order layers, then rows/keys as
 * authored) — the total order `carryCharacterToKey`'s "select the first"
 * rule sorts against. Recomputing this per (layout, activePlatform) is cheap
 * (a single traversal), matching `keyGridViewModel.ts`'s own "cheap to
 * re-derive every debounce cycle" precedent (decision D3).
 */
export function buildLayoutOrderIndex(
  layout: TouchLayoutIR,
  activePlatform: string,
): ReadonlyMap<string, number> {
  const index = new Map<string, number>();
  let position = 0;

  for (const platformId of orderedPlatformIds(layout, activePlatform)) {
    const platform = layout.platforms.find((p) => p.id === platformId);
    if (platform === undefined) continue;

    const layerIds = orderLayerIdsByFamily(platform.layers.map((l) => l.id));
    for (const layerId of layerIds) {
      const layer = platform.layers.find((l) => l.id === layerId);
      if (layer === undefined) continue;

      for (const row of layer.rows) {
        for (const key of row.keys) {
          index.set(touchKeyAddress(platformId, layerId, key.id), position++);
        }
      }
    }
  }

  return index;
}

/** Sort `addresses` by `orderIndex`; an address absent from the index sorts last (stable relative to other absent entries). */
function sortByLayoutOrder(
  addresses: readonly string[],
  orderIndex: ReadonlyMap<string, number>,
): readonly string[] {
  return [...addresses].sort((a, b) => {
    const ai = orderIndex.get(a) ?? Number.POSITIVE_INFINITY;
    const bi = orderIndex.get(b) ?? Number.POSITIVE_INFINITY;
    return ai - bi;
  });
}

// ---------------------------------------------------------------------------
// Character -> key: producing keys (reuses enumerateTouchMethodsForChar)
// ---------------------------------------------------------------------------

/**
 * The HOST main-key address for a touch-method descriptor id (a main-key tap
 * address already IS a host address; a `:sk:`/`:multitap:`/`:flick:`
 * sub-entry address is reduced to the main key it hangs off of) — the grid
 * shows KEYS (cells), never a sub-entry on its own, so a character reachable
 * only via a longpress/multitap/flick still resolves to the cell hosting it.
 */
function hostAddressFromMethodId(methodId: string): string {
  const parsed = parseTouchKeyAddress(methodId);
  // Defensive only: every id `enumerateTouchMethodsForChar` returns was built
  // by one of the three address builders in touchKeyAddress.ts, which always
  // parses (see that module's own round-trip contract).
  if (parsed === undefined) return methodId;
  return touchKeyAddress(parsed.platform, parsed.layerId, parsed.keyId);
}

/** Every DISTINCT main-key address in `layout` producing `char` (main tap or any sub-mechanism), unordered — deduped since a key can host more than one matching sub-entry. */
export function findProducingKeyAddresses(
  layout: TouchLayoutIR,
  char: string,
): readonly string[] {
  const methods = enumerateTouchMethodsForChar(layout, char);
  const addresses = new Set<string>();
  for (const method of methods) addresses.add(hostAddressFromMethodId(method.id));
  return [...addresses];
}

// ---------------------------------------------------------------------------
// Character -> key: candidate keys (unplaced character)
// ---------------------------------------------------------------------------

/** See this module's doc comment, "What 'candidate keys' means for an unplaced character." */
function isPlacementCandidateKey(key: TouchKeyIR, ruleIndex: TouchKeyRuleIndex): boolean {
  if (isSpacerKeyClass(key.sp)) return false;
  if (key.nextlayer !== undefined) return false;
  if (key.output !== undefined && key.output.length > 0) return false;
  if (decodeUnicodeKeyId(key.id) !== undefined) return false;
  if (producedByKeyId(ruleIndex, key.id).length > 0) return false;
  return true;
}

/** Every main-key address across `layout` currently producing nothing (FR-036's "keys with no reachable output"), unordered. */
export function findCandidateKeyAddresses(
  layout: TouchLayoutIR,
  ruleIndex: TouchKeyRuleIndex,
): readonly string[] {
  const addresses: string[] = [];
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          if (isPlacementCandidateKey(key, ruleIndex)) {
            addresses.push(touchKeyAddress(platform.id, layer.id, key.id));
          }
        }
      }
    }
  }
  return addresses;
}

// ---------------------------------------------------------------------------
// Key -> character
// ---------------------------------------------------------------------------

/**
 * The rule-bound text `key.id` produces via the touch key <-> rule join,
 * preferring a `"produces"` binding's `producedText` (the whole leading
 * literal-char run, e.g. `"FCFA"`) over its per-CODEPOINT `produced` set
 * (which — per `producedByKeyId`'s own contract, and `keyGridViewModel.ts`'s
 * matching precedent — is deliberately decomposed/deduped for COVERAGE
 * credit, not the literal output text: `producedByKeyId` alone would hand
 * back `"F"` for a `T_FCFA`-style key, not `"FCFA"`). Landing the character
 * walk on a single decomposed codepoint that was never itself a walked
 * inventory character would be wrong, so this reads bindings directly
 * instead of going through `producedByKeyId`.
 */
function primaryProducedTextForKey(key: TouchKeyIR, ruleIndex: TouchKeyRuleIndex): string | undefined {
  for (const binding of bindingsForKeyId(ruleIndex, key.id)) {
    if (binding.role !== "produces") continue;
    if (binding.producedText !== undefined) return binding.producedText;
    if (binding.produced.length > 0) return binding.produced[0];
  }
  return undefined;
}

/**
 * The first character (or literal char run) `key` produces, preferring its
 * own main output (`output`, a decodable `U_<HEX>` id, then a rule-bound
 * production via the touch key <-> rule join) and falling back to whatever
 * its FIRST longpress/multitap/flick sub-entry produces — so a key whose
 * only reachable character sits behind a longpress still lands the
 * character walk on something (FR-036c). `undefined` when nothing anywhere
 * under `key` produces a character.
 */
function charProducedByKeyRecursive(
  key: TouchKeyIR,
  ruleIndex: TouchKeyRuleIndex,
): string | undefined {
  if (key.output !== undefined && key.output.length > 0) return key.output.normalize("NFC");
  const decoded = decodeUnicodeKeyId(key.id);
  if (decoded !== undefined) return decoded.normalize("NFC");
  const produced = primaryProducedTextForKey(key, ruleIndex);
  if (produced !== undefined) return produced;

  for (const sub of key.sk ?? []) {
    const found = charProducedByKeyRecursive(sub, ruleIndex);
    if (found !== undefined) return found;
  }
  for (const sub of key.multitap ?? []) {
    const found = charProducedByKeyRecursive(sub, ruleIndex);
    if (found !== undefined) return found;
  }
  if (key.flick) {
    for (const sub of Object.values(key.flick)) {
      if (sub === undefined) continue;
      const found = charProducedByKeyRecursive(sub, ruleIndex);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** The character `address` (a main key) produces, or `undefined` when the address doesn't resolve or the key (and everything it hosts) produces nothing. */
export function carryKeyToCharacter(
  layout: TouchLayoutIR,
  ruleIndex: TouchKeyRuleIndex,
  address: string,
): string | undefined {
  const parts = parseTouchKeyAddress(address);
  if (parts === undefined) return undefined;
  const resolved = resolveKeyAddress(layout, parts);
  if (resolved === undefined) return undefined;
  return charProducedByKeyRecursive(resolved.key, ruleIndex);
}

// ---------------------------------------------------------------------------
// Character -> key: the composed carry
// ---------------------------------------------------------------------------

export type ModeContextCarryKind = "producing" | "candidate" | "none";

export interface CharacterToKeyCarry {
  /** `"producing"` when `char` is already reachable somewhere; `"candidate"` when it is unplaced and this is the no-output worklist instead; `"none"` when neither exists. */
  readonly kind: ModeContextCarryKind;
  /** Addresses in LAYOUT ORDER (active platform, family-order layers, row/key order). `[]` for `"none"`. */
  readonly targets: readonly string[];
  /** `targets[0]`, or `undefined` for `"none"`. */
  readonly primary: string | undefined;
}

/**
 * character -> by-key (FR-036c). Producing keys win when any exist; only
 * when `char` has none does this fall back to the candidate (no-output)
 * worklist. `layoutOrderIndex` is `buildLayoutOrderIndex(layout,
 * activePlatform)` — passed in rather than rebuilt here so a caller cycling
 * through several characters in one debounce tick (decision D3) builds it
 * once, not once per character.
 */
export function carryCharacterToKey(
  layout: TouchLayoutIR,
  ruleIndex: TouchKeyRuleIndex,
  char: string,
  layoutOrderIndex: ReadonlyMap<string, number>,
): CharacterToKeyCarry {
  const producing = sortByLayoutOrder(findProducingKeyAddresses(layout, char), layoutOrderIndex);
  if (producing.length > 0) {
    return { kind: "producing", targets: producing, primary: producing[0] };
  }

  const candidates = sortByLayoutOrder(findCandidateKeyAddresses(layout, ruleIndex), layoutOrderIndex);
  if (candidates.length > 0) {
    return { kind: "candidate", targets: candidates, primary: candidates[0] };
  }

  return { kind: "none", targets: [], primary: undefined };
}

// ---------------------------------------------------------------------------
// Cycling — mirrors `stepChar` (useCharCycleKeys.ts) exactly: same wrap-around
// convention, so Next/Previous never drifts onto a different rule than the
// character strip's own Left/Right cycle.
// ---------------------------------------------------------------------------

/**
 * The target one position away from `currentAddress` in `targets`, wrapping
 * at both ends. `delta` is `1` for Next, `-1` for Previous. `currentAddress`
 * absent (or not present in `targets`) yields the first target for `delta
 * === 1`, the last for `delta === -1`. `undefined` only when `targets` is
 * empty.
 */
export function stepCarryTarget(
  targets: readonly string[],
  currentAddress: string | undefined,
  delta: 1 | -1,
): string | undefined {
  if (targets.length === 0) return undefined;
  const currentIdx = currentAddress !== undefined ? targets.indexOf(currentAddress) : -1;
  const nextIdx =
    delta === 1
      ? currentIdx === -1
        ? 0
        : (currentIdx + 1) % targets.length
      : currentIdx === -1
        ? targets.length - 1
        : (currentIdx - 1 + targets.length) % targets.length;
  return targets[nextIdx];
}

// ---------------------------------------------------------------------------
// Label composition (i18n) — same convention as existingMethodLabels.ts:
// optional `i18n` (real components pass `useLingui()`'s `i18n`; unit tests
// call with none and assert on the English source text baked into `msg()`).
// ---------------------------------------------------------------------------

/** What kind of context-carry result is being shown — for the inspector's kind badge/tooltip. */
export function composeCarryKindLabel(kind: ModeContextCarryKind, i18n?: I18n): string {
  switch (kind) {
    case "producing":
      return resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.keyGrid.modeContextCarry.kindProducing",
          message: "Types this character",
        }),
      );
    case "candidate":
      return resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.keyGrid.modeContextCarry.kindCandidate",
          message: "Not placed yet — candidate key",
        }),
      );
    case "none":
      return resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.keyGrid.modeContextCarry.kindNone",
          message: "No key found for this character",
        }),
      );
    default: {
      // Exhaustiveness guard: a new `kind` must be handled above.
      const _exhaustive: never = kind;
      return String(_exhaustive);
    }
  }
}

/**
 * The COUNT for the "other producing/candidate keys besides the one the
 * inspector is currently showing" badge — `undefined` when there is nothing
 * to badge (a single target). Deliberately not a rendered string: see this
 * module's doc comment, "What TouchGallery.tsx / KeyInspector.tsx should
 * call," for why the actual `plural()`-based "+N other keys" text is the
 * rendering component's job, not this pure module's.
 */
export function carryBadgeCount(targets: readonly string[]): number | undefined {
  const otherCount = targets.length - 1;
  return otherCount > 0 ? otherCount : undefined;
}

/** The Next/Previous cycling affordance's position label, e.g. "Key 2 of 3". `oneBasedIndex`/`total` are both >= 1. */
export function composeCarryCycleLabel(
  oneBasedIndex: number,
  total: number,
  i18n?: I18n,
): string {
  return resolveMessage(
    i18n,
    msg({
      id: "editor.assignLoop.keyGrid.modeContextCarry.cycleLabel",
      message: `Key ${{ index: oneBasedIndex }} of ${{ total }}`,
    }),
  );
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export interface UseModeContextCarryOptions {
  /** The EFFECTIVE layout (overlay already folded — same contract as `keyGridViewModel.ts`'s `layout` input). */
  readonly layout: TouchLayoutIR;
  /** From `buildTouchKeyRuleIndex(ir)` — built once by the caller, not here. */
  readonly ruleIndex: TouchKeyRuleIndex;
  /** The platform tab currently shown — "active platform first" in layout order. */
  readonly activePlatform: string;
}

export interface UseModeContextCarryResult {
  /** character -> by-key (FR-036c). */
  readonly carryFromCharacter: (char: string) => CharacterToKeyCarry;
  /** key -> by-character (FR-036c). */
  readonly carryFromKey: (address: string) => string | undefined;
  /** Next (`delta: 1`) / Previous (`delta: -1`) cycling through a carry's `targets`. */
  readonly stepTarget: (
    targets: readonly string[],
    currentAddress: string | undefined,
    delta: 1 | -1,
  ) => string | undefined;
}

/**
 * The touch step's mode-toggle context carry (FR-036c). See this module's
 * doc comment for the full contract and "what TouchGallery.tsx / KeyInspector.tsx
 * should call." Holds no React state — `layoutOrderIndex` is memoized per
 * (layout, activePlatform); everything else is a plain function call.
 */
export function useModeContextCarry({
  layout,
  ruleIndex,
  activePlatform,
}: UseModeContextCarryOptions): UseModeContextCarryResult {
  const layoutOrderIndex = useMemo(
    () => buildLayoutOrderIndex(layout, activePlatform),
    [layout, activePlatform],
  );

  const carryFromCharacter = useCallback(
    (char: string) => carryCharacterToKey(layout, ruleIndex, char, layoutOrderIndex),
    [layout, ruleIndex, layoutOrderIndex],
  );

  const carryFromKey = useCallback(
    (address: string) => carryKeyToCharacter(layout, ruleIndex, address),
    [layout, ruleIndex],
  );

  const stepTarget = useCallback(stepCarryTarget, []);

  return { carryFromCharacter, carryFromKey, stepTarget };
}
