/**
 * IRPath — a typed key-path over `KeyboardIR`.
 *
 * Canonical form: a readonly tuple of path segments (string object keys +
 * `ArrayIndex` sentinel for `[]` traversal). An invalid path is a COMPILE
 * ERROR (Design AC / G1). Because `IRPath` is *derived from* `KeyboardIR`, a
 * renamed or removed field immediately makes any path naming it non-assignable
 * (Drift AC / G2) — no codegen step to forget.
 *
 * Covers both surfaces:
 *   Physical: `header.*`, `stores[]`, `groups[].rules[].{context,output}`,
 *             `comments[]`, `raw[]`, `recognizedPatterns[]`
 *   Touch:    `touchLayout.platforms[].layers[].rows[].keys[]`
 *   Visual:   `visualKeyboard.layers[].keys[]`
 *
 * Traversal is bounded at `TouchKeyIR` — `sk`/`flick`/`multitap` (the
 * self-recursive sub-key tree) are NOT included in P2 paths (G4 / research R3).
 *
 * There is NO zod mirror for IRPath: it is a compile-time path algebra, not a
 * runtime-parsed data boundary (research R4). Do not add one to schemas.ts.
 */

import type {
  KeyboardIR,
  RawKmnFragment,
  TouchKeyIR,
  StoreItem,
  ContextElement,
  OutputElement,
} from "./keyboard-ir.js";
import type { Pattern } from "./pattern.js";

// ---------------------------------------------------------------------------
// Segment types
// ---------------------------------------------------------------------------

/**
 * Sentinel that represents an array-index traversal step (`[]` in display form).
 * A union-discriminated singleton so the type system can tell it apart from
 * plain string keys.
 */
export type ArrayIndex = { readonly kind: "[]" };

/** The literal sentinel value used at runtime. */
export const ARRAY_INDEX: ArrayIndex = { kind: "[]" } as const;

/** A single step in an IRPath — either a named key or an array traversal. */
export type PathSegment = string | ArrayIndex;

// ---------------------------------------------------------------------------
// Primitive leaves — types we stop recursing at
// ---------------------------------------------------------------------------

/**
 * Types whose fields we do NOT recurse into. Everything not listed here is
 * fair game for the recursive path derivation.
 *
 * Intentionally sealed to primitives + well-known leaf unions so we never
 * accidentally "look inside" a discriminated union that is meant to be atomic.
 */
type PrimitiveLike =
  | string
  | number
  | boolean
  | null
  | undefined
  | symbol
  | bigint;

/**
 * Discriminated union leaves: the element types whose members are not
 * further decomposable as IR path steps. These appear as array element
 * types inside stores, rules, etc.
 *
 * `RawKmnFragment` is listed here because opaque fragments are NOT
 * survey-editable in v1 (out-of-scope rule, spec §16). `raw[ARRAY_INDEX]`
 * is a valid IRPath endpoint (the list is addressable for `inputs`), but
 * individual sub-fields (`sourceText`, `reason`, etc.) must not be write
 * targets. Marking `RawKmnFragment` as AtomicLeaf enforces this at the type
 * level — any path going deeper than `raw[]` is a compile error.
 */
type AtomicLeaf =
  | StoreItem
  | ContextElement
  | OutputElement
  | Pattern // Pattern is a separate contract; don't recurse into it
  | RawKmnFragment; // opaque fragments are not survey-editable in v1 (spec §16)

/**
 * TouchKeyIR is self-recursive via sk/flick/multitap. We stop here (G4).
 * An IRPath MAY name the `keys[]` level (i.e. a path that resolves TO
 * `TouchKeyIR`), but no further.
 */
type BoundaryType = TouchKeyIR;

// ---------------------------------------------------------------------------
// Recursive path-segment derivation
// ---------------------------------------------------------------------------

/**
 * Given a type `T` (the current IR node) and an accumulated tuple `Acc`,
 * produce the union of all valid IRPath tuples that start with the path
 * encoded in `Acc` and continue into the fields of `T`.
 *
 * Rules:
 *   1. If `T` is a primitive/atomic leaf/boundary, the path terminates — yield `Acc`.
 *   2. If `T` is an array, yield `Acc` (the array itself is a valid endpoint)
 *      AND recurse for `Acc + [ArrayIndex]` into the element type.
 *   3. If `T` is an object, yield `Acc` AND for each key K of T, recurse
 *      for `Acc + [K]` into `T[K]`.
 *   4. If `T` is a union, distribute over the members.
 *
 * The depth parameter is a tuple-length counter that prevents TS from hitting
 * its recursion limit on deeply nested structures. We cap at a safe depth.
 */

