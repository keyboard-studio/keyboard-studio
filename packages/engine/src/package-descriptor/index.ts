// package-descriptor — the SINGLE writer of the Keyman package descriptor's
// identity fields (spec 057 FR-005, contracts/package-descriptor.md).
//
// Both authoring tracks and the output projection reach `source/<id>.kps` only
// through this module. A second writer is a defect, not an optimization: the
// pre-057 arrangement had the scaffolder owning a private builder that only the
// copy track ever invoked, so the adapt track shipped no descriptor and nobody
// noticed until an author read the archive.
//
// Callers (contract §6):
//   - `scaffolder/index.ts` generateStubs      → buildKpsContent
//   - `studio/lib/projectWorkingCopyVfs.ts` 3.6 → applyIdentityToKps (both tracks)
//
// `serializeWorkingCopy` is deliberately NOT a caller. Its `<Version>` regex patch
// stays where it is, and FR-004/SC-005 require the OSK preview to see the same
// descriptor the zip does — which it only does while the write rides the shared
// projection.

export { buildKpsContent, buildLanguageElement, buildLanguagesBlock } from "./build.js";
export type { PackageDescriptorIdentity } from "./build.js";
export { applyIdentityToKps } from "./patch.js";
export type { ApplyIdentityToKpsResult } from "./patch.js";

/**
 * The identity-overlay fields this writer actually consumes.
 *
 * Owned by the WRITER, not by the test that reads it. `outputReach.test.ts`
 * validates every `QuestionModule.outputs` entry naming `"package-descriptor"`
 * against this set (spec 057 FR-016), so a question cannot declare it feeds a
 * field the descriptor never reads. Keeping the table here means adding a field to
 * the writer and declaring it on a question are one change, not two that can
 * disagree.
 *
 * The names are `IdentityOverlay`'s, not `PackageDescriptorIdentity`'s: `bcp47`
 * is what the overlay calls the tag the writer receives as `languageTag`. The
 * declaration space is the overlay, because that is the input a counterfactual
 * can vary.
 */
export const DESCRIPTOR_CONSUMED_FIELDS: ReadonlySet<string> = new Set([
  "displayName",
  "bcp47",
  "languageName",
]);
