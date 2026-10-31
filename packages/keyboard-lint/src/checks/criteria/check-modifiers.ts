// Check 7.4 — KM_LINT_MODIFIER_NAME_INCONSISTENT (spec 084 Batch 2).
//
// "Modifier key names consistent across .kmn, .kvks, and
// .keyman-touch-layout — e.g. if the .kmn uses RALT, the .kvks is RALT
// and the touch layout is rightalt, not a mix of ALT / alt in some
// files." (source review text)
//
// The three files encode modifier states in three vocabularies, so the
// check is built on the explicit normalization map below — the map IS
// the deliverable: every spelling any of the three sources can produce
// is mapped to a canonical (family, side) atom, and the sources are
// inconsistent iff, for one modifier family, they do not agree on the
// side. A family used by only one source has nothing to disagree with.
//
//   family: "shift" | "ctrl" | "alt" | "caps"
//   side:   "left" | "right" | "any"   ("any" = the unsided name: ALT,
//           CTRL, SHIFT — the prose's example of a mix is exactly an
//           unsided ALT in one file against RALT/rightalt in another)
//
// Vocabulary sources:
//   .kmn   — the codec's vkey-bracket modifier tokens, carried on IR
//            rule contexts (KNOWN_VKEY_MODIFIERS in the engine codec):
//            SHIFT RSHIFT CTRL LCTRL RCTRL ALT LALT RALT CAPS NCAPS.
//            NCAPS is a state NEGATION ("caps lock off"), not a
//            modifier name, and is deliberately unmapped.
//   .kvks  — the <layer shift="..."> codes: a compact string over
//            S/C/A (shift/ctrl/alt), each optionally prefixed by L or R
//            for the left/right variant ("S", "LC", "RA", "SRA").
//            The empty string is the unshifted layer.
//   touch  — layer ids composed of words joined by "-": "default"
//            (no modifiers), "shift", "caps", "leftctrl", "rightalt",
//            "rightalt-shift", ... Non-modifier layer names ("symbol",
//            "numeric", custom names) are not modifier spellings and
//            contribute nothing.

import type {
  KeyboardIR,
  KvksIR,
  LintFinding,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
  kmnPath,
} from "./_shared.js";

export type ModifierFamily = "shift" | "ctrl" | "alt" | "caps";
export type ModifierSide = "left" | "right" | "any";

export interface ModifierAtom {
  family: ModifierFamily;
  side: ModifierSide;
}

/** The .kmn vocabulary: vkey-bracket token -> canonical atom. */
export const KMN_MODIFIER_MAP: Readonly<Record<string, ModifierAtom>> = {
  SHIFT: { family: "shift", side: "any" },
  RSHIFT: { family: "shift", side: "right" },
  CTRL: { family: "ctrl", side: "any" },
  LCTRL: { family: "ctrl", side: "left" },
  RCTRL: { family: "ctrl", side: "right" },
  ALT: { family: "alt", side: "any" },
  LALT: { family: "alt", side: "left" },
  RALT: { family: "alt", side: "right" },
  CAPS: { family: "caps", side: "any" },
};

/** The touch-layout vocabulary: layer-id word -> canonical atom. */
export const TOUCH_MODIFIER_MAP: Readonly<Record<string, ModifierAtom>> = {
  shift: { family: "shift", side: "any" },
  leftshift: { family: "shift", side: "left" },
  rightshift: { family: "shift", side: "right" },
  ctrl: { family: "ctrl", side: "any" },
  leftctrl: { family: "ctrl", side: "left" },
  rightctrl: { family: "ctrl", side: "right" },
  alt: { family: "alt", side: "any" },
  leftalt: { family: "alt", side: "left" },
  rightalt: { family: "alt", side: "right" },
  altgr: { family: "alt", side: "right" },
  caps: { family: "caps", side: "any" },
};

const KVKS_BASE: Readonly<Record<string, ModifierFamily>> = {
  S: "shift",
  C: "ctrl",
  A: "alt",
};

/**
 * The .kvks vocabulary: one <layer shift="..."> code -> its atoms.
 * Returns null when the code contains anything outside the S/C/A codes
 * with L/R prefixes — such a layer's spelling is unreadable, so it
 * contributes no atoms rather than a guessed reading.
 */
export function kvksShiftAtoms(shift: string): ModifierAtom[] | null {
  const atoms: ModifierAtom[] = [];
  let i = 0;
  while (i < shift.length) {
    const ch = shift[i]!;
    if (ch === "L" || ch === "R") {
      const base = shift[i + 1];
      if (base === undefined || KVKS_BASE[base] === undefined) return null;
      atoms.push({
        family: KVKS_BASE[base]!,
        side: ch === "L" ? "left" : "right",
      });
      i += 2;
      continue;
    }
    const family = KVKS_BASE[ch];
    if (family === undefined) return null;
    atoms.push({ family, side: "any" });
    i += 1;
  }
  return atoms;
}

