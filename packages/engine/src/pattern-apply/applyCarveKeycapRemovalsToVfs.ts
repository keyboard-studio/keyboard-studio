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
import { charToUnicodeKeyId } from "../shared/touch-ids.js";
import { isTouchSubKeyDuplicate } from "./touch-mechanism-shared.js";
import { parseSlotId } from "./slotId.js";
import { classifyStoreSlotEdit } from "./applyStoreSlotRemovals.js";
import { readVfsText, resolveOskAssetPaths, xmlUnescape } from "./oskAssetShared.js";
import { isPlusSeparator } from "../shared/rule-shape.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The carve deletion sets, pre-partitioned the way projectWorkingCopyVfs does. */
export interface CarveKeycapRemovalInput {
  /** Slot ids `"<storeNodeId>#<i>"` already validated against `baseIr.stores`. */
  slotIds: ReadonlySet<string>;
  /**
   * Whole-node deletion ids. Only RULE nodeIds contribute characters here;
   * group/store/fragment ids are inert (structural deletions carry no single
   * character intent) but harmlessly accepted.
   */
  wholeNodeIds: ReadonlySet<string>;
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
 *
 * Pure — exported for direct unit testing.
 */
export function collectCarvedKeycapTexts(
  baseIr: KeyboardIR,
  removals: CarveKeycapRemovalInput,
): Set<string> {
  const { slotIds, wholeNodeIds } = removals;

  const storeByNodeId = new Map(baseIr.stores.map((s) => [s.nodeId, s]));
  const storeByName = new Map(baseIr.stores.map((s) => [s.name, s]));

  // Lazy per-store blocked-classification cache (classifyStoreSlotEdit scans
  // every rule, so compute at most once per store actually referenced).
  const blockedCache = new Map<string, boolean>();
  const isBlockedStore = (store: IRStore): boolean => {
    let blocked = blockedCache.get(store.nodeId);
    if (blocked === undefined) {
      blocked = classifyStoreSlotEdit(store, baseIr).mode === "blocked";
      blockedCache.set(store.nodeId, blocked);
    }
    return blocked;
  };

  // --- Candidates ---
  const candidates = new Set<string>();

  for (const slotId of slotIds) {
    const parsed = parseSlotId(slotId);
    if (parsed === null) continue;
    const store = storeByNodeId.get(parsed.storeNodeId);
    const item = store?.items[parsed.itemsIndex];
    if (item !== undefined && item.kind === "char") {
      candidates.add(item.value.normalize("NFC"));
    }
  }

  for (const group of baseIr.groups) {
    for (const rule of group.rules) {
      if (!wholeNodeIds.has(rule.nodeId)) continue;
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
  // NOT producers and never count as survivors.
  const survivors = new Set<string>();
  const outputStoreNames = new Set<string>();

  for (const group of baseIr.groups) {
    if (wholeNodeIds.has(group.nodeId)) continue;
    for (const rule of group.rules) {
      if (wholeNodeIds.has(rule.nodeId)) continue;
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
    if (store === undefined || wholeNodeIds.has(store.nodeId)) continue;
    // A blocked store's slots are never actually edited — every char it
    // holds keeps being produced, carved slot ids notwithstanding.
    const blocked = isBlockedStore(store);
    store.items.forEach((item, i) => {
      if (item.kind === "char" && (blocked || !slotIds.has(`${store.nodeId}#${i}`))) {
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
 * `.keyman-touch-layout` VFS entries, keeping the files' layer/row/key
 * structure fully intact.
 *
 * - `.kvks`: every `<layer>` (any shift state) is scanned; a matching
 *   `<key>`'s text is cleared but the element is KEPT — removing it would
 *   let the OSK renderer fall back to the underlying layout's cap, which is
 *   exactly the visual degradation this pass prevents.
 * - `.keyman-touch-layout`: matching main keys get `text: ""` (the key stays,
 *   so rows never reflow) when the displayed text or `output` itself matches
 *   a carved character. A carved `output` value is additionally DELETED and
 *   the id neutralized to an inert `T_carved_*` id. Separately — and
 *   unconditionally, regardless of `text`/`output` — any main key whose id
 *   encodes a carved character (a `U_<HEX>` id, which emits its code point
 *   and re-labels purely off the id, independent of `text`) has that id
 *   neutralized to `T_carved_<HEX>`; a stale/mismatched `text` label is left
 *   untouched unless it separately matched a carved character. When
 *   `output` is present on a non-`U_` id (e.g. `K_X`), its id similarly
 *   becomes `T_carved_<id>` (with `output` gone, a `K_` id would otherwise
 *   fall back to its underlying .kmn rule and could silently emit a
 *   different character under a now-blank cap). Matching longpress /
 *   multitap / flick entries are REMOVED (an invisible popup entry would
 *   still emit), and the property is dropped when it empties.
 *
 * Missing layer files are a silent no-op (many keyboards ship neither);
 * binary or malformed entries produce one warning each.
 *
 * @param vfs        The in-memory virtual filesystem (mutated in place).
 * @param keyboardId The keyboard identifier (used to derive asset paths).
 * @param baseIr     The source-of-truth IR the deletion ids refer to.
 * @param removals   Pre-partitioned carve deletion sets.
 * @returns `{ warnings }` — diagnostic messages for any non-fatal issues.
 */
export function applyCarveKeycapRemovalsToVfs(
  vfs: VirtualFS,
  keyboardId: string,
  baseIr: KeyboardIR,
  removals: CarveKeycapRemovalInput,
): { warnings: string[] } {
  const warnings: string[] = [];

  const carved = collectCarvedKeycapTexts(baseIr, removals);
  if (carved.size === 0) return { warnings };

  const { kvksPath, touchPath } = resolveOskAssetPaths(vfs, keyboardId);

  clearKvksKeycaps(vfs, kvksPath, carved, warnings);
  clearTouchKeycaps(vfs, touchPath, carved, warnings);

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
 * platforms and ALL layers. Main keys keep their object (`text: ""`, a
 * carved `output` deleted and the id neutralized to `T_carved_*`);
 * longpress/multitap/flick entries are removed. Writes back only when
 * something changed.
 */
function clearTouchKeycaps(
  vfs: VirtualFS,
  touchPath: string,
  carved: ReadonlySet<string>,
  warnings: string[],
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

  const matchesCarved = (entry: { text?: string; output?: string; id?: string }): boolean => {
    for (const t of carved) {
      if (isTouchSubKeyDuplicate(entry, t)) return true;
    }
    return false;
  };

  // Main-key text/output match, separate from isTouchSubKeyDuplicate above:
  // sub-key popup entries compare exactly, but the main-key path (like the
  // .kvks path) has always normalized to NFC, and `carved` holds NFC values.
  const mainKeyValueMatches = (value: string | undefined): boolean =>
    value !== undefined && value !== "" && carved.has(value.normalize("NFC"));

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

  for (const platform of platformObjects) {
    for (const layer of platform["layer"] as unknown[]) {
      if (!layer || typeof layer !== "object") continue;
      const rows = (layer as Record<string, unknown>)["row"];
      if (!Array.isArray(rows)) continue;

      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const keys = (row as Record<string, unknown>)["key"];
        if (!Array.isArray(keys)) continue;

        for (const key of keys) {
          if (!key || typeof key !== "object") continue;
          const keyObj = key as {
            id?: string;
            text?: string;
            output?: string;
            sk?: { text?: string; output?: string; id?: string }[];
            multitap?: { text?: string; output?: string; id?: string }[];
            flick?: Record<string, { text?: string; output?: string; id?: string }>;
          };

          // Main keycap: match by displayed text, by `output`, or by a
          // carved U_ id (a U_ id both emits and re-labels its code point
          // purely off the id, independent of `text`/`output`).
          const text = keyObj.text ?? "";
          const textMatches = mainKeyValueMatches(text);
          const outputMatches = mainKeyValueMatches(keyObj.output);
          const idIsCarved =
            typeof keyObj.id === "string" && carvedUnicodeIds.has(keyObj.id);
          if (textMatches || outputMatches) {
            keyObj.text = "";
            changed = true;
          }
          if (outputMatches) {
            // With `output` present, the key emits/re-labels through it
            // regardless of the .kmn rules — delete it, and neutralize the id
            // to an inert `T_carved_*` id so a `K_` id can't fall back to its
            // underlying .kmn rule and silently emit a different character
            // under a now-blank cap (mirrors the U_-id neutralization below;
            // the key element itself is always kept — never remove keys/rows/
            // layers).
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
          }

          // Popup entries: remove outright (no layout-stability concern).
          for (const prop of ["sk", "multitap"] as const) {
            const arr = keyObj[prop];
            if (!Array.isArray(arr)) continue;
            const kept = arr.filter((e) => !e || typeof e !== "object" || !matchesCarved(e));
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
              if (e && typeof e === "object" && matchesCarved(e)) {
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
      }
    }
  }

  if (changed) {
    vfs.set(touchPath, JSON.stringify(data, null, 2), false);
  }
}
