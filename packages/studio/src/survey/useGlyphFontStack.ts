// useGlyphFontStack — the CSS font-family stack for the author's chosen Phase
// B font (Noto Sans default / Charis SIL / Andika), applied to every glyph-bearing
// surface: CharChipEditor's typed-in chips, SuggestionChip's CLDR suggestion
// chips, and CharacterMapPane's character-map cells (all three read the
// character-inventory value's `selectedFont` then `phaseBFontStack(...)`
// it — this hook is that pair, extracted once instead of duplicated per
// call site).
//
// Lives here (survey/) rather than in ./surveyStyles.ts: surveyStyles.ts is a
// plain style-constants module with no store dependency (spec 090 T025: the
// font now rides the decision record, read through the decision store).
//
// Script families (scriptFonts.ts): when the session's scripts — the target
// language's effective script UNION the base keyboard's language-tag
// scripts — include a script the base fonts do not cover deterministically
// (the registry scripts in scriptFonts.ts), that script's vendored family is
// appended to the stack and its face load is actively triggered. The family
// is a rendering aid resolved from langtags data, never a decision: nothing
// is recorded, and an unresolved script (langtags chunk not landed yet, or
// no registry face) simply leaves the stack as it was.

import { useEffect, useMemo, useReducer } from "react";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { deriveIdentityResult } from "../decisions/identitySelectors.ts";
import { getLoadedLangtags, onLangtagsLoaded } from "../lib/langtagsDefaults.ts";
import type { CharacterInventoryValue } from "./phaseBDraftOps.ts";
import { DEFAULT_PHASE_B_FONT, phaseBFontStack } from "./surveyStyles.ts";
import {
  appendScriptFamilies,
  ensureScriptFontsLoaded,
  resolveSessionScripts,
} from "./scriptFonts.ts";

/** The CSS font-family stack for the currently-selected Phase B glyph font,
 * with the session's vendored script families appended when the target
 * language or the base keyboard needs a script the base fonts do not cover. */
export function useGlyphFontStack(): string {
  const selectedFont = useDecisionStore(
    (s) =>
      (s.decisions["character-inventory"]?.value as CharacterInventoryValue | undefined)
        ?.selectedFont ?? DEFAULT_PHASE_B_FONT,
  );
  const decisions = useDecisionStore((s) => s.decisions);
  // The author's composed target tag: the working copy's identity overlay
  // once the identity step has written it, else the tag derived from the
  // identity decisions (the TrackOneIdentityPanel reader pattern).
  const identityBcp47 = useWorkingCopyStore((s) => s.identity?.bcp47);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);

  // Script resolution needs the langtags defaults (a bare language tag
  // carries no script subtag). The chunk is lazy (FR-011) and this hook
  // deliberately does NOT trigger its load: render-path composers change
  // their output once the module lands (buildTargetBcp47's script
  // suppression), so a new load trigger on a late-mounting glyph surface
  // could flip composed values mid-session. The identity flow loads the
  // chunk as part of picking a language (the picker cannot render options
  // without it), so by the time a target language exists the module is
  // there; until then the hook subscribes passively and recomputes when
  // it lands for whatever reason.
  const [, forceRerender] = useReducer((c: number) => c + 1, 0);
  const langtags = getLoadedLangtags();
  useEffect(() => onLangtagsLoaded(forceRerender), []);

  const targetBcp47 =
    identityBcp47 !== undefined && identityBcp47.trim() !== ""
      ? identityBcp47
      : (deriveIdentityResult(decisions)?.bcp47 ?? "");

  const scripts = useMemo(
    () =>
      resolveSessionScripts(
        targetBcp47,
        startKeyboard?.languages ?? [],
        (subtag) => langtags?.getLanguageDefaults(subtag) ?? null,
        startKeyboard?.script,
      ),
    // `langtags` is a genuine input: the default-script fallback only
    // resolves once the chunk lands (null -> module), and the memo must
    // recompute at exactly that moment.
    [targetBcp47, startKeyboard, langtags],
  );

  useEffect(() => {
    ensureScriptFontsLoaded(scripts);
  }, [scripts]);

  return appendScriptFamilies(phaseBFontStack(selectedFont), scripts);
}
