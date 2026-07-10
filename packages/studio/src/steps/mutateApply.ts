// mutateApply — pure patch-apply helper for the spec-014 `mutate()` seam.
//
// Contract: mutate-seam.contract.md (M1–M5) + plan.md (spec-014).
//
//   M1 (pure)              — never mutates inputs; returns fresh IR.
//   M2 (path-scoped merge) — patch applied as deep merge; sibling subtrees preserved.
//   M3 (containment)       — every leaf must lie at or under a declared `writes` IRPath.
//                            Violations reject the whole patch (no partial apply).
//   M4 (idempotent)        — applying the same patch twice yields byte-identical result.
//   M5 (empty patch)       — `{}` is valid and merges to a structural copy of `base`.
//
// Consumed by the reducer apply path (steps/reducer.ts) when the mutate flag is on.

import type { IRPath, KeyboardIR } from "@keyboard-studio/contracts";
import { ARRAY_INDEX, formatIRPath } from "@keyboard-studio/contracts";

/**
 * Error thrown when a `mutate()` patch would write outside the module's
 * declared `writes` paths (M3). Carries the offending leaf paths (display form)
 * so the failure is actionable, never silent.
 */
export class MutatePatchContainmentError extends Error {
  /** The patch leaf paths (display form) that fell outside the declared `writes`. */
  readonly offendingPaths: readonly string[];
  /** The declared `writes` paths (display form) the patch was checked against. */
  readonly declaredWrites: readonly string[];

  constructor(offendingPaths: readonly string[], declaredWrites: readonly string[]) {
    super(
      `mutate() patch touched undeclared IR path(s): [${offendingPaths.join(", ")}]. ` +
        `Declared writes: [${declaredWrites.join(", ")}]. ` +
        `The whole patch was rejected and the IR left unchanged (spec-014 M3/FR-003).`,
    );
    this.name = "MutatePatchContainmentError";
    this.offendingPaths = offendingPaths;
    this.declaredWrites = declaredWrites;
  }
}

/** True for a plain (mergeable) object — not an array, not null, not a class instance. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * A concrete path through the patch: each segment is either a string object key
 * or a numeric array index. (Distinct from `IRPath`, whose array steps use the
 * `ARRAY_INDEX` sentinel rather than a concrete index.)
 */
type ConcreteSegment = string | number;

/** Does declared segment `d` match concrete patch segment `l`? */
function segMatches(d: IRPath[number], l: ConcreteSegment): boolean {
  if (d === ARRAY_INDEX || (typeof d === "object" && d.kind === "[]")) {
    // Array-index step: matches a concrete numeric index only.
    return typeof l === "number";
  }
  // Named-key step: must match the concrete string segment exactly.
  return typeof l === "string" && l === d;
}

/**
 * Does the declared write path `decl` authorize the concrete patch leaf `leaf`?
 *
 * Authorized when all segments in the common prefix match and one path is a
 * prefix of the other (prefix-containment rule). A segment mismatch means the
 * paths diverge and the write is not authorized.
 */
function pathAuthorizes(decl: IRPath, leaf: readonly ConcreteSegment[]): boolean {
  const common = Math.min(decl.length, leaf.length);
  for (let i = 0; i < common; i++) {
    if (!segMatches(decl[i]!, leaf[i]!)) return false;
  }
  return true;
}

/** Render a concrete patch leaf path for error messages (e.g. "header.bcp47", "stores[2].items"). */
function formatConcrete(leaf: readonly ConcreteSegment[]): string {
  if (leaf.length === 0) return "(root)";
  return leaf.reduce<string>((out, seg) => {
    if (typeof seg === "number") return `${out}[${seg}]`;
    return out === "" ? seg : `${out}.${seg}`;
  }, "");
}

/**
 * Prototype-pollution guard: keys that could reach Object.prototype. These are
 * never merged or path-collected, preventing hostile/buggy patches from setting
 * the result's prototype.
 */
const UNSAFE_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Walk `patch`, collecting every LEAF path it would write (a leaf is a
 * primitive, an array, or `undefined`/null — i.e. anything that is not a plain
 * object recursed into). Plain objects are recursed; their own existence is not
 * a leaf write (only the values placed under them are).
 *
 * An empty plain object `{}` produces no leaf paths (M5: it is a no-op).
 * Prototype-polluting keys (UNSAFE_KEYS) are skipped — they are never written,
 * so they are never path-collected (and never authorized as writes).
 */
function collectLeafPaths(
  patch: Record<string, unknown>,
  prefix: ConcreteSegment[],
  acc: ConcreteSegment[][],
): void {
  for (const key of Object.keys(patch)) {
    if (UNSAFE_KEYS.has(key)) continue; // prototype-pollution guard
    const value = patch[key];
    const here: ConcreteSegment[] = [...prefix, key];
    if (isPlainObject(value)) {
      collectLeafPaths(value, here, acc);
    } else {
      acc.push(here);
    }
  }
}

/**
 * Deep-merge `patch` into a structural clone of `base`. Plain objects merge
 * recursively (siblings preserved, M2); other values replace. Inputs are never
 * mutated (M1).
 */
function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return structuredClone(patch) as T;

  const baseObj: Record<string, unknown> = isPlainObject(base)
    ? { ...(base as Record<string, unknown>) }
    : {};
  for (const key of Object.keys(patch)) {
    if (UNSAFE_KEYS.has(key)) continue;
    const pv = patch[key];
    baseObj[key] = isPlainObject(pv) ? deepMerge(baseObj[key], pv) : structuredClone(pv);
  }
  return baseObj as T;
}

/**
 * Apply a `mutate()` patch to an IR, scoped to the module's declared `writes`.
 *
 * @param base    The current working-copy IR. NOT mutated (M1).
 * @param patch   The `Partial<KeyboardIR>` returned by a module's `mutate()`.
 * @param writes  The module's declared `writes` IRPaths — the containment set.
 * @returns       A fresh IR with the patch deep-merged in (M2).
 * @throws  {MutatePatchContainmentError} if the patch touches any path outside
 *          `writes` — whole-patch rejection, IR unchanged (M3).
 */
export function applyMutatePatch(
  base: KeyboardIR,
  patch: Partial<KeyboardIR>,
  writes: readonly IRPath[],
): KeyboardIR {
  // --- M3: containment check FIRST, before any merge (fail-fast, no partial apply).
  const leaves: ConcreteSegment[][] = [];
  collectLeafPaths(patch as Record<string, unknown>, [], leaves);

  const offending: string[] = [];
  for (const leaf of leaves) {
    const authorized = writes.some((w) => pathAuthorizes(w, leaf));
    if (!authorized) offending.push(formatConcrete(leaf));
  }
  if (offending.length > 0) {
    throw new MutatePatchContainmentError(
      offending,
      writes.map((w) => formatIRPath(w)),
    );
  }

  // --- M5: empty patch ⇒ structural copy (value-level no-op).
  // --- M2/M4: path-scoped deep merge; pure; idempotent.
  return deepMerge(base, patch);
}
