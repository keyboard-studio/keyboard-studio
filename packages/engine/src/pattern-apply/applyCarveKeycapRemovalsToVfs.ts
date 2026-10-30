// Carve keycap-removal patcher: blanks carved characters off the OSK layer
// files (`.kvks` visual keyboard and `.keyman-touch-layout`) IN PLACE, one
// keycap at a time — the removal-side mirror of applyKeycapLabelsToVfs.
//
// Carve's behavioral removal lives in the .kmn projection (applyCarveToVfs /
// applyStoreSlotRemovals); this pass only keeps the PREVIEW visuals honest:
// a carved character's keycap goes blank while the layer files keep their
// full layer/row/key structure, so the live preview never degrades to the
// renderer's fallback layout.
//
// The VirtualFS is mutated in-place; the studio never writes to host disk
// during authoring (spec §11).

import type { IRStore, KeyboardIR, VirtualFS } from "@keyboard-studio/contracts";
import { buildTouchKeyRuleIndex } from "@keyboard-studio/contracts";
import { charToUnicodeKeyId } from "../shared/touch-ids.js";
import {
  buildRemovalSet,
  candidateMatchesViaProduction,
  isTouchSubKeyDuplicate,
  type RemovalProductionContext,
} from "./touch-mechanism-shared.js";
import { parseSlotId, makeSlotId } from "./slotId.js";
import { classifyStoreSlotEdit } from "./applyStoreSlotRemovals.js";
import { resolveCarveCascade } from "./carveCascade.js";
import { readVfsText, resolveOskAssetPaths, xmlUnescape } from "./oskAssetShared.js";
import { TOUCH_LAYOUT_JSON_INDENT } from "../codec/parse-touch.js";
import { isPlusSeparator } from "../shared/rule-shape.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The carve deletion sets, pre-partitioned the way projectWorkingCopyVfs does. */
export interface CarveKeycapRemovalInput {
  /** Slot ids `"<storeNodeId>#<i>"` already validated against `startIr.stores`. */
  slotIds: ReadonlySet<string>;
  /**
   * Whole-node deletion ids (rule, group, store, fragment nodeIds — the same
   * id space the .kmn side consumes). Rule ids contribute their all-char
   * output directly; GROUP ids cascade to their rules via resolveCarveCascade
   * (the same cascade carveFilterIr/carveViaSplice apply to the .kmn, #1803) —
   * a group-level carve must blank its rules' keycaps on every layer, exactly
   * as the .kmn loses the rules. Store/fragment ids carry no single-character
   * intent (raw fragments are opaque; deleting a store just drops its
   * declaration) and are inert here.
   */
  wholeNodeIds: ReadonlySet<string>;
  /**
   * 076 FR-023 (T020): carved characters (NFC texts) whose touch keys are
   * KEPT INERT ("kept, does nothing") instead of the default "removed from
   * the touch layout". The author's keep-inert override, keyed by carved
   * character because touch matching is by keycap text. Empty/omitted =
   * the removal default for every carved touch key.
   */
  keepInertTouchChars?: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Character derivation
// ---------------------------------------------------------------------------

/**
 * Derive the set of NFC keycap texts a carve removed.
 *
 * Sources (mirroring the collectCharContributors producer conventions):
 *   - a slot id whose store item is a `char` → that item's NFC value;
 *   - a whole-node id naming a rule whose output is ALL `char` elements →
 *     the whole NFC output string.
 *
 * Survivor guard: a candidate is dropped when any SURVIVING producer still
 * yields it — a surviving all-char rule with that exact NFC output, or an
 * un-carved `char` slot of a store that a surviving rule still emits through
 * `index()`/`outs()`. This protects the single-`deleteItem` path from
 * blanking a keycap whose character remains typeable via another source.
 *
 * Two refinements keep the guard honest:
 *   - SELF-PAIR `index()` references don't count as producers. An
 *     `index(B, n)` whose n-th context item is `any(B)` (same store — e.g. an
 *     auto-capitalize transform) only re-emits a character that was already
 *     TYPED, so it cannot keep a carved character alive on its own.
 *   - A store that {@link classifyStoreSlotEdit} marks `blocked` is one
 *     applyStoreSlotRemovals REFUSES to edit, so for survivor purposes ALL
 *     its char slots count as intact — carved slot ids on it notwithstanding.
 *     (This is the blocked classification only. Carving EVERY slot of an
 *     any()-consumed store is not a refusal: the store and the rules that
 *     reference it are removed, so its carved chars are gone here too.)
 *
 * Pure — exported for direct unit testing.
 */
export function collectCarvedKeycapTexts(
  startIr: KeyboardIR,
  removals: CarveKeycapRemovalInput,
): Set<string> {
  const { slotIds, wholeNodeIds } = removals;

  const storeByNodeId = new Map(startIr.stores.map((s) => [s.nodeId, s]));
  const storeByName = new Map(startIr.stores.map((s) => [s.name, s]));

  // Lazy per-store blocked-classification cache (classifyStoreSlotEdit scans
  // every rule, so compute at most once per store actually referenced).
  const blockedCache = new Map<string, boolean>();
  const isBlockedStore = (store: IRStore): boolean => {
    let blocked = blockedCache.get(store.nodeId);
    if (blocked === undefined) {
      blocked = classifyStoreSlotEdit(store, startIr).mode === "blocked";
      blockedCache.set(store.nodeId, blocked);
    }
    return blocked;
  };

  // --- Candidates ---
  const candidates = new Set<string>();

  // Resolve the carve cascade the same way the .kmn side does
  // (carveFilterIr/carveViaSplice via resolveCarveCascade): a deleted GROUP
  // deletes its rules, so a group-level carve contributes its rules'
  // characters here. Without this the .kmn loses the group's rules while the
  // .kvks keeps their keycaps (#1803).
  const cascade = resolveCarveCascade(startIr, wholeNodeIds);

  for (const slotId of slotIds) {
    const parsed = parseSlotId(slotId);
    if (parsed === null) continue;
    const store = storeByNodeId.get(parsed.storeNodeId);
    const item = store?.items[parsed.itemsIndex];
    if (item !== undefined && item.kind === "char") {
      candidates.add(item.value.normalize("NFC"));
    }
  }

  for (const group of startIr.groups) {
    for (const rule of group.rules) {
      if (!cascade.deletedRuleIds.has(rule.nodeId)) continue;
      const outEls = rule.output as { kind: string; value?: string }[];
      const charVals = outEls.filter((el) => el.kind === "char").map((el) => el.value ?? "");
      if (charVals.length > 0 && charVals.length === outEls.length) {
        candidates.add(charVals.join("").normalize("NFC"));
      }
    }
  }

  if (candidates.size === 0) return candidates;

  // --- Survivor guard ---
  // Producers that survive the carve: rules (and their groups) not deleted,
  // plus char slots not carved on stores those surviving rules still emit
  // through index()/outs(). Input-only stores (any()/notany() matchers) are
  // NOT producers and never count as survivors. The deleted sets here are the
  // same cascade the .kmn side applies, so a group-level carve never leaves
  // its own deleted rules counted as survivors.
  const survivors = new Set<string>();
  const outputStoreNames = new Set<string>();

  for (const group of startIr.groups) {
    if (cascade.deletedGroupIds.has(group.nodeId)) continue;
    for (const rule of group.rules) {
      if (cascade.deletedRuleIds.has(rule.nodeId)) continue;
      const outEls = rule.output as { kind: string; value?: string; storeRef?: string; offset?: number }[];

      const charVals = outEls.filter((el) => el.kind === "char").map((el) => el.value ?? "");
      if (charVals.length > 0 && charVals.length === outEls.length) {
        survivors.add(charVals.join("").normalize("NFC"));
      }

      // The codec's synthetic keystroke-boundary "+" is not a real context
      // item — index() offsets are 1-based over the remaining items.
      const effectiveContext = (rule.context as { kind: string; text?: string; storeRef?: string }[])
        .filter((el) => !isPlusSeparator(el));

      for (const el of outEls) {
        if (el.storeRef === undefined) continue;
        if (el.kind === "outs") {
          outputStoreNames.add(el.storeRef);
        } else if (el.kind === "index") {
          const target = el.offset !== undefined ? effectiveContext[el.offset - 1] : undefined;
          const isSelfPair = target?.kind === "any" && target.storeRef === el.storeRef;
          // A self-pair only re-emits what was already typed — it is not an
          // independent producer, so it keeps nothing alive.
          if (!isSelfPair) outputStoreNames.add(el.storeRef);
        }
      }
    }
  }

  for (const name of outputStoreNames) {
    const store = storeByName.get(name);
    if (store === undefined || cascade.deletedStoreIds.has(store.nodeId)) continue;
    // A blocked store's slots are never actually edited — every char it
    // holds keeps being produced, carved slot ids notwithstanding.
    const blocked = isBlockedStore(store);
    store.items.forEach((item, i) => {
      if (item.kind === "char" && (blocked || !slotIds.has(makeSlotId(store.nodeId, i)))) {
        survivors.add(item.value.normalize("NFC"));
      }
    });
  }

  for (const t of survivors) candidates.delete(t);
  return candidates;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Blank every keycap displaying a carved character across the `.kvks` and
 * `.keyman-touch-layout` VFS entries.
 *
 * - `.kvks`: every `<layer>` (any shift state) is scanned; a matching
 *   `<key>`'s text is cleared but the element is KEPT — removing it would
 *   let the OSK renderer fall back to the underlying layout's cap, which is
 *   exactly the visual degradation this pass prevents.
 * - `.keyman-touch-layout`: 076 FR-023 (T020) — a matching main key is
 *   REMOVED from the touch layout by default ("removed from the touch
 *   layout"). Under the author's keep-inert override
 *   (`keepInertTouchChars`, per carved character), the key is KEPT but made
 *   inert instead ("kept, does nothing"): `text: ""`, a carved `output`
 *   deleted, and the id neutralized to an inert `T_carved_*` id. Matching
 *   longpress / multitap / flick entries are REMOVED in both modes (an
 *   invisible popup entry would still emit).
 *
 * Missing layer files are a silent no-op (many keyboards ship neither);
 * binary or malformed entries produce one warning each.
 *
 * @param vfs        The in-memory virtual filesystem (mutated in place).
 * @param keyboardId The keyboard identifier (used to derive asset paths).
 * @param startIr     The source-of-truth IR the deletion ids refer to.
 * @param removals   Pre-partitioned carve deletion sets.
 * @returns `{ warnings }` — diagnostic messages for any non-fatal issues.
 */
export function applyCarveKeycapRemovalsToVfs(
  vfs: VirtualFS,
  keyboardId: string,
  startIr: KeyboardIR,
  removals: CarveKeycapRemovalInput,
): { warnings: string[] } {
  const warnings: string[] = [];

  const carved = collectCarvedKeycapTexts(startIr, removals);
  if (carved.size === 0) return { warnings };

  const { kvksPath, touchPath } = resolveOskAssetPaths(vfs, keyboardId);

  clearKvksKeycaps(vfs, kvksPath, carved, warnings);
  // Spec 104 T009: touch matching takes production from the FR-003
  // resolver (the IR + rule-join of the PRE-carve keyboard — the same
  // startIr the deletion sets refer to), so a ruled T_ key whose keycap
  // text does not spell its production is matched too (audit gap 1).
  const production = { ir: startIr, ruleIndex: buildTouchKeyRuleIndex(startIr) };
  clearTouchKeycaps(vfs, touchPath, carved, warnings, removals.keepInertTouchChars, production);

  return { warnings };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Clear matching keycap text in the `.kvks` XML across ALL `<layer>` blocks
 * (carve is layer-agnostic, unlike the S-01/S-08 label patcher). Elements are
 * kept; only their text is emptied. Writes back only when something changed.
 */
function clearKvksKeycaps(
  vfs: VirtualFS,
  kvksPath: string,
  carved: ReadonlySet<string>,
  warnings: string[],
): void {
  const entry = vfs.get(kvksPath);
  // No .kvks is common (touch-only keyboards) — nothing to clear, no warning.
  if (entry === undefined) return;
  if (entry.isBinary) {
    warnings.push(
      `[applyCarveKeycapRemovals] .kvks at "${kvksPath}" is marked binary — cannot apply text patches`,
    );
    return;
  }

  const xml = readVfsText(vfs, kvksPath) ?? "";
  let changed = false;

  const patched = xml.replace(
    /(<layer\b[^>]*>)([\s\S]*?)(<\/layer>)/gi,
    (_layerFull, layerOpen: string, layerBody: string, layerClose: string) => {
      const newBody = layerBody.replace(
        /(<key\b[^>]*>)([^<]*)(<\/key>)/gi,
        (keyFull, keyOpen: string, keyText: string, keyClose: string) => {
          if (keyText !== "" && carved.has(xmlUnescape(keyText).normalize("NFC"))) {
            changed = true;
            return `${keyOpen}${keyClose}`;
          }
          return keyFull;
        },
      );
      return `${layerOpen}${newBody}${layerClose}`;
    },
  );

  if (changed) {
    vfs.set(kvksPath, patched, false);
  }
}

/**
 * Clear matching keycaps in the `.keyman-touch-layout` JSON across all
 * platforms and ALL layers.
 *
 * 076 FR-023 (T020): a main key matching a carved character is REMOVED from
 * the touch layout by default ("removed from the touch layout") — the key
 * object is spliced out of its row. Under the keep-inert override
 * (`keepInertTouchChars`, per carved character) the key is KEPT but made
 * inert instead ("kept, does nothing"): `text: ""`, a carved `output`
 * deleted, and the id neutralized to an inert `T_carved_*` id (a stale/
 * mismatched `text` label is left alone — it was never carved). Matching
 * longpress / multitap / flick entries are REMOVED in both modes (an
 * invisible popup entry would still emit), and the property is dropped when
 * it empties. Writes back only when something changed.
 */
function clearTouchKeycaps(
  vfs: VirtualFS,
  touchPath: string,
  carved: ReadonlySet<string>,
  warnings: string[],
  keepInertTouchChars?: ReadonlySet<string>,
  production?: { ir: KeyboardIR; ruleIndex: ReturnType<typeof buildTouchKeyRuleIndex> },
): void {
  // Touch layout is optional — skip silently when absent or binary.
  const raw = readVfsText(vfs, touchPath);
  if (raw === undefined) return;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    warnings.push(
      `[applyCarveKeycapRemovals] .keyman-touch-layout at "${touchPath}" is not valid JSON — touch keycaps not updated`,
    );
    return;
  }
  if (!data || typeof data !== "object") return;

  // U_<HEX> ids that encode a carved character (KMW derives both output and
  // label from a U_ id, independent of the .kmn rules).
  const carvedUnicodeIds = new Map<string, string>();
  for (const t of carved) {
    carvedUnicodeIds.set(charToUnicodeKeyId(t), t);
  }

  let changed = false;

  // Spec 104 T009: production matching via the FR-003 resolver, per layer
  // (the layer name is the key's state). A ruled T_ key (T_0300, keycap
  // "◌̀") produces its character entirely through .kmn rules — invisible
  // to the text/output/U_-decode tests this pass used alone (audit gap 1).
  // The resolver verdict is OR'd with those display tests, never a
  // replacement for them: this pass's charter includes the keycap a key
  // DISPLAYS, and a key displaying a carved character is in scope even
  // when its production comes from elsewhere.
  const resolverMatches = (
    entry: { id?: string; sp?: number; nextlayer?: string },
    layerId: string,
    chars: ReadonlySet<string>,
  ): boolean => {
    if (production === undefined || typeof entry.id !== "string") return false;
    const ctx: RemovalProductionContext = { production, layerId };
    return candidateMatchesViaProduction(
      {
        id: entry.id,
        ...(typeof entry.sp === "number" ? { sp: entry.sp } : {}),
        ...(typeof entry.nextlayer === "string" ? { nextlayer: entry.nextlayer } : {}),
      },
      chars,
      ctx,
    );
  };

  const matchesCarved = (
    entry: { text?: string; output?: string; id?: string; sp?: number; nextlayer?: string },
    layerId: string,
  ): boolean => {
    for (const t of carved) {
      if (isTouchSubKeyDuplicate(entry, t)) return true;
    }
    return (
      resolverMatches(entry, layerId, carved) ||
      (typeof entry.id === "string" && carvedKeyIds.has(entry.id))
    );
  };

  // Same platform discovery as applyKeycapLabelsToVfs's patchTouchLayout:
  // any top-level object value with a `layer` array, else the top object itself.
  const topObj = data as Record<string, unknown>;
  const platformObjects: Record<string, unknown>[] = [];
  for (const val of Object.values(topObj)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const maybeP = val as Record<string, unknown>;
      if (Array.isArray(maybeP["layer"])) platformObjects.push(maybeP);
    }
  }
  if (platformObjects.length === 0 && Array.isArray(topObj["layer"])) {
    platformObjects.push(topObj);
  }

  // Carved KEY IDS (spec 104, contracts §4 / US4 scenario 3): an id that
  // produces a carved character in ANY occurrence's state is carved as an
  // identity — every occurrence of it is in scope, including layers whose
  // state gives the key no production (Cameroon's shift-layer T_0300 has
  // no SHIFT rule and produces nothing there, but it is the same key,
  // displaying the same carved mark, and its rules are suppressed as one
  // binding set). Computed in a pre-scan so the mutation pass below can
  // test membership instead of re-resolving per layer.
  const carvedCharsByKeyId = new Map<string, Set<string>>();
  if (production !== undefined) {
    const noteProduction = (
      entry: { id?: string; sp?: number; nextlayer?: string },
      lid: string,
    ): void => {
      if (typeof entry.id !== "string") return;
      for (const t of carved) {
        if (resolverMatches(entry, lid, buildRemovalSet([t]))) {
          let set = carvedCharsByKeyId.get(entry.id);
          if (set === undefined) {
            set = new Set();
            carvedCharsByKeyId.set(entry.id, set);
          }
          set.add(t);
        }
      }
    };
    for (const platformObject of platformObjects) {
      const layers = platformObject["layer"];
      if (!Array.isArray(layers)) continue;
      for (const layer of layers) {
        if (!layer || typeof layer !== "object") continue;
        const lid = typeof (layer as Record<string, unknown>)["id"] === "string"
          ? ((layer as Record<string, unknown>)["id"] as string)
          : "";
        const rows = (layer as Record<string, unknown>)["row"];
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          if (!row || typeof row !== "object") continue;
          const keys = (row as Record<string, unknown>)["key"];
          if (!Array.isArray(keys)) continue;
          for (const key of keys) {
            if (!key || typeof key !== "object") continue;
            const k = key as {
              id?: string; sp?: number; nextlayer?: string;
              sk?: { id?: string; sp?: number; nextlayer?: string }[];
              multitap?: { id?: string; sp?: number; nextlayer?: string }[];
              flick?: Record<string, { id?: string; sp?: number; nextlayer?: string }>;
            };
            noteProduction(k, lid);
            for (const sub of [...(k.sk ?? []), ...(k.multitap ?? []), ...Object.values(k.flick ?? {})]) {
              if (sub) noteProduction(sub, lid);
            }
          }
        }
      }
    }
  }
  const carvedKeyIds = new Set(carvedCharsByKeyId.keys());

  // Main-key text/output match, separate from isTouchSubKeyDuplicate above:
  // sub-key popup entries compare exactly, but the main-key path (like the
  // .kvks path) has always normalized to NFC, and `carved` holds NFC values.
  const mainKeyValueMatches = (value: string | undefined): boolean =>
    value !== undefined && value !== "" && carved.has(value.normalize("NFC"));

  for (const platform of platformObjects) {
    for (const layer of platform["layer"] as unknown[]) {
      if (!layer || typeof layer !== "object") continue;
      // The layer id is the resolver state for every key on this layer
      // (spec 104 FR-001); a layer without a usable id resolves state 0.
      const layerId = typeof (layer as Record<string, unknown>)["id"] === "string"
        ? ((layer as Record<string, unknown>)["id"] as string)
        : "";
      const rows = (layer as Record<string, unknown>)["row"];
      if (!Array.isArray(rows)) continue;

      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const keys = (row as Record<string, unknown>)["key"];
        if (!Array.isArray(keys)) continue;

        // 076 FR-023 (T020): carved main keys are removed from the touch
        // layout by default; the key object is spliced out of the row.
        const keptKeys: unknown[] = [];
        for (const key of keys) {
          if (!key || typeof key !== "object") {
            keptKeys.push(key);
            continue;
          }
          const keyObj = key as {
            id?: string;
            text?: string;
            output?: string;
            sp?: number;
            nextlayer?: string;
            sk?: { text?: string; output?: string; id?: string; sp?: number; nextlayer?: string }[];
            multitap?: { text?: string; output?: string; id?: string; sp?: number; nextlayer?: string }[];
            flick?: Record<string, { text?: string; output?: string; id?: string; sp?: number; nextlayer?: string }>;
          };

          // Main keycap: match by displayed text, by `output`, or by a
          // carved U_ id (a U_ id both emits and re-labels its code point
          // purely off the id, independent of `text`/`output`) — OR by
          // resolver production (spec 104 T009): a ruled T_ key whose
          // keycap shows a dotted-circle label produces its character
          // entirely through rules the display tests cannot see.
          const text = keyObj.text ?? "";
          const textMatches = mainKeyValueMatches(text);
          const outputMatches = mainKeyValueMatches(keyObj.output);
          const idIsCarved =
            typeof keyObj.id === "string" && carvedUnicodeIds.has(keyObj.id);
          const productionMatched = resolverMatches(keyObj, layerId, carved);
          const idIsCarvedKey = typeof keyObj.id === "string" && carvedKeyIds.has(keyObj.id);
          const mainMatched =
            textMatches || outputMatches || idIsCarved || productionMatched || idIsCarvedKey;

          // Keep-inert applies only when EVERY carved character this key
          // matches is overridden — a key emitting a non-overridden carved
          // character is still removed. A production-only match counts the
          // specific carved characters the resolver credits to this key.
          let keepInert = mainMatched;
          if (textMatches && !keepInertTouchChars?.has(text.normalize("NFC"))) keepInert = false;
          if (outputMatches && !keepInertTouchChars?.has((keyObj.output as string).normalize("NFC"))) keepInert = false;
          if (idIsCarved && !keepInertTouchChars?.has(carvedUnicodeIds.get(keyObj.id as string) as string)) keepInert = false;
          if (idIsCarvedKey && typeof keyObj.id === "string") {
            // The characters this key's ID produces in ANY state (the
            // pre-scan's record) — an occurrence in a state with no
            // production of its own is still keep-inert only when every
            // carved character its identity produces is overridden.
            for (const t of carvedCharsByKeyId.get(keyObj.id) ?? []) {
              if (!keepInertTouchChars?.has(t)) keepInert = false;
            }
          }

          if (mainMatched && !keepInert) {
            // T020 default: the key leaves the touch layout entirely. Its
            // popup entries die with it (they are carved matches too, and
            // would still emit if kept).
            changed = true;
            continue;
          }

          if (textMatches || outputMatches) {
            keyObj.text = "";
            changed = true;
          }
          if (outputMatches) {
            // With `output` present, the key emits/re-labels through it
            // regardless of the .kmn rules — delete it, and neutralize the id
            // to an inert `T_carved_*` id so a `K_` id can't fall back to its
            // underlying .kmn rule and silently emit a different character
            // under a now-blank cap (mirrors the U_-id neutralization below).
            delete keyObj.output;
            if (typeof keyObj.id === "string") {
              keyObj.id = keyObj.id.startsWith("U_")
                ? `T_carved_${keyObj.id.slice(2)}`
                : `T_carved_${keyObj.id}`;
            }
            changed = true;
          } else if (idIsCarved) {
            // A carved U_ id keeps emitting (and re-labeling) the carved
            // character regardless of `text` — neutralize it to an inert T_
            // id unconditionally. The label itself is left alone here: it
            // wasn't necessarily carved (a stale/mismatched `text` is only
            // cleared above, via textMatches).
            keyObj.id = `T_carved_${(keyObj.id as string).slice(2)}`;
            changed = true;
          } else if (productionMatched) {
            // Keep-inert only (the removal case `continue`d above): the key
            // matched purely through its .kmn rules (spec 104 T009 — e.g. a
            // ruled T_ key with a dotted-circle keycap). Neutralize the id
            // to the inert T_carved_* form so the kept key cannot fire
            // those rules — the override's promise is "kept, does nothing",
            // and the id is the only layout-side guarantee of that. The
            // label is left alone: it was not itself a carved character.
            if (typeof keyObj.id === "string") {
              keyObj.id = keyObj.id.startsWith("U_")
                ? `T_carved_${keyObj.id.slice(2)}`
                : `T_carved_${keyObj.id}`;
            }
            changed = true;
          }

          keptKeys.push(keyObj);

          // Popup entries: remove outright (no layout-stability concern).
          for (const prop of ["sk", "multitap"] as const) {
            const arr = keyObj[prop];
            if (!Array.isArray(arr)) continue;
            const kept = arr.filter((e) => !e || typeof e !== "object" || !matchesCarved(e, layerId));
            if (kept.length !== arr.length) {
              changed = true;
              if (kept.length === 0) {
                delete keyObj[prop];
              } else {
                keyObj[prop] = kept;
              }
            }
          }
          const flick = keyObj.flick;
          if (flick && typeof flick === "object" && !Array.isArray(flick)) {
            for (const dir of Object.keys(flick)) {
              const e = flick[dir];
              if (e && typeof e === "object" && matchesCarved(e, layerId)) {
                delete flick[dir];
                changed = true;
              }
            }
            if (Object.keys(flick).length === 0) {
              delete keyObj.flick;
              changed = true;
            }
          }
        }
        // T020: splice removed keys back into the row. keptKeys holds every
        // key that survived (in original order); a shorter array means at
        // least one carved key left the touch layout.
        if (keptKeys.length !== keys.length) {
          (row as Record<string, unknown>)["key"] = keptKeys;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    vfs.set(touchPath, JSON.stringify(data, null, TOUCH_LAYOUT_JSON_INDENT), false);
  }
}
