// Related-language base-matching (spec §8 step 1). Public surface for the engine
// module that ranks existing release/ keyboards as a starting base for a target
// language, blending relatedness priors (genealogical / geographic) with
// character-overlap evidence. Consumed by the studio's base-resolution step.

export { pairRelatedness, primarySubtag, TIER_PRIOR } from "./relatedness.js";
export type { PairRelatedness } from "./relatedness.js";
export { rankRelatedBases, indexRelatednessData } from "./rankRelated.js";
export type { RelatedCandidate, RankRelatedOptions } from "./rankRelated.js";
