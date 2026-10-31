/**
 * findOe2SoleSourceGlyphs — glyphs whose ONLY way to be typed on a desktop
 * keyboard is the oe2 key (Keyman K_oE2, the OEM 102 key).
 *
 * The fact behind the warning (Matthew, on the issue this implements): in
 * Keyman the only difference between an ANSI (US-style) and an ISO
 * (European-style) physical keyboard is this one extra key, sitting beside
 * the left Shift key. ANSI hardware does not have it at all. A glyph placed
 * on oe2 and nowhere else is therefore unreachable for a typist on ANSI
 * hardware — the classic case is a French speaker with a US laptop and
 * AZERTY stickers: the stickers relabel the keys that exist, but they do
 * not add this one.
 *
 * Definition (narrow on purpose — a warning that cries wolf gets ignored):
 * a glyph is oe2-sole-source when
 *   - at least one producing rule sits on K_oE2 (any layer / modifier
 *     combination — the vkey element carries the modifiers, and every
 *     modifier variant of the key is equally absent on ANSI), AND
 *   - it appears in no other rule's output, and no other route produces
 *     it either. Routes that count, and so suppress the warning:
 *       * a rule whose keystroke is any other vkey (including a deadkey
 *         sequence's final rule — its keystroke is the second key, so a
 *         glyph typed as deadkey-then-K_A is reachable),
 *       * a per-slot store fan-out slot whose trigger item is any other
 *         vkey or a typed character,
 *       * a touch-layout key output (base key, longpress subkey, flick or
 *         multitap — the touch surface has no ANSI/ISO distinction),
 *       * an opaque fragment's producedOutput sketch (its keystroke
 *         cannot be read, so it is never attributed to oe2).
 *   Rules whose context directly contains K_BKSP are backspace corrections,
 *   not typing routes (the buildSessionProducedSet precedent — they are
 *   excluded from route attribution entirely, so a correction rule neither
 *   counts as an oe2 route nor suppresses a real warning).
 *
 * Per-rule output glyphs are computed with the canonical produced-set walk
 * (collectFromElements from @keyboard-studio/contracts — run-merge NFC,
 * store resolution, control/space filtering), the same semantics
 * buildProducedSet and buildSessionProducedSet answer with, so this
 * detector can never disagree with them about what a rule emits.
 *
 * Pure: no store reads, no I/O, no mutation of the input IR.
 */

import type {
  ContextElement,
  IRStore,
  KeyboardIR,
  MechanismAssignment,
  OutputElement,
  Pattern,
  TouchKeyIR,
} from "@keyboard-studio/contracts";
import {
  collectFromElements,
  contextHasDirectBackspace,
  isPlusSeparator,
} from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { applyAssignments } from "./applyAssignments.js";

/** True when a vkey name denotes the oe2 key, in either spelling the repo carries. */
export function isOe2VkeyName(name: string): boolean {
  const upper = name.toUpperCase();
  return upper === "K_OE2" || upper === "K_OEM_102";
}

type RouteKind = "oe2" | "other";

interface GlyphRoutes {
  oe2: boolean;
  other: boolean;
}

/** The keystroke side of a rule: the elements after the last + separator, or the whole context when there is none. */
function triggerSegment(context: readonly ContextElement[]): readonly ContextElement[] {
  let lastPlus = -1;
  context.forEach((el, i) => {
    if (isPlusSeparator(el)) lastPlus = i;
  });
  return lastPlus === -1 ? context : context.slice(lastPlus + 1);
}

/** Glyphs one output-element sequence produces, under the canonical produced-set walk. */
function glyphsOf(
  output: readonly OutputElement[],
  storeMap: Map<string, IRStore>,
): Set<string> {
  const collector = new Set<string>();
  collectFromElements(output, storeMap, collector, false);
  return collector;
}

/**
 * Per-slot fan-out attribution for one index() output element whose context
 * position holds an any() element: slot i of the output store is produced
 * when the any() store's slot i is what was typed, so the glyph in slot i
 * inherits slot i's trigger item as its route. Returns false when the
 * element is not that shape (the caller then falls back to a whole-rule
 * route for its glyphs).
 */
function attributeFanOutSlots(
  el: Extract<OutputElement, { kind: "index" }>,
  rule: { context: readonly ContextElement[] },
  storeMap: Map<string, IRStore>,
  addRoute: (glyph: string, route: RouteKind) => void,
): boolean {
  const effCtx = rule.context.filter((c) => !isPlusSeparator(c));
  const baseEl = effCtx[el.offset - 1];
  if (baseEl === undefined || baseEl.kind !== "any") return false;
  const triggerStore = storeMap.get(baseEl.storeRef);
  const outStore = storeMap.get(el.storeRef);
  if (triggerStore === undefined || outStore === undefined) return false;

  const len = Math.min(triggerStore.items.length, outStore.items.length);
  for (let i = 0; i < len; i++) {
    const outItem = outStore.items[i];
    if (outItem === undefined || outItem.kind !== "char") continue;
    const glyphs = new Set<string>();
    collectFromElements([{ kind: "char", value: outItem.value }], storeMap, glyphs, false);
    const triggerItem = triggerStore.items[i];
    const route: RouteKind =
      triggerItem !== undefined && triggerItem.kind === "vkey" && isOe2VkeyName(triggerItem.name)
        ? "oe2"
        : "other";
    for (const glyph of glyphs) addRoute(glyph, route);
  }
  return true;
}

