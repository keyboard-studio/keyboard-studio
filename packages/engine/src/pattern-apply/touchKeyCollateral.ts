/**
 * touchKeyCollateral — the pending-edit collateral warning for touch key
 * removal/suppression (spec 063 T104/T105, FR-060/FR-061).
 *
 * FR-060: disabling or removing a key must enumerate its LINKED OUTPUTS —
 * its own output plus every `sk` (longpress), `flick`, and `multitap`
 * sub-key it hosts, each named by the character it produces — because none
 * of those sub-entries are visible on the keycap. Cameroon is the worked
 * case: suppressing `T_0021` silently discards the `U_00A1` (`¡`) longpress
 * beneath it.
 *
 * FR-061: the warning must tell apart a character that becomes UNREACHABLE
 * from one that is STILL AVAILABLE ELSEWHERE, naming the surviving
 * location for the latter — deleting the apostrophe key after punctuation
 * moved to a symbol layer discards nothing in practice, and a warning that
 * cannot tell the two apart gets dismissed unread.
 *
 * ## Two functions, one file (why they are dispatched together)
 *
 * - {@link enumerateKeyLinkedOutputs} is T104: given a layout and a pending
 *   `KeyEditOperation`, list every character the operation's address is
 *   about to stop producing — no classification.
 * - {@link analyzeKeyEditCollateral} is T105: the same enumeration, with
 *   each entry classified `unreachable` or `available-elsewhere` (naming
 *   where), plus the deduplicated unreachable-character list — the FR-062
 *   worklist seam a caller (T106) can feed straight into the shared
 *   progress figures (see {@link KeyEditCollateralReport.unreachableCharacters}).
 *
 * No English prose is produced here (FR-044/FR-051): every result is
 * structured fields. The studio composes localized copy.
 *
 * Never throws. An unresolvable address (main key or sub-entry) is a
 * reportable "nothing to warn about" (empty result), matching
 * `resolveKeyAddress`'s own never-throw convention — not an exception.
 *
 * ## Decision: overlap with `useKeyEditGuards.findInvalidatedAssignedCharacters`
 *
 * `useKeyEditGuards.ts` (studio) answers a DIFFERENT question — "does this
 * pending op remove the only mechanism for a character the BY-CHARACTER
 * WALK specifically assigned" — scoped to `workingCopyStore`'s
 * `charTouchEntries`, and explicitly documents that the broader "lost its
 * last mechanism ANYWHERE" sweep (FR-062) is reserved for a later worklist
 * over that same file (tasks.md T106). This module IS that FR-062 sweep,
 * built at the engine layer so both T106's worklist and any other caller
 * can consume one implementation instead of forking a third recursive
 * character collector (the file already has two divergent ones —
 * `collectAllReachableChars` here, `keyChars` in `keyEditOrphanReport.ts`).
 * T106 should call {@link analyzeKeyEditCollateral} rather than deriving a
 * fourth. This module does not import from the studio (engine cannot
 * depend on studio; dependency-cruiser would block it regardless) — the
 * seam is a one-way "T106 imports from here", stated so the next author
 * does not silently re-derive this file's logic a second time.
 *
 * ## Why `producedByKeyId`/rule-index reasoning is used, but NOT
 * `buildProducerIndex` (producerIndex.ts)
 *
 * `buildProducerIndex` counts producers at the whole-`KeyboardIR` RULE
 * level (spec 051, the carve-gallery collateral guard) — it has no
 * location, and it does not count a key's plain keycap `text` at all (a
 * huge fraction of touch-layout production has no `.kmn` rule behind it).
 * FR-061's own worked example ("moved to a symbol layer") is a
 * touch-LAYOUT-location fact, not a rule-count fact, so a bare count could
 * not name a surviving location even if reused. This module instead builds
 * a location-aware walk of the touch layout itself (`findSurvivingLocation`
 * below), reusing the SAME character-producing predicates
 * `buildProducerIndex`'s sibling modules already export
 * (`isSpacerKeyClass`, `unicodeKeyIdToChar`/`decodeUnicodeKeyId`,
 * `producedByKeyId`) and the address builders in `touchKeyAddress.ts`, so
 * production semantics cannot drift even though the traversal is new.
 *
 * ## Why `enumerateTouchMethodsForChar` is NOT reused for the "elsewhere"
 * search either
 *
 * That function matches only `text`/`output`/a decoded `U_` id — it takes
 * no `TouchKeyRuleIndex` and therefore cannot see a character produced
 * SOLELY by a `.kmn` rule bound to a `T_`/`K_` id (exactly the shape
 * `touch-key-rule-join.md` exists to fix). Using it here would silently
 * under-report "available elsewhere" for any rule-bound survivor — for
 * example the touchKeyRuleJoin fixture's `T_0300` mark key, carried on both
 * "phone" and "tablet": its character is reachable on either platform only
 * through the shared `.kmn` rule, and `enumerateTouchMethodsForChar` cannot
 * see that at all. `findSurvivingLocation` below is deliberately the
 * rule-aware superset; the sub-entry walk order it uses (`sk`, then
 * `multitap`, then `flick`) mirrors that function's own, so the two do not
 * disagree on iteration order for no reason.
 *
 * ## What this module deliberately does NOT do
 *
 * - **No recursion below one level of sub-entries.** `touchKeyAddress.ts`'s
 *   addressing scheme has no form for a sub-entry's own sub-entry, and no
 *   shipped corpus file nests one. `TouchKeyIR.sk`/`multitap`/`flick`
 *   entries are walked exactly one level deep, matching what is actually
 *   addressable.
 * - **No `scope: "family"` fan-out.** Mirrors `applyKeyEditsToLayout`'s own
 *   documented choice: every operation is analyzed against the single key
 *   its `address` names, regardless of `KeyEditOperationBase.scope`. Fanning
 *   an authored edit across a layer family (FR-065) is the caller's job.
 * - **No `K_`-always-reachable physical-keyboard fallback** (FR-009's
 *   scope for the separate `reachableProducedSet` view). This module's
 *   "elsewhere" is scoped to what the TOUCH LAYOUT itself still carries,
 *   matching FR-061's own worked example; a character produced only by a
 *   rule bound to a `K_` id the touch layout never renders is a documented
 *   gap, not a silent one.
 * - **No dotted-circle stripping.** `computeTouchCoverage`'s FR-006
 *   augmentation (crediting a U+25CC-stripped keycap) is an
 *   inventory-composability nuance, not a collateral-enumeration one; this
 *   module's `ownCharsForNode` mirrors `collectKeyChars`'s other four
 *   sources (text, output, decoded id, rule production) but not that fifth.
 *   `collectKeyChars` itself is a private, non-exported helper inside
 *   `touch-coverage.ts` (contracts) — duplicating its four-source slice here
 *   is the same tradeoff `keyEditOrphanReport.ts`'s own `keyChars` already
 *   documents ("duplicating three lines is cheaper than coupling").
 * - **A `set`/`rename` is only collateral-bearing when it changes `id`.**
 *   A `set` that flips `sp` to a non-interactive class WITHOUT going
 *   through the dedicated `suppress` op is FR-029c's "half-done
 *   suppression" diagnostic territory — a different finding — not this
 *   module's concern.
 *
 * Pure — no mutation, no I/O.
 */

