// Thrown by a delivery path when Open-mode files need the author's agreement to be
// reformatted (spec 111 FR-009). Its own module so consumers can test for it
// without pulling in the delivery builders.

import type { TouchReplacementSummary } from "./openApply/types.ts";

/** Thrown by a delivery path when files need the author's agreement to be reformatted. */
export class ReformatConsentRequiredError extends Error {
  readonly files: readonly string[];
  /** Set when the author is asked about replacing or creating the touch layout, not about a reformat. */
  readonly touchReplacement: TouchReplacementSummary | undefined;
  constructor(files: readonly string[], touchReplacement?: TouchReplacementSummary) {
    super(`Reformat consent required for: ${files.join(", ")}`);
    this.name = "ReformatConsentRequiredError";
    this.files = files;
    this.touchReplacement = touchReplacement;
  }
}
