// identityLanguagePatch — the ONE composition rule turning the identity
// step's language answers into the working-copy identity overlay
// (km-triage mechanical fix: `confirmRebase.ts`'s `identitySeedFromSession`
// re-derived the same trim/omit-empty logic `projectNameOptions.onCommit`
// already implements in `editors/adapters/flowStepOptions.tsx`, whose own
// comment warns that a second composition rule risks disagreeing with the
// first. Both sites now call this).
//
// `bcp47` is consumed WHOLE (research D-03): the identity-lite series
// already composed language + region + script into one tag, so this helper
// never re-derives it — it only trims. An empty tag or name (author left the
// field blank) is omitted rather than written, so downstream readers apply
// their own fallbacks (the descriptor writer's `und` placeholder) instead
// of declaring a blank tag.

import type { IdentityPatch } from "../stores/workingCopyStore.ts";

/**
 * The minimal shape this helper reads. Deliberately narrower than
 * `IdentityLiteResult`: both callers qualify — the session store holds the
 * full result, while `FlowStepDeps.identityResult` carries only
 * `{ autonym, english, bcp47 }` — so the parameter stays structural rather
 * than importing either producer's type.
 */
export interface IdentityLanguageSource {
  bcp47: string;
  english: string;
}

/**
 * Trimmed `{ bcp47, languageName }` conditional-spread overlay for an
 * `IdentityPatch`: each field present only when its trimmed source is
 * non-empty. Returns `{}` (not undefined) when neither is — callers spread
 * it into a larger patch.
 */
export function identityLanguagePatch(
  result: IdentityLanguageSource | null,
): IdentityPatch {
  const bcp47 = result?.bcp47.trim() ?? "";
  const languageName = result?.english.trim() ?? "";
  return {
    ...(bcp47 !== "" ? { bcp47 } : {}),
    ...(languageName !== "" ? { languageName } : {}),
  };
}
