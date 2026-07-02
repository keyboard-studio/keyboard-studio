// see spec.md §7.2 — script-class default-fill prior.
//
// A pre-fill step that runs BEFORE selectStrategy(). It never changes what
// selectStrategy() itself does (that function stays pure and still requires a
// complete DiscoveryAxisVector) — it exists to let callers who have elicited
// only `scale` + `scriptClass` (plus whichever phase-gated axes the survey
// happened to ask) fill in the rest from the prior instead of the survey.
//
// LOAD-BEARING INVARIANT (do not violate): the prior (packages/contracts/data/
// axis-priors.json, loaded via AXIS_PRIORS) never emits a rule-triggering /
// marked axis value. Every phase-gated axis it can fill is the "off/unmarked"
// state: markInputOrder="prefix" (alphabetic only), diacriticBehavior="none",
// multiMode="single", constraintEnforcement="none", remapPosture="addition"
// (alphabetic only). `postfix` must NEVER be produced here — see
// AxisPriorCellSchema (contracts/src/schemas.ts) which enforces this
// structurally at the data-load boundary. Rule 3a (§7.2) fires only from an
// elicited/test-supplied postfix, never from this prior.

import type { AxisFill, DiscoveryAxisVector } from "@keyboard-studio/contracts";
import { AXIS_PRIORS } from "@keyboard-studio/contracts";

/** The phase-gated axes this prior can fill, in a fixed, deterministic order. */
const PHASE_GATED_AXES = [
  "markInputOrder",
  "diacriticBehavior",
  "multiMode",
  "constraintEnforcement",
  "remapPosture",
] as const satisfies readonly (keyof DiscoveryAxisVector)[];

export interface DefaultFillResult {
  /** The complete axis vector: elicited values preserved, gaps filled from the prior. */
  axes: DiscoveryAxisVector;
  /** Provenance records, one per axis actually filled by the prior (in {@link PHASE_GATED_AXES} order). */
  axisFills: AxisFill[];
}

/**
 * Fill phase-gated axes not already present on `partial` using the
 * script-class default-fill prior (spec §7.2), keyed on the already-elicited
 * `scriptClass` (A2) x `scale` (A1).
 *
 * `partial` MUST already carry `scale` and `scriptClass` — the prior is keyed
 * on both and cannot fill either of them itself. Any other axis already
 * present on `partial` (elicited or IR-derived) is left untouched; only
 * missing phase-gated axes are filled.
 *
 * This is a separate pre-fill step, not part of `selectStrategy()` — that
 * function stays pure and still requires a complete `DiscoveryAxisVector`.
 * Callers run `defaultFillAxes()` first, then pass its `axes` result to
 * `selectStrategy()`.
 *
 * @throws Error if `scale` or `scriptClass` is missing from `partial`.
 * @see spec.md §7.2
 */
export function defaultFillAxes(
  partial: Partial<DiscoveryAxisVector>,
): DefaultFillResult {
  const { scale, scriptClass } = partial;
  if (scale === undefined || scriptClass === undefined) {
    throw new Error(
      "defaultFillAxes: scale (A1) and scriptClass (A2) must already be elicited before default-fill runs",
    );
  }

  const prior = AXIS_PRIORS[scriptClass][scale];
  const axisFills: AxisFill[] = [];
  const filled: Partial<DiscoveryAxisVector> = { ...partial };

  for (const axis of PHASE_GATED_AXES) {
    if (filled[axis] !== undefined) {
      continue;
    }
    const value = prior[axis];
    if (value === undefined) {
      // Not applicable for this scriptClass (e.g. markInputOrder/remapPosture
      // on non-alphabetic scripts) — leave the axis undefined, same as an
      // unelicited N/A sub-axis.
      continue;
    }
    (filled as Record<string, unknown>)[axis] = value;
    axisFills.push({ axis, value, source: "script-class-prior" });
  }

  return { axes: filled as DiscoveryAxisVector, axisFills };
}
