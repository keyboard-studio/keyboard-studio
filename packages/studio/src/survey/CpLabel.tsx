// CpLabel — chip code-point label with the FR-014 multi-code-point affordance.
//
// Extracted from PhaseB.tsx (#2063): TextSampleAffordance renders the same
// proposal chips and must not import PhaseB (CharactersStep <-> PhaseB
// cycle, depcruise no-circular).

import { codepointLabel } from "./codepointLabel.ts";
import { ACCENT, chipCodepoint } from "./surveyStyles.ts";

/**
 * Renders a chip's code-point label (spec 047 FR-014): the base code point in
 * U+XXXX notation, followed — for a multi-code-point grapheme — by a bracketed
 * "[+<extra marks>]" badge in a contrasting (accent) color that shows the extra
 * combining mark(s) themselves. The full space-separated stack is exposed on
 * the chip's hover title/accessible name by the caller.
 */
export function CpLabel({ grapheme }: { grapheme: string }) {
  const { base, extras } = codepointLabel(grapheme);
  return (
    <span style={chipCodepoint()}>
      {base}
      {extras !== "" && (
        <span style={{ color: ACCENT, fontWeight: 700 }}>{`[+${extras}]`}</span>
      )}
    </span>
  );
}
