// PunctuationStepHost — the manifest step component for the
// `punctuation` step (spec 090 T022): the gallery-host wrapper around
// PunctuationStep, the `punctuation-inventory` module's renderer.
//
// The wrapper owns nothing but the hosting: it reads the recorded
// decision, composes the live host deps, and hands the manifest step's
// navigation to the renderer through GalleryStepContext. The step's
// edits flow through the shared inventory-draft surface
// (useInventoryDraft.ts), which maintains this decision's value as a
// projection of the character-inventory value (D-090-10(d)).

import { makeGalleryStepHost } from "../makeGalleryStepHost.tsx";
import punctuationInventoryModule from "../questions/gallery/punctuationInventory.ts";

const PunctuationStepHost = makeGalleryStepHost(
  punctuationInventoryModule,
  "punctuation-inventory",
  "punctuation",
);

export { PunctuationStepHost };
