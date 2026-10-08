/**
 * Context normalization step (spec 086): a generated non-keys group that
 * rewrites pasted NFC/NFD alternates in the context to the form the keyboard
 * itself produces, before the original entry group runs.
 */

/** Bump on any change that alters the generated step's output. */
export const NORMALIZATION_STEP_GENERATOR_VERSION = "1";

/** Name of the generated group the step appends. */
export const NORMALIZATION_GROUP = "generated_context_normalize";

/** Prefix of every store the step generates. */
export const NORMALIZATION_STORE_PREFIX = "generated_cn_";

/** Most mark tuples the pass-through safety check will enumerate for one tuple length. */
export const MAX_MARK_TUPLES = 250000;

/** Most stores the generated step may declare before the generator refuses. */
export const MAX_GENERATED_STORES = 1000;

/** Most packed rules the generated step may hold before the generator refuses. */
export const MAX_GENERATED_RULES = 2000;
