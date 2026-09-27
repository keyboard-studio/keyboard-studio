// useLoanwordSet — the ONE derivation of the session loanword tier as a Set.
//
// Extracted from MechanismGallery / TouchGallery so the two galleries cannot
// drift. Both galleries need the loanword-tier letters the author added
// (session.loanwordChars) as a render-friendly Set, placed after the
// alphabet's own letters (survey/collation.ts loanwordsLast).

import { useMemo } from "react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

/**
 * Loanword-tier letters the author added, as a Set for O(1) membership
 * checks. Empty when the session carries no loanword tier.
 */
export function useLoanwordSet(): Set<string> {
  const sessionLoanwordChars = useWorkingCopyStore((s) => s.session.loanwordChars);
  return useMemo(() => new Set(sessionLoanwordChars ?? []), [sessionLoanwordChars]);
}
