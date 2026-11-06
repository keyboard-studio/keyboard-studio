// hostOccupancy — the host (OS) layout's pass-through output as an
// occupancy source (#2525).
//
// When the working IR has no rule for a slot, the keystroke falls through
// to the typist's host layout: the key still types something (usually the
// US-layout letter for that physical key). The occupancy ledger only knows
// IR rules and session assignments, so that pass-through letter was
// invisible to the displacement check and overriding it silently lost it.
//
// The host tables are the generated reference layouts
// (lib/referenceBaseLayouts.ts — derived from the Keyman "basic"
// keyboards, Windows layouts only). This module is the honest seam between
// them and the ledger: it answers ONE slot at a time, only when every
// likely host agrees.
//
// UNANIMITY, not first-host: the likely-host list can hold several layouts
// (no signal → all five), and they disagree on many keys (AZERTY K_Q is
// 'a', US K_Q is 'q'). Naming one host's letter as THE displaced glyph
// would invent a displacement the author's typists never experience. A
// slot names a host incumbent only when every likely host yields the same
// single glyph. A host that does not cover the cell, arms a deadkey there,
// or disagrees vetoes the slot — the caller treats it as unknown, never
// as a guess. With a single resolved host (the common discriminating case
// — a qwerty/qwertz/azerty answer, or a region tag) unanimity IS that
// host's table.
//
// What the reference tables model — and what they do not:
//   - base, Shift, AltGr (RightAlt, or Ctrl+Alt) and Shift+AltGr layers.
//   - CAPS/NCAPS, lone Ctrl, lone Alt and any other modifier is NOT a host
//     layer: [CAPS K_N] on a US host types 'N', not the base layer's 'n',
//     so consulting the base layer would name the wrong glyph. Such slots
//     are unknown here.
//   - A DEADKEY cell arms a host deadkey instead of producing output — no
//     glyph, so no incumbent (and a veto, not an ignore: on US-Intl
//     K_QUOTE arms a deadkey while on US it types ', so the two hosts do
//     not agree).

import {
  DEADKEY,
  REFERENCE_BASE_IDS,
  lookupHostOutput,
  type BaseLayoutId,
} from "../lib/referenceBaseLayouts.ts";
import type { HostCharFor } from "./slotOccupancy.ts";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const SHIFT_TOKENS = new Set(["SHIFT", "LSHIFT", "RSHIFT"]);
const RALT_TOKENS = new Set(["RALT", "RIGHTALT"]);
const CTRL_TOKENS = new Set(["CTRL", "LCTRL", "RCTRL"]);
const ALT_TOKENS = new Set(["ALT", "LALT"]);

function isKnownHostId(id: string): id is BaseLayoutId {
  return (REFERENCE_BASE_IDS as readonly string[]).includes(id);
}

/**
 * True when the modifier set addresses a layer the reference tables model:
 * base, Shift, AltGr (RightAlt, or Ctrl+Alt together) and Shift+AltGr.
 * A lone Ctrl or lone Alt is a shortcut layer, not a typing layer, and
 * CAPS/NCAPS address no host layer at all.
 */
function isHostModelable(modifiers: readonly string[]): boolean {
  const mods = new Set(modifiers.map((m) => m.toUpperCase()));
  for (const m of mods) {
    if (
      !SHIFT_TOKENS.has(m) &&
      !RALT_TOKENS.has(m) &&
      !CTRL_TOKENS.has(m) &&
      !ALT_TOKENS.has(m)
    ) {
      return false;
    }
  }
  const hasRalt = [...mods].some((m) => RALT_TOKENS.has(m));
  const hasCtrl = [...mods].some((m) => CTRL_TOKENS.has(m));
  const hasAlt = [...mods].some((m) => ALT_TOKENS.has(m));
  // AltGr is RightAlt, or Ctrl+Alt together.
  if ((hasCtrl || hasAlt) && !(hasRalt || (hasCtrl && hasAlt))) return false;
  return true;
}

/** One NFC grapheme, or null for a deadkey cell / multi-grapheme cell. */
function singleGlyph(cell: string): string | null {
  if (cell === DEADKEY) return null;
  const glyph = cell.normalize("NFC");
  return [...graphemes.segment(glyph)].length === 1 ? glyph : null;
}

/**
 * The host-layout lookup for a likely-host list: the glyph every host
 * agrees the slot types, or null when they disagree, a host does not cover
 * the cell, the cell arms a deadkey, or the modifiers address no host
 * layer. Unknown host ids are ignored; with none known, every slot is
 * unknown.
 */
export function hostCharForHosts(hostIds: readonly string[]): HostCharFor {
  const hosts = hostIds.filter(isKnownHostId);
  return (vkey, modifiers) => {
    if (hosts.length === 0) return null;
    if (!isHostModelable(modifiers)) return null;
    let agreed: string | null = null;
    for (const host of hosts) {
      const cell = lookupHostOutput(host, vkey, modifiers);
      if (cell === undefined) return null;
      const glyph = singleGlyph(cell);
      if (glyph === null) return null;
      if (agreed === null) agreed = glyph;
      else if (agreed !== glyph) return null;
    }
    return agreed;
  };
}