/** Every glyph a touch key (and its longpress / flick / multitap children) emits, per codepoint. */
function collectTouchKeyGlyphs(key: TouchKeyIR, addRoute: (glyph: string, route: RouteKind) => void): void {
  if (key.output !== undefined) {
    for (const glyph of key.output.normalize("NFC")) {
      const cp = glyph.codePointAt(0);
      if (cp !== undefined && cp > 0x1f && cp !== 0x7f && cp !== 0x20) {
        addRoute(glyph, "other");
      }
    }
  }
  for (const sub of key.sk ?? []) collectTouchKeyGlyphs(sub, addRoute);
  for (const sub of key.multitap ?? []) collectTouchKeyGlyphs(sub, addRoute);
  if (key.flick !== undefined) {
    for (const sub of Object.values(key.flick)) {
      if (sub !== undefined) collectTouchKeyGlyphs(sub, addRoute);
    }
  }
}

/**
 * The glyphs (single NFC codepoints, sorted by codepoint) that the given IR
 * produces ONLY via the oe2 key. See the module doc for the exact definition.
 */
export function findOe2SoleSourceGlyphs(ir: KeyboardIR): string[] {
  const storeMap = new Map<string, IRStore>(ir.stores.map((s) => [s.name, s]));
  const routes = new Map<string, GlyphRoutes>();
  const addRoute = (glyph: string, route: RouteKind): void => {
    let entry = routes.get(glyph);
    if (entry === undefined) {
      entry = { oe2: false, other: false };
      routes.set(glyph, entry);
    }
    entry[route] = true;
  };

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      // Backspace-correction rules are not typing routes (see module doc).
      if (contextHasDirectBackspace(rule.context)) continue;
      const glyphs = glyphsOf(rule.output, storeMap);
      if (glyphs.size === 0) continue;

      const segment = triggerSegment(rule.context);
      const vkeys = segment.filter(
        (el): el is Extract<ContextElement, { kind: "vkey" }> => el.kind === "vkey",
      );

      if (vkeys.length > 0) {
        // The keystroke is a named vkey (any modifier variant). A deadkey
        // sequence's final rule lands here too: its keystroke is the second
        // key pressed, which is what decides reachability.
        const route: RouteKind = vkeys.every((el) => isOe2VkeyName(el.name)) ? "oe2" : "other";
        for (const glyph of glyphs) addRoute(glyph, route);
        continue;
      }

      // No vkey keystroke: the only attributable shape left is a store
      // fan-out, where the keystroke is an any() over a key store and each
      // output slot has its own trigger item. Glyphs no fan-out element
      // attributes (literal outputs, outs(), unresolvable index shapes, and
      // every glyph of a rule with no fan-out at all) are conservatively an
      // "other" route: an unattributable producer is never blamed on oe2.
      const attributed = new Set<string>();
      const trackingAddRoute = (glyph: string, route: RouteKind): void => {
        attributed.add(glyph);
        addRoute(glyph, route);
      };
      for (const el of rule.output) {
        if (el.kind === "index") {
          attributeFanOutSlots(el, rule, storeMap, trackingAddRoute);
        }
      }
      for (const glyph of glyphs) {
        if (!attributed.has(glyph)) addRoute(glyph, "other");
      }
    }
  }

  // Touch routes: any glyph a touch key emits (longpress included) is
  // reachable on the touch surface, which has no missing-key problem.
  if (ir.touchLayout !== undefined) {
    for (const platform of ir.touchLayout.platforms) {
      for (const layer of platform.layers) {
        for (const row of layer.rows) {
          for (const key of row.keys) collectTouchKeyGlyphs(key, addRoute);
        }
      }
    }
  }

  // Opaque fragments: their produced glyphs cannot be attributed to a
  // keystroke, so they count as another route, never as an oe2 route.
  for (const frag of ir.raw) {
    if (frag.producedOutput !== undefined) {
      for (const glyph of glyphsOf(frag.producedOutput, storeMap)) {
        addRoute(glyph, "other");
      }
    }
  }

  const soleSource: string[] = [];
  for (const [glyph, entry] of routes) {
    if (entry.oe2 && !entry.other) soleSource.push(glyph);
  }
  soleSource.sort((a, b) => {
    const byCodePoint = (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0);
    return byCodePoint !== 0 ? byCodePoint : a < b ? -1 : a > b ? 1 : 0;
  });
  return soleSource;
}

/**
 * The session-aware variant, mirroring buildSessionProducedSet's mandated
 * route exactly: this session's physical mechanism assignments are injected
 * into the base source (applyAssignments), the result is parsed back into a
 * preview IR, and the detector runs over that IR — so a glyph the author
 * placed on oe2 during this session is judged on the keyboard actually
 * being built, not only on the pristine base. With no physical assignments
 * the round trip is skipped. Never throws: on any failure of the round
 * trip it falls back to the base-only detector and logs a dev-only warning,
 * exactly as buildSessionProducedSet does.
 */
export function findSessionOe2SoleSourceGlyphs(
  startIr: KeyboardIR,
  assignments: ReadonlyArray<MechanismAssignment>,
  getPattern: (id: string) => Pattern | undefined,
): string[] {
  const physical = assignments.filter((a) => a.modality === "physical");
  if (physical.length === 0) {
    return findOe2SoleSourceGlyphs(startIr);
  }

  try {
    const baseKmn = emit(startIr);
    const { kmn: previewKmn } = applyAssignments(physical, getPattern, baseKmn);
    const previewIr = parse(previewKmn, startIr.header.keyboardId).ir;
    return findOe2SoleSourceGlyphs(previewIr);
  } catch (err) {
    devLog.warn(
      `[findSessionOe2SoleSourceGlyphs] session preview round-trip failed (${String(err)}); falling back to base-only detection`,
    );
    return findOe2SoleSourceGlyphs(startIr);
  }
}
