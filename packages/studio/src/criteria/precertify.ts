// Precertification (spec 084 Batch 1; Matthew's term, 2026-10-13).
//
// Some criteria are settled at GENERATION time, from the generator's
// closed manifest and invariants, before and independently of any
// post-hoc lint pass. That is a different claim from a check that ran
// over the finished files, and the resolver keeps it a different
// mechanism: a precertified code resolves Met in authored mode only,
// from the host's statement that the judged artifact is the studio's
// generated output bundle. A foreign keyboard can never claim
// precertification — it had no generator — so the foreign host never
// supplies the set, and the resolver ignores it in foreign mode even
// if a caller passes one by mistake.
//
// The set is deliberately tiny: only file-inventory hygiene, where
// the generator's manifest IS the whole truth. Content properties
// (targets, fonts, layouts) are author-influenced and stay CHECK-NOW
// lint checks even in authored mode.

/** Lint codes the generator's closed manifest settles, authored mode only. */
export const PRECERTIFIED_LINT_CODES: ReadonlySet<string> = new Set([
  "KM_LINT_FILES_OUTSIDE_FOLDER",
  "KM_LINT_STRAY_SCRATCH_FILES",
]);

/** The generation invariant behind each precertified code, as evidence. */
export const PRECERTIFY_EVIDENCE: Readonly<Record<string, string>> = {
  KM_LINT_FILES_OUTSIDE_FOLDER:
    "Precertified by generation: the output bundle is built as a closed manifest of files inside the keyboard's own folder (buildOutputBundle / serializeWorkingCopy), and submission is confined to that folder's tree path — no file outside the folder can be modified.",
  KM_LINT_STRAY_SCRATCH_FILES:
    "Precertified by generation: every file in the output bundle enters through the generator's closed manifest (generator writes and manifest-enumerated base-carried files only) — no stray scratch or test file can appear in it.",
};
