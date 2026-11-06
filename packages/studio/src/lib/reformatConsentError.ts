// Thrown by a delivery path when Open-mode files need the author's agreement to be
// reformatted (spec 111 FR-009). Its own module so consumers can test for it
// without pulling in the delivery builders.

/** Thrown by a delivery path when files need the author's agreement to be reformatted. */
export class ReformatConsentRequiredError extends Error {
  readonly files: readonly string[];
  constructor(files: readonly string[]) {
    super(`Reformat consent required for: ${files.join(", ")}`);
    this.name = "ReformatConsentRequiredError";
    this.files = files;
  }
}