import {
  isSpacerKeyClass,
  producedByKeyId,
  type TouchKeyIR,
  type TouchKeyRuleIndex,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import { unicodeKeyIdToChar } from "../shared/touch-ids.js";
import { applyKeyEditsToLayout } from "./applyKeyEditsToLayout.js";
import type { TouchMethodDescriptor } from "./enumerateTouchMethodsForChar.js";
import {
  resolveKeyAddress,
  resolveSubKeyEntry,
  type KeyEditOperation,
  type ResolvedKeyLocation,
  type SubKeyLocation,
  type SubKeyRef,
} from "./keyEditOps.js";
import {
  parseTouchKeyAddress,
  touchFlickAddress,
  touchKeyAddress,
  touchSubKeyAddress,
  type TouchKeyAddressParts,
} from "./touchKeyAddress.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** What kind of mechanism a linked output is — mirrors `TouchMethodDescriptor.kind`. */
export type LinkedOutputMechanismKind = "tap" | "longpress" | "multitap" | "flick";

/** One character the addressed key/sub-entry is about to stop producing (T104). */
export interface LinkedOutput {
  /** Stable address of the discarded mechanism (`touchKeyAddress.ts` scheme). */
  readonly address: string;
  readonly kind: LinkedOutputMechanismKind;
  /** Present only when `kind === "flick"`. */
  readonly direction?: string;
  /** The character this mechanism produces, NFC-normalized. */
  readonly producedChar: string;
  /**
   * Display for the host key (the key this mechanism hangs off of/is) — same
   * omit-when-no-glyph convention as `TouchMethodDescriptor.host`: absent
   * when the host key has no human-facing glyph, so the studio renders a
   * localized generic instead of a raw vkey id.
   */
  readonly host?: string;
}

/** Why a linked output survives, or doesn't (T105). */
export type LinkedOutputReachability =
  | { readonly status: "unreachable" }
  | { readonly status: "available-elsewhere"; readonly survivingLocation: TouchMethodDescriptor };

export interface ClassifiedLinkedOutput extends LinkedOutput {
  readonly reachability: LinkedOutputReachability;
}

export interface KeyEditCollateralReport {
  readonly outputs: readonly ClassifiedLinkedOutput[];
  /**
   * Deduplicated, NFC-normalized union of every `unreachable` output's
   * character — the FR-062 worklist seam. A caller (T106) can feed this
   * directly into "characters still unplaced" / the shared progress figures
   * (FR-036d) without re-deriving which characters in `outputs` are the lost
   * ones.
   */
  readonly unreachableCharacters: readonly string[];
}

const EMPTY_OUTPUTS: readonly LinkedOutput[] = [];
const EMPTY_REPORT: KeyEditCollateralReport = { outputs: [], unreachableCharacters: [] };

// ---------------------------------------------------------------------------
// Character extraction for one node (mirrors `touch-coverage.ts`'s
// `collectKeyChars` — see the module doc's "what this deliberately does not
// do" for why it is duplicated rather than imported, and which one of its
// five sources is deliberately left out).
// ---------------------------------------------------------------------------

function ownCharsForNode(key: TouchKeyIR, ruleIndex: TouchKeyRuleIndex | undefined): readonly string[] {
  if (isSpacerKeyClass(key.sp)) return [];

  const out = new Set<string>();
  const push = (text: string | undefined): void => {
    if (text !== undefined && text.length > 0 && !text.startsWith("*")) {
      out.add(text.normalize("NFC"));
    }
  };
  push(key.text);
  push(key.output);

  const decoded = unicodeKeyIdToChar(key.id);
  if (decoded !== undefined) out.add(decoded.normalize("NFC"));

  if (ruleIndex !== undefined && key.id.length > 0) {
    for (const ch of producedByKeyId(ruleIndex, key.id)) out.add(ch.normalize("NFC"));
  }

  return [...out];
}

/**
 * Display for the host key — mirrors `enumerateTouchMethodsForChar.ts`'s
 * private `hostLabel` exactly (not exported there, so duplicated here; same
 * tradeoff as `ownCharsForNode` above).
 */
function hostLabel(key: TouchKeyIR): string | undefined {
  return key.text ?? key.output ?? unicodeKeyIdToChar(key.id);
}

// ---------------------------------------------------------------------------
// T104 — enumerate what the addressed key/sub-entry is about to stop
// producing
// ---------------------------------------------------------------------------

/** One node about to be discarded, with its own produced characters already extracted. */
interface DiscardTarget {
  readonly address: string;
  readonly kind: LinkedOutputMechanismKind;
  readonly direction?: string;
  readonly host?: string;
  readonly lostChars: readonly string[];
}

function subKindToMechanismKind(kind: SubKeyRef["kind"]): LinkedOutputMechanismKind {
  return kind === "sk" ? "longpress" : kind;
}

function subKeyRefAddress(
  parts: TouchKeyAddressParts,
  keyId: string,
  sub: SubKeyRef,
): { readonly address: string; readonly kind: LinkedOutputMechanismKind; readonly direction?: string } {
  if (sub.kind === "flick") {
    return {
      address: touchFlickAddress(parts.platform, parts.layerId, keyId, sub.id),
      kind: "flick",
      direction: sub.id,
    };
  }
  return {
    address: touchSubKeyAddress(parts.platform, parts.layerId, keyId, sub.kind, sub.id),
    kind: subKindToMechanismKind(sub.kind),
  };
}

/**
 * Read the key currently sitting at a previously-resolved structural
 * position — robust across a `set`/`rename` that changes `id` in place (a
 * fresh `resolveKeyAddress` by the OLD id would miss it). Mirrors
 * `useKeyEditGuards.ts`'s identically-named helper; duplicated because this
 * module cannot import from the studio.
 */
function readKeyAtPosition(
  layout: TouchLayoutIR,
  loc: ResolvedKeyLocation<TouchKeyIR>,
): TouchKeyIR | undefined {
  return layout.platforms[loc.platformIndex]?.layers[loc.layerIndex]?.rows[loc.rowIndex]?.keys[loc.keyIndex];
}

/** Read a previously-resolved sub-entry's position on a (possibly edited) main key. */
function readSubEntryAtPosition(
  key: TouchKeyIR,
  loc: SubKeyLocation<TouchKeyIR>,
): TouchKeyIR | undefined {
  if (loc.collection === "flick") return key.flick?.[loc.direction as keyof NonNullable<TouchKeyIR["flick"]>];
  return key[loc.collection]?.[loc.index];
}

/**
 * The nodes `op` is about to discard, each with its own produced characters
 * already extracted — the raw material for both {@link enumerateKeyLinkedOutputs}
 * and {@link analyzeKeyEditCollateral}.
 */
function collectDiscardTargets(
  layout: TouchLayoutIR,
  parts: TouchKeyAddressParts,
  resolved: ResolvedKeyLocation<TouchKeyIR>,
  op: KeyEditOperation,
  ruleIndex: TouchKeyRuleIndex | undefined,
): readonly DiscardTarget[] {
  const host = hostLabel(resolved.key);
  const hostField = host !== undefined ? { host } : {};

  switch (op.kind) {
    case "add":
      // A brand-new key touches no pre-existing content.
      return [];

    case "move":
      // A move relocates the EXISTING node — both appliers splice it rather
      // than rebuilding it, precisely so nothing is discarded (FR-021). The
      // key keeps its id, its output and every sub-key, so there is no
      // collateral to report. Spelled out as its own branch rather than left
      // to a default, so the exhaustive switch keeps failing the build when a
      // future op kind IS lossy.
      return [];

    case "remove":
    case "suppress": {
      const targets: DiscardTarget[] = [
        { address: op.address, kind: "tap", ...hostField, lostChars: ownCharsForNode(resolved.key, ruleIndex) },
      ];
      for (const sub of resolved.key.sk ?? []) {
        targets.push({
          address: touchSubKeyAddress(parts.platform, parts.layerId, resolved.key.id, "sk", sub.id),
          kind: "longpress",
          ...hostField,
          lostChars: ownCharsForNode(sub, ruleIndex),
        });
      }
      for (const sub of resolved.key.multitap ?? []) {
        targets.push({
          address: touchSubKeyAddress(parts.platform, parts.layerId, resolved.key.id, "multitap", sub.id),
          kind: "multitap",
          ...hostField,
          lostChars: ownCharsForNode(sub, ruleIndex),
        });
      }
      if (resolved.key.flick) {
        for (const [direction, sub] of Object.entries(resolved.key.flick)) {
          if (sub === undefined) continue;
          targets.push({
            address: touchFlickAddress(parts.platform, parts.layerId, resolved.key.id, direction),
            kind: "flick",
            direction,
            ...hostField,
            lostChars: ownCharsForNode(sub, ruleIndex),
          });
        }
      }
      return targets;
    }

    case "removeSubKey": {
      const subLoc = resolveSubKeyEntry(resolved.key, op.sub);
      if (subLoc === undefined) return [];
      const addr = subKeyRefAddress(parts, resolved.key.id, op.sub);
      return [
        {
          address: addr.address,
          kind: addr.kind,
          ...(addr.direction !== undefined ? { direction: addr.direction } : {}),
          ...hostField,
          lostChars: ownCharsForNode(subLoc.key, ruleIndex),
        },
      ];
    }

    case "setSubKey": {
      // Only an id-changing patch can orphan a sub-entry's own production
      // (the same rule `applyFieldSemantics` encodes for the main key) —
      // any other field patch leaves the sub-entry's characters intact.
      if (op.fields.id === undefined) return [];
      const subLoc = resolveSubKeyEntry(resolved.key, op.sub);
      if (subLoc === undefined || op.fields.id === subLoc.key.id) return [];

      const before = ownCharsForNode(subLoc.key, ruleIndex);
      const { layout: afterLayout } = applyKeyEditsToLayout(layout, [op]);
      const afterMain = readKeyAtPosition(afterLayout, resolved);
      const afterSub = afterMain !== undefined ? readSubEntryAtPosition(afterMain, subLoc) : undefined;
      const after = afterSub !== undefined ? ownCharsForNode(afterSub, ruleIndex) : [];
      const afterSet = new Set(after);
      const lost = before.filter((ch) => !afterSet.has(ch));
      if (lost.length === 0) return [];

      const addr = subKeyRefAddress(parts, resolved.key.id, op.sub);
      return [
        {
          address: addr.address,
          kind: addr.kind,
          ...(addr.direction !== undefined ? { direction: addr.direction } : {}),
          ...hostField,
          lostChars: lost,
        },
      ];
    }

    case "set":
    case "rename": {
      const newId = op.kind === "rename" ? op.toId : op.fields.id;
      if (newId === undefined || newId === resolved.key.id) return [];

      const before = ownCharsForNode(resolved.key, ruleIndex);
      const { layout: afterLayout } = applyKeyEditsToLayout(layout, [op]);
      const afterKey = readKeyAtPosition(afterLayout, resolved);
      const after = afterKey !== undefined ? ownCharsForNode(afterKey, ruleIndex) : [];
      const afterSet = new Set(after);
      const lost = before.filter((ch) => !afterSet.has(ch));
      if (lost.length === 0) return [];

      return [{ address: op.address, kind: "tap", ...hostField, lostChars: lost }];
    }
  }
}

/**
 * T104: list every character `op`'s addressed key/sub-entry is about to
 * stop producing — its own output plus every `sk`/`flick`/`multitap`
 * sub-key it hosts (for a whole-key `remove`/`suppress`), or the single
 * sub-entry named (for `removeSubKey`/`setSubKey`), or the main key's own
 * character alone (for a `set`/`rename` that changes `id`). Empty for
 * `add`, for an unresolvable address, and for any op that does not change
 * `id` — see the module doc's "what this deliberately does not do".
 *
 * `ruleIndex` is optional: omitting it under-reports a rule-bound
 * production (never over-reports), matching `keyEditOrphanReport.ts`'s and
 * `useKeyEditGuards.ts`'s own convention for the same parameter.
 */
export function enumerateKeyLinkedOutputs(
  layout: TouchLayoutIR,
  op: KeyEditOperation,
  ruleIndex?: TouchKeyRuleIndex,
): readonly LinkedOutput[] {
  const parts = parseTouchKeyAddress(op.address);
  if (parts === undefined) return EMPTY_OUTPUTS;
  const resolved = resolveKeyAddress(layout, parts);
  if (resolved === undefined) return EMPTY_OUTPUTS;

  const targets = collectDiscardTargets(layout, parts, resolved, op, ruleIndex);
  if (targets.length === 0) return EMPTY_OUTPUTS;

  const outputs: LinkedOutput[] = [];
  for (const target of targets) {
    for (const char of target.lostChars) {
      outputs.push({
        address: target.address,
        kind: target.kind,
        ...(target.direction !== undefined ? { direction: target.direction } : {}),
        producedChar: char,
        ...(target.host !== undefined ? { host: target.host } : {}),
      });
    }
  }
  return outputs;
}

// ---------------------------------------------------------------------------
// T105 — classify each linked output as unreachable or available elsewhere
// ---------------------------------------------------------------------------

/**
 * Build a `TouchMethodDescriptor` for a surviving node found by
 * {@link findSurvivingLocation}. `deletable`/`reasonCode` replicate
 * `enumerateTouchMethodsForChar.ts`'s own main-tap layer-switch exemption so
 * the two never disagree about what "deletable" means for the same shape of
 * key, even though this module builds its own traversal (see the module doc
 * for why `enumerateTouchMethodsForChar` itself cannot be called here).
 */
function toSurvivingLocation(
  address: string,
  kind: LinkedOutputMechanismKind,
  platform: string,
  layerId: string,
  char: string,
  hostKey: TouchKeyIR,
  direction: string | undefined,
): TouchMethodDescriptor {
  const host = hostLabel(hostKey);
  const isLayerSwitch = kind === "tap" && hostKey.nextlayer !== undefined;
  return {
    id: address,
    kind,
    ...(host !== undefined ? { host } : {}),
    producedChar: char,
    platform,
    layer: layerId,
    ...(direction !== undefined ? { direction } : {}),
    deletable: !isLayerSwitch,
    ...(isLayerSwitch ? { reasonCode: "layer-switch" as const } : {}),
  };
}

/**
 * Find the first node anywhere in `layout` — outside `excludeAddresses` —
 * whose own characters (text/output/decoded id/rule-bound production, via
 * {@link ownCharsForNode}) include `char`. Deterministic layout order
 * (platform, layer, row, key, then `sk`/`multitap`/`flick`), matching
 * `enumerateTouchMethodsForChar`'s own iteration order. `undefined` when
 * nothing survives — the "unreachable" case.
 */
function findSurvivingLocation(
  layout: TouchLayoutIR,
  char: string,
  ruleIndex: TouchKeyRuleIndex | undefined,
  excludeAddresses: ReadonlySet<string>,
): TouchMethodDescriptor | undefined {
  const target = char.normalize("NFC");

  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          const mainAddr = touchKeyAddress(platform.id, layer.id, key.id);
          if (!excludeAddresses.has(mainAddr) && ownCharsForNode(key, ruleIndex).includes(target)) {
            return toSurvivingLocation(mainAddr, "tap", platform.id, layer.id, target, key, undefined);
          }
          for (const sub of key.sk ?? []) {
            const addr = touchSubKeyAddress(platform.id, layer.id, key.id, "sk", sub.id);
            if (!excludeAddresses.has(addr) && ownCharsForNode(sub, ruleIndex).includes(target)) {
              return toSurvivingLocation(addr, "longpress", platform.id, layer.id, target, key, undefined);
            }
          }
          for (const sub of key.multitap ?? []) {
            const addr = touchSubKeyAddress(platform.id, layer.id, key.id, "multitap", sub.id);
            if (!excludeAddresses.has(addr) && ownCharsForNode(sub, ruleIndex).includes(target)) {
              return toSurvivingLocation(addr, "multitap", platform.id, layer.id, target, key, undefined);
            }
          }
          if (key.flick !== undefined) {
            for (const [direction, sub] of Object.entries(key.flick)) {
              if (sub === undefined) continue;
              const addr = touchFlickAddress(platform.id, layer.id, key.id, direction);
              if (!excludeAddresses.has(addr) && ownCharsForNode(sub, ruleIndex).includes(target)) {
                return toSurvivingLocation(addr, "flick", platform.id, layer.id, target, key, direction);
              }
            }
          }
        }
      }
    }
  }
  return undefined;
}

