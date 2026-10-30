// markAttachments — derive, from the marks series' placement worklist, which
// bases each lone combining mark may compose onto (spec 106 FR-021, R5).
//
// The engine's output-form seam turns a lone-mark key into a postfix compose
// rule under ready-made, over exactly these bases: the bare letters the
// designer placed, minus the combinations the attachment matrix blocked.

import type { PlacementWorklist } from "@keyboard-studio/contracts";

/** Per mark, the allowed bases (each a single code point whose NFD is itself). */
export function markAttachmentsFromWorklist(worklist: PlacementWorklist): Record<string, string[]> {
  const bareBases = worklist.ownLetterUnits.filter((unit) => [...unit.normalize("NFD")].length === 1);
  const out: Record<string, string[]> = {};
  for (const { mark } of worklist.markUnits) {
    const blocked = new Set(
      worklist.blockedCombinations.filter((b) => b.mark === mark).map((b) => b.base),
    );
    out[mark] = bareBases.filter((base) => !blocked.has(base));
  }
  return out;
}
