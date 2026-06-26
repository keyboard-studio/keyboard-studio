/**
 * Canonical `.keyman-touch-layout` JSON parser (issue #354).
 *
 * The touch layout file is a JSON object with one or more platform keys
 * (desktop, tablet, phone). Each platform has a `layer` array; each layer has a
 * `row` array; each row has a `key` array. Keys nest recursively via `sk`
 * (longpress sub-keys), `multitap` (tap-cycle), and `flick` (directional
 * gestures).
 *
 * This is the single source of truth shared by the engine codec (round-trip,
 * via {@link parseTouchLayoutString}) and the keyboard-lint package (via the
 * VFS adapter {@link parseTouchLayoutFromVfs}). It lives in `contracts` — the
 * dependency root — because Layer C (keyboard-lint) must not import the engine
 * (spec §10), so the shared parser cannot live there.
 *
 * The parser is intentionally lenient about unknown fields (ignored) and maps
 * every typed field now on `TouchKeyIR` (`sp`, `width`, `pad`, `hint`,
 * `output`, `nextlayer`, `sk`, `multitap`, `flick`). It does NOT validate the
 * layout for correctness — that is the lint checks' job.
 */

import type { TouchLayoutIR, TouchKeyIR, IRNodeRef, TouchKeyProvenance } from "./keyboard-ir";
import type { VirtualFS } from "./virtualFS";

// TextDecoder is a runtime global in both Node and the browser, but contracts'
// tsconfig lib (ES2022) does not declare it. Minimal ambient declaration so the
// VFS byte-decoding path type-checks without pulling DOM/Node libs into the
// dependency root.
declare const TextDecoder: {
  new (): { decode(input: Uint8Array): string };
};

// ---------------------------------------------------------------------------
// Raw JSON shapes (non-exhaustive — only the fields we map)
// ---------------------------------------------------------------------------

interface RawKey {
  id?: string;
  text?: string;
  output?: string;
  nextlayer?: string;
  hint?: string;
  sk?: RawKey[];
  multitap?: RawKey[];
  flick?: Record<string, RawKey>;
  /** Wire format encodes sp as a JSON string (e.g. `"sp": "1"`); also accept a number. */
  sp?: string | number;
  /** Wire format encodes width as a JSON string (e.g. `"width": "100"`); also accept a number. */
  width?: string | number;
  /** Wire format encodes pad as a JSON string (e.g. `"pad": "50"`); also accept a number. */
  pad?: string | number;
  /**
   * Per-key provenance (spec-014 FR-008/-010). Non-standard `.keyman-touch-layout`
   * property; ignored by kmcmplib's reader. Absent/legacy ⇒ `"hand-set"`.
   */
  p?: string;
  [key: string]: unknown;
}

interface RawRow {
  id?: number;
  key?: RawKey[];
}

interface RawLayer {
  id?: string;
  row?: RawRow[];
}

interface RawPlatform {
  layer?: RawLayer[];
  displayUnderlying?: boolean;
  font?: string;
}

type RawTouchLayout = Record<string, RawPlatform>;

const PLATFORM_ORDER = ["desktop", "tablet", "phone"] as const;

// Keyman defines exactly these 8 compass flick directions. The parser
// intentionally restricts to them (unlike the older lint parser, which mapped
// every raw.flick entry): a non-standard direction — and any `nextlayer` it
// carries — is deliberately dropped rather than surfaced. On valid corpus this
// is unreachable; the tightening only affects malformed/non-standard input,
// where dropping a bogus direction (incl. its check-18-5 reachability) is correct.
const FLICK_DIRECTIONS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;

// ---------------------------------------------------------------------------
// Provenance wire field (spec-014 US3 / T028, FR-008/-009/-010)
// ---------------------------------------------------------------------------
//
// Per-key touch provenance (TouchKeyIR.provenance) must survive the codec
// round-trip so the no-clobber re-propagation rule (US2) has a durable source.
// The `.keyman-touch-layout` JSON key object does NOT reserve a `"p"` property
// in the Keyman touch-layout schema, and kmcmplib's TouchLayoutFileReader
// ignores properties it does not recognise, so writing provenance under a
// short, non-colliding `"p"` key is a NON-BREAKING addition: the standard
// Keyman parser tolerates and skips it.
//
// This canonical parser reads `p` back and validates it against the known
// provenance vocabulary; an absent / legacy / out-of-vocabulary value defaults
// to `"hand-set"` (FR-009 — conservative, never auto-clobbered). The inverse
// write lives in the engine codec's emitter (the only emit path); it imports
// {@link PROVENANCE_WIRE_KEY} from here so parse and emit share one wire key.

/** Wire-format property carrying per-key provenance in `.keyman-touch-layout`. */
export const PROVENANCE_WIRE_KEY = "p" as const;

const PROVENANCE_VALUES: ReadonlySet<string> = new Set<TouchKeyProvenance>([
  "base-derived",
  "physical-suggested",
  "hand-set",
]);

/**
 * Coerce a raw wire value to a {@link TouchKeyProvenance}. Absent, legacy, or
 * out-of-vocabulary values default to `"hand-set"` (FR-009).
 */
function readProvenance(raw: unknown): TouchKeyProvenance {
  return typeof raw === "string" && PROVENANCE_VALUES.has(raw)
    ? (raw as TouchKeyProvenance)
    : "hand-set";
}