/**
 * Maximum path depth the recursive expander will explore.
 * Current deepest real IR path is 9 segments:
 *   touchLayout.platforms[].layers[].rows[].keys[]
 * Margin of 3 kept for future IR extensions without a constant change.
 */
type MAX_PATH_DEPTH = 12;

type PathsInto<
  T,
  Acc extends readonly PathSegment[],
  Depth extends readonly unknown[] = [],
> =
  // Depth guard — stop expanding if we have hit MAX_PATH_DEPTH steps
  Depth["length"] extends MAX_PATH_DEPTH
    ? Acc
    : // Primitive leaves — terminate
      [T] extends [PrimitiveLike]
      ? Acc
      : // Atomic leaf unions — terminate
        [T] extends [AtomicLeaf]
        ? Acc
        : // Boundary types (TouchKeyIR) — terminate, do not recurse inside
          [T] extends [BoundaryType]
          ? Acc
          : // Optional wrapper: strip undefined
            T extends undefined
            ? never
            : // Array types — yield Acc and recurse into element
              T extends readonly (infer Elem)[]
              ?
                  | Acc
                  | PathsInto<
                      NonNullable<Elem>,
                      readonly [...Acc, ArrayIndex],
                      readonly [...Depth, unknown]
                    >
              : // Object types — yield Acc and recurse into each key
                T extends object
                ?
                    | Acc
                    | {
                        [K in keyof Required<T>]: PathsInto<
                          NonNullable<T[K]>,
                          readonly [...Acc, K & string],
                          readonly [...Depth, unknown]
                        >;
                      }[keyof Required<T>]
                : // Fallback — terminate
                  Acc;

// ---------------------------------------------------------------------------
// IRPath — the union of all valid paths from the KeyboardIR root
// ---------------------------------------------------------------------------

/**
 * A typed structural location in the `KeyboardIR` type tree.
 *
 * Valid values are exactly the paths that correspond to real locations in
 * `keyboard-ir.ts`. An invalid path tuple is not assignable here → compile
 * error (G1). A renamed/removed IR field invalidates any path naming it →
 * typecheck failure (G2).
 *
 * Use `irPath(...segments)` to construct values; use `formatIRPath(path)` to
 * render the dashboard display string.
 *
 * Note: the empty tuple `[]` is assignable (it represents the root
 * `KeyboardIR` itself). Non-empty tuples name a specific sub-location.
 */
export type IRPath = PathsInto<KeyboardIR, readonly []>;

// ---------------------------------------------------------------------------
// Builder and formatter
// ---------------------------------------------------------------------------

/**
 * Ergonomic typed builder for `IRPath`.
 *
 * Usage:
 *   irPath("groups", ARRAY_INDEX, "rules", ARRAY_INDEX, "output")
 *
 * Because the return type is `IRPath`, an invalid segment sequence is a
 * compile error.
 *
 * Called with zero arguments, `irPath()` returns the empty tuple `[]`, which
 * represents the root `KeyboardIR` itself. This is a valid `IRPath` value
 * (the empty tuple is included in the union by the `Acc` base case).
 */
export function irPath<const T extends IRPath>(...segments: T): T {
  return segments;
}

/**
 * Stable display string for the dashboard (G5).
 *
 * Renders a canonical segment tuple as a human-readable dot-bracket path:
 *   ["groups", ARRAY_INDEX, "rules", ARRAY_INDEX, "output"]
 *   → "groups[].rules[].output"
 *
 * The string form is presentation-only; the tuple is the canonical
 * comparison key for the orphan-input lint.
 */
export function formatIRPath(path: IRPath): string {
  if (path.length === 0) return "(root)";

  const parts: string[] = [];
  let i = 0;
  while (i < path.length) {
    const seg = path[i];
    if (typeof seg === "string") {
      // Peek ahead: if the next segment is ArrayIndex, emit "key[]" together
      const next = path[i + 1];
      if (
        next !== undefined &&
        typeof next === "object" &&
        (next as ArrayIndex).kind === "[]"
      ) {
        parts.push(`${seg}[]`);
        i += 2;
      } else {
        parts.push(seg);
        i += 1;
      }
    } else {
      // Bare ArrayIndex with no preceding key (edge case — shouldn't appear
      // in well-formed paths, but handle gracefully)
      parts.push("[]");
      i += 1;
    }
  }
  return parts.join(".");
}

// ---------------------------------------------------------------------------
// Type-test helpers (used in ir-path.type-assertions.ts and ir-path.test.ts)
// ---------------------------------------------------------------------------

/**
 * Compile-time assignability check helper.
 * `AssignableTo<A, B>` is `true` if A extends B, else `false`.
 * Used in type-level assertions to verify a path is (or is not) a valid IRPath.
 *
 * Re-exported from the package root via `index.ts` `export *`.
 */
export type AssignableTo<A, B> = A extends B ? true : false;
