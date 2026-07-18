/**
 * Desktop base-layout fall-through resolution (spec 040).
 *
 * On desktop, a physical key a keyboard does not remap falls through to the OS
 * base layout. A non-Latin keyboard that leaves alphabetic keys un-named
 * therefore emits a small sliver of base-layout (Latin) output that the
 * `script` classifier's rule-only histogram (`buildProducedSet`) misses. This
 * module computes, deterministically and tool-locally, which base-layout keys
 * leak and what character they leak.
 *
 * Design decisions (see specs/040-.../research.md):
 *  - The leak source is ALWAYS the host-environment default `kbdus`. Upstream
 *    (`../keyman`) confirms `baselayout('...')` is a context TEST against a
 *    host-supplied `&baselayout` environment store (default `kbdus.dll`), not a
 *    keyboard-settable declaration — a keyboard cannot declare its own base
 *    layout, it can only branch on the active one. So any `baselayout('...')`
 *    context is recorded as an audit hint (`branchesOn`) only, never a
 *    leak-source override.
 *  - "Named" (and therefore non-leaking) = some base-layer rule context names
 *    the vkey. This covers remaps, `> nul` blocks, guarded, and group-routed
 *    rules uniformly: any rule that names the vkey removes it from fall-through.
 *  - The table is tool-owned pinned data, not an import of the engine's
 *    `US_UNSHIFTED` map: the leak-source table must be a checked-in,
 *    sha256-pinnable reference-data file (recorded in the index manifest's
 *    `referencePins` for deterministic freshness auditing), and a TS constant
 *    imported from the engine cannot serve as pinned reference data.
 *
 * No IR/codec/`buildProducedSet` change: this reads existing IR context signals
 * (vkey + baselayout context elements) only.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import type { KeyboardIR } from "@keyboard-studio/contracts";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_LAYOUTS_PATH = resolve(HERE, "data", "base-layouts.json");

/** The host-environment default base layout — the only leak source in v1. */
export const DEFAULT_BASELAYOUT = "kbdus";

// ---------------------------------------------------------------------------
// Pinned-table loader
// ---------------------------------------------------------------------------

/** `family -> (vkey -> unshifted char)`, from the pinned `base-layouts.json`. */
export type BaseLayoutTable = Map<string, Map<string, string>>;

let cachedTable: BaseLayoutTable | undefined;

/**
 * A value is a valid base-layout character iff it is exactly one BMP codepoint
 * and not a C0 control, DEL, or SPACE (contract §1). Fails loud otherwise so a
 * malformed pinned table can never silently leak a control character.
 */
function isValidBaseLayoutChar(value: string): boolean {
  if ([...value].length !== 1) return false;
  const cp = value.codePointAt(0);
  if (cp === undefined) return false;
  if (cp > 0xffff) return false; // must be BMP
  if (cp < 0x20 || cp === 0x7f) return false; // no C0 control / DEL
  if (cp === 0x20) return false; // no SPACE
  return true;
}

/**
 * Load and validate the pinned `data/base-layouts.json` into a
 * `Map<family, Map<vkey, char>>`. Cached after the first read (pure data, no
 * environment dependency). Throws on any non-BMP/control/space value.
 *
 * `path`, when provided, bypasses the module cache and loads/validates that
 * file directly instead of the pinned `base-layouts.json` — a test hook for
 * exercising the fail-loud validation path against a fixture file. Default
 * (no-arg) behavior is unchanged.
 */
export function loadBaseLayoutTable(path?: string): BaseLayoutTable {
  if (path === undefined && cachedTable !== undefined) return cachedTable;

  const raw = JSON.parse(readFileSync(path ?? BASE_LAYOUTS_PATH, "utf8")) as Record<
    string,
    Record<string, string>
  >;

  const table: BaseLayoutTable = new Map();
  for (const [family, vkeyMap] of Object.entries(raw)) {
    const normalizedFamily = family.toLowerCase();
    const charByVkey = new Map<string, string>();
    for (const [vkey, char] of Object.entries(vkeyMap)) {
      if (!isValidBaseLayoutChar(char)) {
        throw new Error(
          `base-layouts.json: family "${family}" vkey "${vkey}" has an invalid ` +
            `base-layout character ${JSON.stringify(char)} (must be a single BMP ` +
            `non-control, non-space codepoint)`,
        );
      }
      charByVkey.set(vkey, char);
    }
    table.set(normalizedFamily, charByVkey);
  }

  if (path === undefined) cachedTable = table;
  return table;
}

