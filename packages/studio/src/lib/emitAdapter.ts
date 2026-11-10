// emitAdapter -- the one entry every output path reads (spec 118 FR-014).
//
// Preview, download, source archive, pull request and LDML export all take
// their files from `emitOutputTree`. It builds the engine emit state and the
// file-level inputs (descriptor, id renames, docs, fonts) through the
// projection and returns the tree; no caller re-reads text another stage
// generated.

import {
  projectWorkingCopyForOutput,
  type ProjectForOutputOptions,
  type ProjectWorkingCopyForOutputResult,
} from "./serializeWorkingCopy.ts";

export { writeKmnThroughEmit } from "./emitKmnWriter.ts";
export type { KmnWriterContext } from "./emitKmnWriter.ts";

export type EmittedOutput = ProjectWorkingCopyForOutputResult;

/** The emitted output tree for the working copy, or null when no keyboard is selected. */
export async function emitOutputTree(opts?: ProjectForOutputOptions): Promise<EmittedOutput | null> {
  return projectWorkingCopyForOutput(opts);
}
