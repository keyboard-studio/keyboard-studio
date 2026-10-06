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
