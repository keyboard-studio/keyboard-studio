// see spec.md §7.2 — script-class default-fill prior. Loader for the on-disk
// prior data, mirroring the criteria.json load+zod-parse pattern in
// criteriaData.ts.
//
// LOAD-BEARING INVARIANT (do not violate): every cell in this table fills
// phase-gated axes with their "off/unmarked" state only. In particular
// `markInputOrder` is `"prefix"` (never `"postfix"`) wherever present —
// `AxisPriorCellSchema` enforces this structurally (a literal, not a union),
// so a malformed data file that tried to encode "postfix" would fail to
// parse rather than silently reaching the strategy selector.

import type { Scale, ScriptClass } from "./axes";
import { AxisPriorTableSchema } from "./schemas";
import data from "../data/axis-priors.json" with { type: "json" };

/** One scriptClass x scale cell of the prior — see `AxisPriorCellSchema` (schemas.ts). */
export type AxisPriorCell = ReturnType<typeof AxisPriorTableSchema.parse>[ScriptClass][Scale];

/** The full scriptClass -> scale -> {@link AxisPriorCell} prior table. */
export type AxisPriorTable = Record<ScriptClass, Record<Scale, AxisPriorCell>>;

/**
 * The script-class default-fill prior (spec §7.2), loaded from
 * `packages/contracts/data/axis-priors.json` and parsed through
 * {@link AxisPriorTableSchema} at module-init time. A malformed record throws
 * here at load rather than surfacing as a silently-wrong axis value in the
 * strategy selector.
 *
 * @see spec.md §7.2
 * @see packages/engine/src/strategy-selector/default-fill.ts — the consumer
 */
export const AXIS_PRIORS: AxisPriorTable = AxisPriorTableSchema.parse(
  data,
) as AxisPriorTable;