/**
 * Returns the virtual-FS path for a keyboard's `.keyman-touch-layout` file.
 * Shared so the string is not duplicated across call sites.
 */
export function touchLayoutPath(keyboardId: string): string {
  return `source/${keyboardId}.keyman-touch-layout`;
}

/** Coerce a wire-format numeric field (string | number) to a finite number, or undefined. */
function toNumber(v: string | number | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function convertKey(raw: RawKey, nextId: () => string): TouchKeyIR {
  const key: TouchKeyIR = {
    nodeId: nextId(),
    id: raw.id ?? "",
    // Provenance is always materialised on deserialize: an absent/legacy/
    // out-of-vocabulary wire value resolves to the conservative `"hand-set"`
    // default (FR-009/T028), so the no-clobber rule always has a tag to read.
    provenance: readProvenance(raw[PROVENANCE_WIRE_KEY]),
  };
  if (raw.text !== undefined) key.text = raw.text;
  if (raw.output !== undefined) key.output = raw.output;
  if (raw.nextlayer !== undefined) key.nextlayer = raw.nextlayer;
  if (typeof raw.hint === "string" && raw.hint.length > 0) key.hint = raw.hint;

  const sp = toNumber(raw.sp);
  if (sp !== undefined) key.sp = sp;
  const width = toNumber(raw.width);
  if (width !== undefined) key.width = width;
  const pad = toNumber(raw.pad);
  if (pad !== undefined) key.pad = pad;

  if (Array.isArray(raw.sk) && raw.sk.length > 0) {
    key.sk = raw.sk.map((k) => convertKey(k, nextId));
  }
  if (Array.isArray(raw.multitap) && raw.multitap.length > 0) {
    key.multitap = raw.multitap.map((k) => convertKey(k, nextId));
  }
  if (raw.flick && typeof raw.flick === "object") {
    const flick: NonNullable<TouchKeyIR["flick"]> = {};
    for (const dir of FLICK_DIRECTIONS) {
      const fk = raw.flick[dir];
      if (fk && typeof fk === "object") flick[dir] = convertKey(fk, nextId);
    }
    key.flick = flick;
  }
  return key;
}

/**
 * Parse a `.keyman-touch-layout` JSON string into a {@link TouchLayoutIR}.
 *
 * Each platform (desktop, tablet, phone) is preserved as a separate entry in
 * `platforms`, in that fixed order. `nodeIds` is the composite index mapping
 * `platform:layer:keyid` (and `…:sk:subid`) to the minted node reference, for
 * locating keys without walking the tree. nodeIds are minted `touchKey#<n>`
 * from a per-call counter, so output is deterministic for a given input.
 *
 * @throws SyntaxError if the input is not valid JSON.
 * @throws TypeError if the JSON structure is not an object.
 */
export function parseTouchLayoutString(json: string): TouchLayoutIR {
  const raw = JSON.parse(json) as unknown;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new TypeError("Touch layout JSON must be an object");
  }
  const layout = raw as RawTouchLayout;

  let counter = 0;
  const nextId = () => `touchKey#${counter++}`;

  const platforms: TouchLayoutIR["platforms"] = [];
  const nodeIds: Array<[string, IRNodeRef]> = [];

  for (const platform of PLATFORM_ORDER) {
    const p = layout[platform];
    if (!p || !Array.isArray(p.layer)) continue;

    const layers: TouchLayoutIR["platforms"][number]["layers"] = [];
    for (const rawLayer of p.layer) {
      const id = rawLayer.id ?? "default";
      const rows: TouchLayoutIR["platforms"][number]["layers"][number]["rows"] = [];
      for (const rawRow of rawLayer.row ?? []) {
        const keys: TouchKeyIR[] = [];
        for (const rawKey of rawRow.key ?? []) {
          const key = convertKey(rawKey, nextId);
          keys.push(key);
          nodeIds.push([`${platform}:${id}:${key.id}`, { kind: "touchKey", nodeId: key.nodeId }]);
          if (key.sk) {
            for (const sk of key.sk) {
              nodeIds.push([`${platform}:${id}:${key.id}:sk:${sk.id}`, { kind: "touchKey", nodeId: sk.nodeId }]);
            }
          }
        }
        rows.push({ keys });
      }
      layers.push({ id, rows });
    }

    platforms.push({
      id: platform,
      ...(p.font !== undefined ? { font: p.font } : {}),
      layers,
    });
  }

  return { platforms, nodeIds };
}

/**
 * VFS adapter: parse the `.keyman-touch-layout` file for `keyboardId` from the
 * given {@link VirtualFS}. Returns `undefined` if the file is absent or
 * unparseable — the lenient entry point used by keyboard-lint, which must not
 * throw on malformed corpus files.
 */
export function parseTouchLayoutFromVfs(
  fs: VirtualFS,
  keyboardId: string,
): TouchLayoutIR | undefined {
  const entry = fs.get(touchLayoutPath(keyboardId));
  if (!entry) return undefined;
  try {
    const text =
      typeof entry.content === "string"
        ? entry.content
        : new TextDecoder().decode(entry.content);
    return parseTouchLayoutString(text);
  } catch {
    return undefined;
  }
}
