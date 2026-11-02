// Deterministic key and marker ids for the LDML export (spec 108, FR-030).
//
// Ids come from content only: never from time, and never from traversal order.
// Every key id matches [A-Za-z0-9][A-Za-z0-9_-]*.

export const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const MARKER_ID_PATTERN = /^[0-9A-Za-z_]{1,32}$/;

/** The id LDML gives a gap key. */
export const GAP_KEY_ID = "gap";

const MARKER_MAX = 32;

/** The implied id for a key whose whole output is `output`, if it has one. */
export function impliedKeyId(output: string): string | undefined {
  if (/^[A-Za-z0-9]$/.test(output)) return output;
  if (output === " ") return "space";
  return undefined;
}

function hexOf(cp: number): string {
  return cp.toString(16).toLowerCase();
}

/** `u` + the lowercase hex code points joined by `_`. */
export function outputKeyId(output: string): string {
  const parts: string[] = [];
  for (const ch of output) parts.push(hexOf(ch.codePointAt(0) ?? 0));
  return `u${parts.join("_")}`;
}

/** Injective encoding of any text to [0-9A-Za-z_]: other characters become _<hex>_. */
function encodeIdent(text: string): string {
  let out = "";
  for (const ch of text) {
    out += /^[0-9A-Za-z]$/.test(ch) ? ch : `_${hexOf(ch.codePointAt(0) ?? 0)}_`;
  }
  return out;
}

/**
 * The marker id used inside the marker reference: [0-9A-Za-z_]{1,32}. Injective
 * while the encoding fits; a longer one is cut to 32 and may then collide, which
 * {@link resolveMarkerIds} repairs.
 */
export function markerId(marker: string): string {
  const enc = encodeIdent(marker);
  return enc === "" ? "_" : enc.slice(0, MARKER_MAX);
}

/** `m_<marker>`. */
export function markerKeyId(marker: string): string {
  return `m_${encodeIdent(marker)}`;
}

/** `l_<layer>`; characters outside [A-Za-z0-9-] are hex-encoded. */
export function layerKeyId(layer: string): string {
  let out = "";
  for (const ch of layer) {
    out += /^[A-Za-z0-9-]$/.test(ch) ? ch : `_${hexOf(ch.codePointAt(0) ?? 0)}_`;
  }
  return `l_${out}`;
}

/** Order two strings by code point (not UTF-16 unit), the order FR-030 fixes. */
export function compareCodePoints(a: string, b: string): number {
  const x = Array.from(a, (ch) => ch.codePointAt(0) ?? 0);
  const y = Array.from(b, (ch) => ch.codePointAt(0) ?? 0);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

export interface IdRequest {
  /** A stable identity for the thing being named (its output text, marker name, layer name). */
  readonly source: string;
  /** The id it would like, before collision resolution. */
  readonly id: string;
}

function resolve(requests: readonly IdRequest[], maxLen: number): Map<string, string> {
  const sorted = [...requests].sort(
    (a, b) => compareCodePoints(a.id, b.id) || compareCodePoints(a.source, b.source),
  );
  const claimed = new Set<string>();
  const result = new Map<string, string>();
  for (const r of sorted) {
    if (result.has(r.source) || claimed.has(r.id)) continue;
    claimed.add(r.id);
    result.set(r.source, r.id);
  }
  for (const r of sorted) {
    if (result.has(r.source)) continue;
    let n = 2;
    const make = (k: number): string => {
      const suffix = `_${k}`;
      return `${r.id.slice(0, maxLen - suffix.length)}${suffix}`;
    };
    let candidate = make(n);
    while (claimed.has(candidate)) candidate = make(++n);
    claimed.add(candidate);
    result.set(r.source, candidate);
  }
  return result;
}

/**
 * Resolve collisions among requested key ids. Sources are sorted by code point,
 * the first source for an id keeps it, and later ones get `_2`, `_3`, ...
 * skipping any id some source asked for or already holds. The result depends
 * only on the set of requests, not on their order. Repeated sources share an id.
 */
export function resolveIds(requests: readonly IdRequest[]): Map<string, string> {
  return resolve(requests, Number.MAX_SAFE_INTEGER);
}

/** As {@link resolveIds} for marker ids, keeping each within 32 characters. */
export function resolveMarkerIds(markers: readonly string[]): Map<string, string> {
  return resolve(
    markers.map((m) => ({ source: m, id: markerId(m) })),
    MARKER_MAX,
  );
}
