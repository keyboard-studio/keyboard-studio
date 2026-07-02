// see spec.md §7.2 (script-class default-fill prior) — provenance primitive
// recording that a phase-gated axis value was filled by the prior rather than
// elicited from the survey/import path.

import type { DiscoveryAxisVector } from "./axes";

/**
 * Source tags for {@link AxisFill}.
 * - "script-class-prior" — the script-class default-fill prior (spec §7.2);
 *   never emits a rule-triggering / marked axis value.
 * - "import-derived" — real structural evidence found in an imported base's
 *   `KeyboardIR` (e.g. postfix mark-input-order detection on the Track 2
 *   import path, spec §7.2 rule 3a); MAY emit a marked value because it is
 *   evidence, not a guess.
 * The union shape leaves room for future fill sources without a breaking change.
 */
export type AxisFillSource = "script-class-prior" | "import-derived";

/**
 * Provenance record for one axis value that was filled by a default-fill
 * prior rather than elicited from the survey or derived from an imported
 * `KeyboardIR`.
 *
 * Consumers (e.g. a future "why did we pick this strategy" UI) can use this
 * to distinguish "the user told us" from "we assumed the unmarked default."
 * The prior that produces these MUST NEVER emit a rule-triggering / marked
 * axis value — see `packages/contracts/data/axis-priors.json` and
 * `packages/engine/src/strategy-selector/default-fill.ts`.
 *
 * @see spec.md §7.2
 */
export interface AxisFill {
  /** Which axis on {@link DiscoveryAxisVector} this fill applies to. */
  axis: keyof DiscoveryAxisVector;
  /** The filled value (the "off/unmarked" state for that axis). */
  value: DiscoveryAxisVector[keyof DiscoveryAxisVector];
  /** Where the fill came from. */
  source: AxisFillSource;
}
