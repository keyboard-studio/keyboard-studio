// Per-question module: il_copyright_holder (attribution flow — spec 064 US1, moved post-track by #1901)
//
// See il_author_name.ts for why identity-lite uses its own ids rather than
// reviving the demoted phase_a modules directly.
//
// TERMINAL for the attribution flow (`next: null`), whereas the demoted
// pa_copyright_holder continues to provenance_opt_in. That divergence is exactly
// why a separate id is needed.
//
// NOT required: per D1 the holder defaults to the author name when left blank,
// so an author who is also the rights holder confirms one field instead of two.

import type { QuestionModule, ApplyContext, WorkingCopyPatch } from "../../types.ts";
import type { ExtractContext } from "../../../decisions/extractContext.ts";
import { deriveAttribution } from "../../../decisions/identitySelectors.ts";
import paCopyrightHolder from "../reserve/pa_copyright_holder.ts";

// help_text extends the demoted module's rather than replacing it (HANDOFF-CONTENT
// item 5, route B): the base wording is still correct, but only identity-lite has
// attribution accumulation behind it, so only here does the author need telling
// that a derived keyboard's original notice is retained for them. Same route for
// the "leave this blank" clause (spec 059 hand-off): it's only true under this
// module's own D1 default-to-author override, not the demoted module's
// required:true, so it belongs in this composition rather than the base string.
//
// This is a correctness guard, not polish. An author crediting the base author by
// hand gets a result that depends on exact spelling — `SIL␣␣International` with a
// double space emits TWO copyright holders for one organisation in a legal notice.
// Dedupe is exact-match by decision D4 (fuzzy matching would collapse the live
// `SIL International` → `SIL Global` rename, which 280 and 152 shipped keyboards
// still use respectively), so this cannot be fixed by smarter matching downstream
// — only by not inviting the re-entry in the first place.
//
// Composed from the base string so Content's edits there still flow through here.

// Pattern audit (D4 exact-match dedupe shape)
//
// Shape: a human-entered attribution/copyright string that flows into the
// exact-match `Map<string, CopyrightHolder>` dedupe in
// packages/contracts/src/copyright.ts (`dedupeHolders`, line 239, reached via
// `addHolder`) can silently emit a duplicate line when the same holder is
// re-typed with different spacing/spelling than an already-known value.
//
// Sibling sites swept for the same shape:
// - packages/contracts/src/copyright.ts:239 dedupeHolders — SAME-RISK is not
//   applicable here; this IS the mechanism, not a sibling.
// - packages/engine/src/scaffolder/index.ts:678-686 (attributionText/addHolder,
//   fed by resolveInheritedHolders' D5 `baseHolderOverride`) — SAME-RISK.
// - packages/studio/src/components/OutputScreen.tsx:575-595 (the D5 "Original
//   copyright holder" free-text `<input name="baseHolder">`) — RESIDUAL-RISK:
//   shown only on the license-unreadable fallback, where re-entry IS necessary
//   (so this field's "already retained, don't re-enter" guard cannot apply). It
//   offers no example or exact-match hint and feeds the same dedupe; if the same
//   org is later confirmed as `copyrightHolder` with different spacing/spelling,
//   two lines emit for one org — the same shape, narrower than the parsed-license
//   path. Not fixed here — surfaced for separate triage.
// - packages/studio/src/lib/serializeWorkingCopy.ts:409-412 — MITIGATED: calls
//   the same `resolveInheritedHolders` helper as the scaffolder path rather
//   than a second implementation, so it carries no independent risk.
// - packages/engine/src/package-descriptor/build.ts:146-159, `.kps <Author>`/
//   `store(&COPYRIGHT)` single-line render — N/A: passes through one already-
//   deduped value, no comparison of its own.
// - packages/studio/src/survey/questions/reserve/pa_copyright_holder.ts,
//   il_author_name.ts, il_author_email.ts — N/A: single-value input, no merge.
export const definition = {
  ...paCopyrightHolder.definition,
  id: "il_copyright_holder",
  required: false,
  next: null,
  help_text:
    // The base string ends on an unpunctuated `Example: '...'`, so the join
    // supplies the sentence break.
    paCopyrightHolder.definition.help_text +
    ". Leave this blank to credit the author named above. " +
    "If this keyboard is based on an existing one, the original author's copyright " +
    "is kept automatically and does not need re-entering here.",
} satisfies import("../../types.ts").FlowQuestion;

// No validate(): required:false, because a blank means "same as the author"
// (D1 / effectiveHolder), not a missing answer.

// Decision spike (km/decisions-spike): base-keyboard probe. Reads the
// copyright from the imported keyboard's IR header — the same fact this
// question confirms in ask mode. Returns undefined when the header carries
// none.
export function extractCopyrightHolder(ctx: ExtractContext): string | undefined {
  const copyright = ctx.ir?.header.copyright;
  return copyright ? copyright : undefined;
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    ...paCopyrightHolder.fixtures.valid,
    { value: "", note: "blank defaults to the author name (D1)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};

/**
 * Decision apply (spec 089 T011): the identity step's attribution lands on
 * the working copy from the recorded decisions — `extractAttribution`'s
 * rule composed over `ctx.decisions` by `deriveAttribution` (holder
 * defaults to the author name, D1). No author name recorded ⇒ no channel:
 * the working copy's attribution stays exactly as it was. This replaces
 * IdentityLiteAdapter's completion-time `setAttribution` write.
 */
export function apply(_value: string | string[] | undefined, ctx: ApplyContext): WorkingCopyPatch {
  const attribution = deriveAttribution(ctx.decisions);
  return attribution === null ? {} : { attribution };
}

const mod: QuestionModule = {
  definition,
  fixtures,
  apply,
  inputs: [],
  writes: [],
  // Decision spike (km/decisions-spike).
  provides: ["copyright-holder"],
  // Spec 092 FR-005 (the series acceptance test): the holder defaults to
  // the author, so the author-name decision is a true ordering
  // requirement. The authoring-track dependency is NOT one (G-14, lead
  // ruling A2): it is a run-time DATA dependency — the track decides what
  // the starting point's copyright may do here (seed on adapt, never
  // offered on copy) — consumed by `seedWhen` below, by the setup gate
  // (the track is recorded before the pass runs), and by the seeded
  // record's `inputs` snapshot via `snapshotInputs`. As a `requires`
  // edge it was false: 091's frozen baseline sorts identity first, and
  // the edge dragged this module out of its screen group.
  requires: ["author-name"],
  snapshotInputs: ["authoring-track"],
  extract: extractCopyrightHolder,
  // Spec 092 T022: the track-dependent seeding disposition, declared here
  // rather than special-cased in the pass. Adapt: the extracted notice
  // seeds the question (pre-filled, labelled with its source). Copy: NO
  // seed and NO `offered` — the copied keyboard's notice is retained by
  // the attribution machinery (D1 leaves the holder defaulting to the
  // author), and offering it for re-entry is the D4 duplicate-holder
  // hazard this module's help text exists to prevent.
  seedWhen: (decisions) => decisions["authoring-track"]?.value === "adapt",
};
export default mod;
