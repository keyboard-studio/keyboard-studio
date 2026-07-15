/**
 * touch-layout-wire-format — shared raw `.keyman-touch-layout` JSON shape
 * types, so `propagateDesktopLayersToTouch.ts` and
 * `applyTouchAssignmentsToRawJson.ts` (Case A / Case B raw-JSON touch
 * appliers) cannot drift on the wire format they both read/write.
 *
 * This is an OPTIONAL-FIELD SUPERSET of what either file previously declared
 * locally: `RawKey` carries both `output?` and `nextlayer?` (both files read
 * or clear one of these on a key), `RawPlatform` carries `defaultHint?`, and
 * `RawSubKey` carries `nextlayer?` — see each importer for which fields it
 * actually touches. Follows the precedent of touch-mechanism-shared.ts
 * (shared predicates for the same two appliers).
 *
 * Deliberately NOT used by codec/parse-touch.ts — that module's own `Raw*`
 * types serve round-trip parsing and are legitimately different (a stricter,
 * narrower shape for the codec's own IR conversion).
 *
 * @see propagateDesktopLayersToTouch.ts     — surfaces S-08 desktop-combo layers onto touch.
 * @see applyTouchAssignmentsToRawJson.ts — faithful Phase E touch-assignment editor.
 */

/** A single sub-key entry (`sk[]`/`flick{}`/`multitap[]`) in the raw JSON. */
export interface RawSubKey {
  id?: string;
  text?: string;
  output?: string;
  nextlayer?: string;
  [k: string]: unknown;
}

/** A single key object as it appears in the raw `.keyman-touch-layout` JSON. */
export interface RawKey {
  id: string;
  text?: string;
  output?: string;
  nextlayer?: string;
  sk?: RawSubKey[];
  flick?: Record<string, RawSubKey>;
  multitap?: RawSubKey[];
  [k: string]: unknown;
}

/** A row object inside a layer. */
export interface RawRow {
  id: number | string;
  key: RawKey[];
  [k: string]: unknown;
}

/** A layer object inside a platform. */
export interface RawLayer {
  id: string;
  row: RawRow[];
  [k: string]: unknown;
}

/** A platform entry in the raw JSON (e.g. "tablet", "phone", "desktop"). */
export interface RawPlatform {
  layer: RawLayer[];
  defaultHint?: string;
  [k: string]: unknown;
}

export function isRawLayer(value: unknown): value is RawLayer {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as RawLayer).id === "string" &&
    Array.isArray((value as RawLayer).row)
  );
}

export function isRawPlatform(value: unknown): value is RawPlatform {
  return !!value && typeof value === "object" && Array.isArray((value as RawPlatform).layer);
}
