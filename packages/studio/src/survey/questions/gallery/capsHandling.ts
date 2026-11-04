// capsHandling — gallery decision module for `caps-handling` (spec 112).
//
// How the copied keyboard treats Caps Lock: `cased-keys` (declare
// `store(&CasedKeys)`, the engine does the rest), `explicit-rules` (keep the
// copy's own CAPS/NCAPS rules) or `none`. The value is just `{ mode }`; the
// key set the store lists is derived at projection step 2.8
// (lib/projectWorkingCopyVfs.ts) from the working copy as it stands, so a key
// assigned later is covered without re-deciding. The decision has no
// working-copy effect of its own — `apply` is deliberately empty.
//
// Seeding: a cased alphabet seeds `{ mode: "cased-keys" }` with provenance
// "default" (the author confirms or changes it); a caseless alphabet seeds
// nothing and the renderer records the step as not asked.
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import type { CapsHandlingValue } from "../../../decisions/decisionTypes.ts";
import { CapsHandlingRenderer } from "../../caps/CapsHandlingRenderer.tsx";
import { alphabetOf, isCasedAlphabet } from "../../caps/capsLogic.ts";

// The pure helpers live in caps/capsLogic.ts (the renderer imports them too;
// declaring them here would close a module<->renderer import cycle, D-090-8).
export { alphabetOf, capsModesOffered, hasCapsRules, isCasedAlphabet } from "../../caps/capsLogic.ts";

export type { CapsHandlingValue };

export const definition = {
  id: "capsHandling",
  type: "notice" as const,
  prompt: "How should Caps Lock behave on this keyboard?",
  audit_label: "Caps handling",
};

const capsHandling: GalleryModule<CapsHandlingValue> = {
  definition,
  provides: ["caps-handling"],
  screen: "layout",
  // The layout screen belongs to windows-layout; naming it as the group makes
  // this an intra-step member of that screen (deriveScreens.isScreenOwner).
  group: "layout",
  requires: ["character-inventory", "windows-layout"],
  inputs: [],
  writes: [],
  apply: () => ({}),
  // Caseless alphabets are not asked and record no decision (FR-004).
  seedWhen: (decisions) => isCasedAlphabet(alphabetOf(decisions["character-inventory"]?.value)),
  lookupDefault: () => ({ value: { mode: "cased-keys" } satisfies CapsHandlingValue }),
  renderer: CapsHandlingRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default capsHandling;
