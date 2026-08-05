// useGlyphFontStack — the CSS font-family stack for the author's chosen Phase
// B font (Noto Sans default / Charis SIL), applied to every glyph-bearing
// surface: CharChipEditor's typed-in chips, SuggestionChip's CLDR suggestion
// chips, and CharacterMapPane's character-map cells (all three read
// `usePhaseBDraftStore((s) => s.selectedFont)` then `phaseBFontStack(...)`
// it — this hook is that pair, extracted once instead of duplicated per
// call site).
//
// Lives here (survey/) rather than in ./surveyStyles.ts: surveyStyles.ts is a
// plain style-constants module with no store dependency, and
// stores/phaseBDraftStore.ts already imports `DEFAULT_PHASE_B_FONT` /
// `PhaseBFontValue` from surveyStyles.ts — importing the store back into
// surveyStyles.ts here would create a cycle.

import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
import { phaseBFontStack } from "./surveyStyles.ts";

/** The CSS font-family stack for the currently-selected Phase B glyph font. */
export function useGlyphFontStack(): string {
  const selectedFont = usePhaseBDraftStore((s) => s.selectedFont);
  return phaseBFontStack(selectedFont);
}
