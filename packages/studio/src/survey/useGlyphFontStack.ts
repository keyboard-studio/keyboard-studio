// useGlyphFontStack — the CSS font-family stack for the author's chosen Phase
// B font (Noto Sans default / Charis SIL), applied to every glyph-bearing
// surface: CharChipEditor's typed-in chips, SuggestionChip's CLDR suggestion
// chips, and CharacterMapPane's character-map cells (all three read the
// character-inventory value's `selectedFont` then `phaseBFontStack(...)`
// it — this hook is that pair, extracted once instead of duplicated per
// call site).
//
// Lives here (survey/) rather than in ./surveyStyles.ts: surveyStyles.ts is a
// plain style-constants module with no store dependency (spec 090 T025: the
// font now rides the decision record, read through the decision store).

import { useDecisionStore } from "../stores/decisionStore.ts";
import type { CharacterInventoryValue } from "./phaseBDraftOps.ts";
import { DEFAULT_PHASE_B_FONT, phaseBFontStack } from "./surveyStyles.ts";

/** The CSS font-family stack for the currently-selected Phase B glyph font. */
export function useGlyphFontStack(): string {
  const selectedFont = useDecisionStore(
    (s) =>
      (s.decisions["character-inventory"]?.value as CharacterInventoryValue | undefined)
        ?.selectedFont ?? DEFAULT_PHASE_B_FONT,
  );
  return phaseBFontStack(selectedFont);
}
