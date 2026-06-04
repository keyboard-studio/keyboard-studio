// see spec.md section 8 step 3 / section 12 — KeyboardProvenance test fixtures

import { makeKeyboardProvenance } from "../provenance";
import type { KeyboardProvenance } from "../provenance";

/**
 * A fully-populated provenance record — every optional field present — mirroring
 * a request form filled in completely. Used to exercise serialization into the
 * PR body / package metadata (§12).
 */
export const fullProvenance: KeyboardProvenance = makeKeyboardProvenance({
  requester: {
    name: "Awa Traoré",
    contact: "awa@example.org",
    affiliation: "Regional Language Institute",
    relationToCommunity: "mother-tongue speaker",
  },
  communityRep: {
    name: "Ibrahim Diallo",
    role: "language committee chair",
    email: "ibrahim@example.org",
  },
  localizedName: "Sɛnɛ kan",
  speakerCount: "~12,000",
  regions: "Southern river provinces; diaspora in the capital",
  languageStatus: "6a (Vigorous)",
  existingTools: "An informal Word macro and a printed orthography chart",
  orthographyUrl: "https://example.org/orthography.pdf",
  communityInvolvement:
    "Two committee members can test weekly; village schools can trial it next term",
  casingNotes: "Standard Latin bicameral; ŋ/Ŋ pair must be preserved",
  additionalNotes: "Tone is usually left unmarked in everyday writing",
  textSampleRef: "samples/sene-corpus.txt",
});

/**
 * The empty provenance state — the requester supplied nothing. Valid because
 * provenance is non-gating; `makeKeyboardProvenance` yields `{}`.
 */
export const emptyProvenance: KeyboardProvenance = makeKeyboardProvenance({});

/**
 * A minimal-but-useful record: just enough to attribute and contact, with one
 * nested sub-field left blank to exercise nested undefined-stripping.
 */
export const minimalProvenance: KeyboardProvenance = makeKeyboardProvenance({
  requester: { name: "Awa Traoré", contact: "awa@example.org" },
  localizedName: "Sɛnɛ kan",
});