/**
 * T105: {@link enumerateKeyLinkedOutputs}, with each entry classified
 * `unreachable` or `available-elsewhere` (naming the surviving location via
 * {@link findSurvivingLocation}), plus the deduplicated unreachable-character
 * seam for FR-062 (see {@link KeyEditCollateralReport.unreachableCharacters}).
 *
 * A character produced by more than one of `op`'s own discarded mechanisms
 * (e.g. the same char on both the main key and one of its sub-entries) is
 * correctly excluded from its own "elsewhere" search — `excludeAddresses`
 * covers every address `op` discards, not just the one entry being
 * classified — so this module never reports a key as its own surviving
 * location.
 */
export function analyzeKeyEditCollateral(
  layout: TouchLayoutIR,
  op: KeyEditOperation,
  ruleIndex?: TouchKeyRuleIndex,
): KeyEditCollateralReport {
  const parts = parseTouchKeyAddress(op.address);
  if (parts === undefined) return EMPTY_REPORT;
  const resolved = resolveKeyAddress(layout, parts);
  if (resolved === undefined) return EMPTY_REPORT;

  const targets = collectDiscardTargets(layout, parts, resolved, op, ruleIndex);
  if (targets.length === 0) return EMPTY_REPORT;

  const excludeAddresses = new Set(targets.map((t) => t.address));
  const outputs: ClassifiedLinkedOutput[] = [];
  const unreachable = new Set<string>();

  for (const target of targets) {
    for (const char of target.lostChars) {
      const survivor = findSurvivingLocation(layout, char, ruleIndex, excludeAddresses);
      const reachability: LinkedOutputReachability =
        survivor !== undefined
          ? { status: "available-elsewhere", survivingLocation: survivor }
          : { status: "unreachable" };
      if (reachability.status === "unreachable") unreachable.add(char);

      outputs.push({
        address: target.address,
        kind: target.kind,
        ...(target.direction !== undefined ? { direction: target.direction } : {}),
        producedChar: char,
        ...(target.host !== undefined ? { host: target.host } : {}),
        reachability,
      });
    }
  }

  return { outputs, unreachableCharacters: [...unreachable] };
}
