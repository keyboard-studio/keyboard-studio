// orthographyModel — derive the FR-022 orthography model from the working
// copy's confirmed mark inventory (character discovery / spec 071
// mark-classes data). Not invented: the confirmed alphabet lives at
// `workingCopyStore.session.alphabet` (a `ConfirmedAlphabet` with bases,
// marks, and attested base+mark stacks), and the mark→bases attachment map
// is the engine's `attestedBasesOf` over those stacks — the same "orthography
// says" signal the marks series itself uses.
//
// Note: this is the ATTESTED attachment set. An author overturn in the marks
// series (reconciledAttachmentChecked) can additionally allow a combination;
// threading that reconciliation in is a follow-up — the attested set is the
// conservative core the over-broad question needs ("your orthography says
// acute combines with e").

import type { ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { attestedBasesOf } from "@keyboard-studio/engine";
import type { OrthographyModel } from "./guardAnalysis.ts";

/**
 * Build the orthography model for guard analysis, or null when the working
 * copy has no confirmed alphabet yet (character discovery not reached) —
 * the suggestions section then stays hidden rather than guessing.
 */
export function deriveOrthographyModel(
  alphabet: ConfirmedAlphabet | undefined,
): OrthographyModel | null {
  if (alphabet === undefined) return null;
  const attested = attestedBasesOf(alphabet);
  const markAttachments = new Map<string, string[]>();
  for (const mark of alphabet.marks) {
    markAttachments.set(mark, [...(attested.get(mark) ?? [])]);
  }
  return {
    alphabet: [...alphabet.bases, ...alphabet.marks],
    markAttachments,
  };
}
