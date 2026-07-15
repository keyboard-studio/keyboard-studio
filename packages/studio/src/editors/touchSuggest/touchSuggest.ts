// touchSuggest — touch-layout suggestion generator (P4a scaffold → P5 body).
//
// spec-014 US2 (T023). The generator maps the LOCKED physical-layer KeyboardIR
// to a TouchLayoutIR, stamping each produced key with its provenance per the
// §3.6 defaults-as-data policy and the spec state diagram (data-model.md):
//
//   - "physical-suggested" — a key generated/changed from a physical decision
//     (Case A whole-layout generation, or a net-new key in Case B augmentation).
//   - "base-derived"       — a key carried UNCHANGED from the base keyboard's
//     shipped touch layout (Case B: present in `ir.touchLayout` by id).
//
// It never STAMPS "hand-set" itself: that provenance is owned by the author's
// manual edits (touchBehavior.ts promotion, FR-014) and by the conservative
// default for untagged keys. Per R6 (research.md), an incoming key that
// already carries an explicit "hand-set" tag (e.g. carried through by the
// engine's scaffoldTouchLayout) is preserved untouched, not re-stamped. The
// no-clobber re-propagation gate (repropagate.ts, R2) reads these tags to
// decide which keys it may overwrite.
//
// Derivation is WIRED to the existing engine scaffolder (scaffoldTouchLayout):
// touchSuggest does not re-implement physical→touch mapping — it adds the
// provenance layer on top of the engine's derivation. The function is pure.
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/data-model.md § touchSuggest produced key
//   specs/014-mutate-seam-touch-propagation/contracts/repropagation.contract.md (R1/R2)

import type { KeyboardIR, TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { scaffoldTouchLayout } from "@keyboard-studio/engine";
import type { TouchSuggestPolicy } from "./defaults.ts";
import { DEFAULT_TOUCH_SUGGEST_POLICY } from "./defaults.ts";
import type { TouchKeyProvenance } from "../assignLoop/provenance.ts";

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

/**
 * Input to the touch-suggestion generator.
 *
 * The generator reads the locked physical-layer `KeyboardIR` (the substrate
 * touch is seeded from — Constitution Art. VII / §3.6) and an optional policy
 * override merged over {@link DEFAULT_TOUCH_SUGGEST_POLICY}.
 */
export interface TouchSuggestInput {
  /**
   * The physical keyboard IR. Its physical layer (desktop rules) is what the
   * touch layout is derived from; an existing `ir.touchLayout` is used as the
   * base-derived substrate when present (Case B).
   */
  readonly physicalIR: KeyboardIR;

  /**
   * Policy overrides to merge over {@link DEFAULT_TOUCH_SUGGEST_POLICY}.
   * Partial — unset fields fall back to the default.
   */
  readonly policyOverrides?: Partial<TouchSuggestPolicy>;
}

// ---------------------------------------------------------------------------
// Provenance stamping
// ---------------------------------------------------------------------------

/**
 * Collect the set of touch-key ids present in the base IR's shipped touch
 * layout. These are the keys a Case-B derivation carries through unchanged and
 * therefore tags `base-derived`; any key NOT in this set is physically
 * suggested (generated/changed from a physical decision).
 *
 * Returns an empty set when the IR ships no touch layout (Case A — every
 * produced key is `physical-suggested`).
 */
function baseLayoutKeyIds(ir: KeyboardIR): ReadonlySet<string> {
  const ids = new Set<string>();
  const base = ir.touchLayout;
  if (base === undefined) return ids;
  for (const platform of base.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          ids.add(key.id);
        }
      }
    }
  }
  return ids;
}

/**
 * Return a structural clone of `key` with its provenance stamped per the A2
 * discriminator: `base-derived` when the key id was present in the base
 * layout, `physical-suggested` otherwise — UNLESS the incoming key already
 * carries an explicit `"hand-set"` tag, in which case it is preserved as-is
 * (R6 no-clobber: `scaffoldTouchLayout`'s carry-through deliberately keeps an
 * author-set `"hand-set"` tag, and touchSuggest must not re-stamp over it).
 * The refreshable tiers (`"base-derived"` / `"physical-suggested"` / absent)
 * are re-derived every call, per R6.
 *
 * Does not walk `sk[]` / `flick{}` / `multitap[]` sub-keys — those are left
 * as cloned by `structuredClone`, carrying whatever provenance the engine's
 * `scaffoldTouchLayout` (via `tagCarriedProvenance`) already assigned them.
 * There is nothing to re-derive here since `baseLayoutKeyIds` only indexes
 * top-level `row.keys` ids, not sub-key ids.
 */
function stampKey(key: TouchKeyIR, baseIds: ReadonlySet<string>): TouchKeyIR {
  if (key.provenance === "hand-set") {
    return structuredClone(key);
  }
  const provenance: TouchKeyProvenance = baseIds.has(key.id)
    ? "base-derived"
    : "physical-suggested";
  return { ...structuredClone(key), provenance };
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/**
 * Generate a provenance-stamped {@link TouchLayoutIR} from the physical IR.
 *
 * Pure — does not mutate `input.physicalIR`. Delegates the physical→touch
 * mapping to the engine's {@link scaffoldTouchLayout}, then stamps each
 * produced key's `provenance` (A2): keys carried through from the base layout
 * are `base-derived`; keys generated/changed from physical decisions are
 * `physical-suggested`. Per R6, a key that already arrives tagged `hand-set`
 * (an author-set state the engine's carry-through preserves) is left as-is
 * rather than re-stamped.
 *
 * The policy is merged for forward-compat; the engine scaffolder currently
 * carries the canonical defaults, so `_policy` is reserved here for the
 * per-project / per-key override layer (§3.6 defaults-as-data) without
 * re-implementing the derivation.
 *
 * @param input - Physical IR + optional policy overrides.
 * @returns     - A TouchLayoutIR whose every key carries an auto-managed
 *                provenance (`base-derived` | `physical-suggested`).
 */
export function touchSuggest(input: TouchSuggestInput): TouchLayoutIR {
  const _policy: TouchSuggestPolicy = {
    ...DEFAULT_TOUCH_SUGGEST_POLICY,
    ...input.policyOverrides,
  };
  void _policy; // reserved for the override layer; engine carries the defaults.

  const baseIds = baseLayoutKeyIds(input.physicalIR);
  const derived = scaffoldTouchLayout(input.physicalIR);

  // Stamp provenance on every produced key (pure — fresh structures).
  return {
    platforms: derived.platforms.map((platform) => ({
      ...platform,
      layers: platform.layers.map((layer) => ({
        ...layer,
        rows: layer.rows.map((row) => ({
          keys: row.keys.map((key) => stampKey(key, baseIds)),
        })),
      })),
    })),
    nodeIds: structuredClone(derived.nodeIds),
  };
}