/** Per-source modifier usage: per family, the sides + raw spellings seen. */
interface SourceUsage {
  byFamily: Map<ModifierFamily, { sides: Set<ModifierSide>; spellings: Set<string> }>;
}

function record(
  usage: SourceUsage,
  atom: ModifierAtom,
  spelling: string,
): void {
  let entry = usage.byFamily.get(atom.family);
  if (entry === undefined) {
    entry = { sides: new Set(), spellings: new Set() };
    usage.byFamily.set(atom.family, entry);
  }
  entry.sides.add(atom.side);
  entry.spellings.add(spelling);
}

function kmnUsage(ir: KeyboardIR): SourceUsage {
  const usage: SourceUsage = { byFamily: new Map() };
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.context) {
        if (el.kind !== "vkey") continue;
        for (const mod of el.modifiers) {
          const atom = KMN_MODIFIER_MAP[mod.toUpperCase()];
          if (atom !== undefined) record(usage, atom, mod.toUpperCase());
        }
      }
    }
  }
  return usage;
}

function kvksUsage(kvks: KvksIR): SourceUsage {
  const usage: SourceUsage = { byFamily: new Map() };
  for (const layer of kvks.layers) {
    const atoms = kvksShiftAtoms(layer.shift);
    if (atoms === null) continue;
    for (const atom of atoms) record(usage, atom, layer.shift);
  }
  return usage;
}

function touchUsage(touchLayout: TouchLayoutIR): SourceUsage {
  const usage: SourceUsage = { byFamily: new Map() };
  for (const platform of touchLayout.platforms) {
    for (const layer of platform.layers) {
      for (const word of layer.id.toLowerCase().split("-")) {
        const atom = TOUCH_MODIFIER_MAP[word];
        if (atom !== undefined) record(usage, atom, layer.id);
      }
    }
  }
  return usage;
}

const FAMILY_LABEL: Readonly<Record<ModifierFamily, string>> = {
  shift: "Shift",
  ctrl: "Ctrl",
  alt: "Alt",
  caps: "Caps",
};

/**
 * 7.4 — for each modifier family, the sources that use it must agree on
 * the side; a mix (unsided in one file, sided in another, or left in
 * one and right in another) → one finding per disagreeing family.
 */
export function checkModifierNamesConsistent(input: {
  ir: KeyboardIR;
  kvks?: KvksIR;
  touchLayout?: TouchLayoutIR;
}): CheckResult {
  const code = "KM_LINT_MODIFIER_NAME_INCONSISTENT";
  const sources: Array<{ name: string; usage: SourceUsage }> = [
    { name: ".kmn", usage: kmnUsage(input.ir) },
  ];
  if (input.kvks !== undefined) {
    sources.push({ name: ".kvks", usage: kvksUsage(input.kvks) });
  }
  if (input.touchLayout !== undefined) {
    sources.push({ name: "touch layout", usage: touchUsage(input.touchLayout) });
  }

  const offenderFindings: LintFinding[] = [];
  const verified: string[] = [];
  for (const family of Object.keys(FAMILY_LABEL) as ModifierFamily[]) {
    const present = sources.filter((s) => s.usage.byFamily.has(family));
    if (present.length === 0) continue;
    const spellings = present
      .map(
        (s) =>
          `${s.name}: ${[...s.usage.byFamily.get(family)!.spellings].sort().join(", ")}`,
      )
      .join("; ");
    if (present.length < 2) {
      verified.push(`${FAMILY_LABEL[family]}: ${spellings} — single source, nothing to compare.`);
      continue;
    }
    const allSides = new Set<ModifierSide>();
    for (const s of present) {
      for (const side of s.usage.byFamily.get(family)!.sides) allSides.add(side);
    }
    if (allSides.size < 2) {
      verified.push(`${FAMILY_LABEL[family]}: ${spellings} — consistent.`);
      continue;
    }
    const detail = present
      .map(
        (s) =>
          `${s.name} uses ${[...s.usage.byFamily.get(family)!.spellings].sort().join(", ")}`,
      )
      .join("; ");
    offenderFindings.push(
      criteriaFinding({
        code: "KM_LINT_MODIFIER_NAME_INCONSISTENT",
        file: kmnPath(input.ir.header.keyboardId),
        message: `Modifier names for ${FAMILY_LABEL[family]} are inconsistent across the keyboard sources: ${detail}.`,
        hint: `Use the same ${FAMILY_LABEL[family]} modifier name in the .kmn, the .kvks, and the touch layout (e.g. RALT in the .kmn, RA in the .kvks, rightalt in the touch layout).`,
      }),
    );
  }
  if (offenderFindings.length > 0) return checkFailed(code, offenderFindings);
  if (verified.length === 0)
    return checkPassed(code, ["No modifier keys used in any source."]);
  return checkPassed(code, verified);
}
