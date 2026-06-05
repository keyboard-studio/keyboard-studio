// see spec.md sections 8 step 3, 12 — type-coverage + factory tests for the
// KeyboardProvenance intake metadata. Shape-only under strict tsconfig
// (exactOptionalPropertyTypes + noUncheckedIndexedAccess), matching
// types.test.ts. The Phase B character-discovery contract is covered separately
// in characterDiscovery.test.ts.

import { describe, it, expect } from "vitest";
import type {
  KeyboardProvenance,
  RequesterInfo,
  CommunityRepresentative,
} from "./provenance";
import { makeKeyboardProvenance } from "./provenance";
import {
  fullProvenance,
  emptyProvenance,
  minimalProvenance,
} from "./fixtures/provenance";

// -----------------------------------------------------------------------------
// KeyboardProvenance (spec §8 step 3, §12)
// -----------------------------------------------------------------------------

describe("KeyboardProvenance interface", () => {
  it("is fully optional — an empty object is a valid value (non-gating)", () => {
    const p: KeyboardProvenance = {};
    expect(Object.keys(p)).toHaveLength(0);
  });

  it("accepts the nested requester and communityRep sub-objects", () => {
    const requester: RequesterInfo = {
      name: "Awa",
      contact: "awa@example.org",
      affiliation: "RLI",
      relationToCommunity: "speaker",
    };
    const communityRep: CommunityRepresentative = {
      name: "Ibrahim",
      role: "chair",
      email: "ibrahim@example.org",
    };
    const p: KeyboardProvenance = { requester, communityRep };
    expect(p.requester?.name).toBe("Awa");
    expect(p.communityRep?.role).toBe("chair");
  });

  it("carries the flat sociolinguistic + reference fields", () => {
    const p: KeyboardProvenance = {
      localizedName: "Sɛnɛ kan",
      speakerCount: "~12,000",
      regions: "south",
      languageStatus: "6a",
      existingTools: "Word macro",
      orthographyUrl: "https://example.org/o.pdf",
      communityInvolvement: "weekly testing",
      casingNotes: "ŋ/Ŋ",
      additionalNotes: "tone unmarked",
      textSampleRef: "samples/x.txt",
    };
    expect(p.localizedName).toBe("Sɛnɛ kan");
    expect(p.textSampleRef).toBe("samples/x.txt");
  });
});

describe("makeKeyboardProvenance factory", () => {
  it("strips undefined top-level keys (exactOptionalPropertyTypes)", () => {
    const p = makeKeyboardProvenance({
      localizedName: "Sɛnɛ kan",
      regions: undefined,
      speakerCount: undefined,
    });
    expect("localizedName" in p).toBe(true);
    expect("regions" in p).toBe(false);
    expect("speakerCount" in p).toBe(false);
  });

  it("strips undefined keys inside nested requester/communityRep", () => {
    const p = makeKeyboardProvenance({
      requester: { name: "Awa", contact: undefined, affiliation: undefined },
      communityRep: { email: "ibrahim@example.org", name: undefined },
    });
    expect(p.requester).toEqual({ name: "Awa" });
    expect(p.communityRep).toEqual({ email: "ibrahim@example.org" });
  });

  it("omits a nested object entirely when it was not provided", () => {
    const p = makeKeyboardProvenance({ localizedName: "x" });
    expect("requester" in p).toBe(false);
    expect("communityRep" in p).toBe(false);
  });

  it("an empty input yields an empty object", () => {
    expect(makeKeyboardProvenance({})).toEqual({});
  });
});

describe("provenance fixtures", () => {
  it("fullProvenance round-trips every field", () => {
    expect(fullProvenance.requester?.name).toBe("Awa Traoré");
    expect(fullProvenance.communityRep?.email).toBe("ibrahim@example.org");
    expect(fullProvenance.languageStatus).toBe("6a (Vigorous)");
    expect(fullProvenance.textSampleRef).toBe("samples/sene-corpus.txt");
  });

  it("emptyProvenance is the empty object", () => {
    expect(emptyProvenance).toEqual({});
  });

  it("minimalProvenance dropped the unset requester sub-field", () => {
    expect(minimalProvenance.requester).toEqual({
      name: "Awa Traoré",
      contact: "awa@example.org",
    });
    expect("affiliation" in (minimalProvenance.requester ?? {})).toBe(false);
  });
});
