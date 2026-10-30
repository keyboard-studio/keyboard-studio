// carveRecommendation — what the carve gallery suggests discarding, as one
// pure function (spec 107 FR-040), lifted out of CarveGalleryV2 so the gallery
// and the headless author derive the same rows.
//
// Inputs are plain data: the working copy's IR and instantiation mode, the
// convenience letters the author kept, and the needed set the pre-carve
// convenience question shares (lib/carveNeededSet.ts). The result is what
// `continueCarve` / `skipCarve` (carveContinue.ts) take.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { recommendedRemovalChars, type RecommendedRemovalChar } from "../../lib/irToCarveNodes.ts";
import type { CarveNeededSetResult } from "../../lib/carveNeededSet.ts";
import type { InstantiationMode } from "../../stores/workingCopyStore.ts";

export interface CarveRecommendation {
  /** False while the needed set or the IR is still loading: the rows are then an empty placeholder, not "nothing to suggest". */
  recommendationReady: boolean;
  recommended: RecommendedRemovalChar[];
  /** The suggested rows that drive "Suggested to discard": every row except cross-script-Latin. */
  primaryRows: RecommendedRemovalChar[];
  /** The optional, low-priority cross-script-Latin rows (post-#526 split). */
  optionalLatinRows: RecommendedRemovalChar[];
}

export function carveRecommendation(args: {
  ir: KeyboardIR | null;
  instantiationMode: InstantiationMode;
  /** `session.retainedConvenienceChars`: base letters the author kept at the convenience question. */
  retainedConvenienceChars: readonly string[] | undefined;
  needed: Pick<CarveNeededSetResult, "neededSet" | "form" | "bcp47" | "hasSignal" | "blockCandidateChars">;
}): CarveRecommendation {
  const { ir, instantiationMode, retainedConvenienceChars, needed } = args;
  // Retained convenience letters are not part of the orthography (deliberately
  // absent from confirmedInventory) but are needed for carve's purposes:
  // shielding them is the whole point of having asked.
  const retainedSet = new Set((retainedConvenienceChars ?? []).map((ch) => ch.normalize(needed.form)));
  const neededSet = retainedSet.size === 0 ? needed.neededSet : new Set([...needed.neededSet, ...retainedSet]);

  const recommendationReady = instantiationMode !== null && needed.hasSignal && ir !== null;
  const recommended =
    recommendationReady && ir
      ? recommendedRemovalChars({
          ir,
          needed: neededSet,
          bcp47: needed.bcp47,
          form: needed.form,
          blockCandidateChars: needed.blockCandidateChars,
        })
      : [];
  // Post-#526 split: cross-script-Latin rows never drive the primary group;
  // they get their own optional group instead of being suppressed or mixed in.
  return {
    recommendationReady,
    recommended,
    primaryRows: recommended.filter((r) => r.reason !== "cross-script-latin"),
    optionalLatinRows: recommended.filter((r) => r.reason === "cross-script-latin"),
  };
}
