// carveDispositionCopy — shared binding copy for the 076 carve
// allow/block disposition (spec 076 amendments A1/A2).
//
// A1 required copy — symmetric risk statements, one per option. Each option
// states its OWN risk; the retired one-sided allow/block slogan (the version
// that framed Allow as unpredictable and Block as predictable) must never
// appear — asserted absent in tests.
//
// Imported by the per-row DispositionControl (T016, in CarveGalleryV2.tsx),
// the expanded host-consequence row (T019, CarvedHostConsequences.tsx), and
// re-exported from CarveGalleryV2.tsx so existing imports keep working.

import type { CarveDispositionProvenance } from "@keyboard-studio/contracts";

export const DISPOSITION_COPY = {
  prompt: 'Do your typists expect a character on this key?',
  allowLabel: 'Allow',
  blockLabel: 'Block',
  allowRisk: 'Key does something, but output varies by computer.',
  blockRisk: 'Key reliably does nothing, but becomes inaccessible/dead if typists expected a character.',
  provenanceLabel: {
    'closed-keyboard-card': 'from closed-keyboard card',
    'closed-keyboard-card-declined': 'from closed-keyboard card',
    'bulk-default': 'bulk default',
    'author-override': 'your override',
    'deadkey-requirement': 'deadkey always suppresses',
  } as Record<CarveDispositionProvenance, string>,
  /**
   * Shown in place of the Allow option for rows whose carved combinations
   * carry deadkey context. The ruling forbids host fallback for deadkey
   * carves ("deadkey carves never fall through") — removing the rule would
   * pass the keystroke to the host layout while leaving the deadkey armed.
   */
  deadkeyNote: 'Deadkey combinations always suppress — allowing host fallback would leave the deadkey armed.',
};