// ---------------------------------------------------------------------------
// Base-layer predicate (re-expressed locally to keep this tool's
// classification logic self-contained; see packages/engine/src/placement/
// filters.ts's isBaseLayer for the engine's equivalent predicate)
// ---------------------------------------------------------------------------

/**
 * Accept predicate for the unshifted base layer: real keyboards encode it with
 * the NCAPS (caps-lock-off) modifier, so accept NCAPS-only alongside bare
 * rules; reject SHIFT/CAPS/AltGr layers. Mirrors `isBaseLayer` in the engine's
 * placement filters, re-expressed locally rather than imported.
 */
function isBaseLayerModifiers(modifiers: string[]): boolean {
  return !modifiers.some((m) => m !== "NCAPS");
}

// ---------------------------------------------------------------------------
// Resolution + leak detection
// ---------------------------------------------------------------------------

/** The result of resolving which base layout applies (data-model Entity 2). */
export interface BaseLayoutResolution {
  /** The leak-source family. Always `"kbdus"` (the environment default) in v1. */
  family: string;
  /** The family's vkey -> character map (from the pinned table). */
  charByVkey: Map<string, string>;
  /**
   * Distinct non-empty `baselayout('...')` context-guard values found in the
   * rules (normalized lowercase, sorted) — an audit hint for `notes` only. Does
   * NOT change the leak source (a guard is a conditional test, not a
   * declaration).
   */
  branchesOn: string[];
}

/**
 * Resolve the leak-source base layout for one keyboard. The family is always
 * the environment default (`kbdus`); `branchesOn` records any base-layout
 * branch guards the rules carry, for the `notes` audit hint.
 */
export function resolveBaseLayout(ir: KeyboardIR): BaseLayoutResolution {
  const table = loadBaseLayoutTable();
  const charByVkey = table.get(DEFAULT_BASELAYOUT) ?? new Map<string, string>();

  const branches = new Set<string>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.context) {
        if (el.kind === "baselayout" && el.value.trim() !== "") {
          branches.add(el.value.trim().toLowerCase());
        }
      }
    }
  }

  return {
    family: DEFAULT_BASELAYOUT,
    charByVkey,
    branchesOn: [...branches].sort(),
  };
}

/**
 * The set of vkeys named by ANY base-layer rule context — a base-layer element
 * being a `{ kind: "vkey"; name }` whose modifiers are empty or `NCAPS`-only.
 * A named vkey never leaks (it is remapped, `> nul`-blocked, guarded, or
 * group-routed — all forms of "the keyboard handles this key").
 */
export function namedBaseLayerVkeys(ir: KeyboardIR): Set<string> {
  const named = new Set<string>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.context) {
        if (el.kind === "vkey" && isBaseLayerModifiers(el.modifiers)) {
          named.add(el.name);
        }
      }
    }
  }
  return named;
}

/**
 * Whether the IR carries at least one base-layer physical-key rule — the
 * explicit desktop-vs-touch-only signal the classifier's no-op guard keys on
 * (spec 040 T012). `leakedChars` emptiness alone cannot express this: a
 * touch-only IR names no base-layer vkey and therefore leaks the FULL alphabet,
 * so the classifier must consult this predicate BEFORE `leakedChars`.
 */
export function hasBaseLayerRuleSurface(ir: KeyboardIR): boolean {
  return namedBaseLayerVkeys(ir).size > 0;
}

/**
 * The leaked (un-blocked) base-layout characters for this keyboard: for each
 * vkey in the resolved family's table that NO base-layer rule context names,
 * the table's character. Remaps, `> nul` blocks, guarded, and group-routed
 * rules all count as "named" and therefore never leak.
 *
 * Note: for a touch-only IR (no base-layer rules) this returns the full
 * `K_A`…`K_Z` alphabet — suppression of that is a classifier-layer concern that
 * gates on `hasBaseLayerRuleSurface` (T012), not this pure helper.
 */
export function leakedChars(ir: KeyboardIR): string[] {
  const { charByVkey } = resolveBaseLayout(ir);
  const named = namedBaseLayerVkeys(ir);
  const leaked: string[] = [];
  for (const [vkey, char] of charByVkey) {
    if (!named.has(vkey)) leaked.push(char);
  }
  return leaked;
}
