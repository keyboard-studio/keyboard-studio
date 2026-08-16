/**
 * touchKeyAddress — re-export shim over the canonical address scheme, which now
 * lives in [contracts](../../../contracts/src/touch-key-address.ts) (spec 063
 * T114).
 *
 * The four functions and the `TouchKeyAddressParts` type were defined here
 * first, and everything in engine and studio imports them from this path — so
 * this module keeps that path working rather than forcing a rename across every
 * call site. The definitions moved to contracts because
 * `touch-key-diagnostics.ts`'s detectors need to build addresses and are pinned
 * to contracts by FR-040's one-implementation rule (Layer C may not import
 * engine). See that contracts module's doc for the format, the stability
 * guarantee, the anchored-from-both-ends parse, and the duplicate-id
 * limitation — all unchanged by the move.
 *
 * There is deliberately no behaviour here. A change to the address format
 * belongs in the contracts module, where the parser and both builders sit
 * together and cannot drift.
 */

export {
  touchKeyAddress,
  touchSubKeyAddress,
  touchFlickAddress,
  parseTouchKeyAddress,
  createKeyOccurrenceCounter,
} from "@keyboard-studio/contracts";
export type { TouchKeyAddressParts, TouchKeyOccurrence } from "@keyboard-studio/contracts";
