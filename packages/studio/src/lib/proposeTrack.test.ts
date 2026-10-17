// proposeTrack — unit coverage for the authoring-track proposer.
//
// Cases are the rule's arms: a single matching base language proposes
// adapt; every other shape proposes copy, each with its own reason basis.

import { beforeAll, describe, expect, it } from "vitest";
import { loadLangtags } from "./langtagsDefaults.ts";
import { proposeTrack } from "./proposeTrack.ts";

describe("proposeTrack", () => {
  it("proposes adapt when the base's single language is exactly the target", () => {
    const p = proposeTrack("ewo", ["ewo"]);
    expect(p.track).toBe("adapt");
    expect(p.basis).toBe("same-language");
    expect(p.params).toEqual({ target: "ewo" });
  });

  it("proposes adapt when the target spells out the script the base tag carries", () => {
    expect(proposeTrack("hi-Deva", ["hi-Deva"]).track).toBe("adapt");
    expect(proposeTrack("az-Latn", ["az-Latn"]).track).toBe("adapt");
  });

  it("is case-insensitive across language and script subtags", () => {
    expect(proposeTrack("AZ-latn", ["az-Latn"]).track).toBe("adapt");
  });

  it("ignores a region subtag difference — same language and script still adapt", () => {
    expect(proposeTrack("fr-FR", ["fr"]).track).toBe("adapt");
    expect(proposeTrack("fr", ["fr-CA"]).track).toBe("adapt");
  });

  it("proposes copy when the base's single language differs from the target", () => {
    const p = proposeTrack("ewo", ["fr"]);
    expect(p.track).toBe("copy");
    expect(p.basis).toBe("different-language");
    expect(p.params).toEqual({ base: "fr", target: "ewo" });
  });

  it("proposes copy for a multi-language base, even one that includes the target", () => {
    const p = proposeTrack("en", ["en", "id", "ms", "ht"]);
    expect(p.track).toBe("copy");
    expect(p.basis).toBe("multiple-languages");
    expect(p.params).toEqual({ count: 4, target: "en" });
  });

  it("proposes copy when the script differs for the same language", () => {
    const p = proposeTrack("hi-Latn", ["hi-Deva"]);
    expect(p.track).toBe("copy");
    expect(p.basis).toBe("different-script");
    expect(p.params).toEqual({ base: "hi-Deva", target: "hi-Latn" });
    expect(proposeTrack("az-Arab", ["az-Latn"]).track).toBe("copy");
  });

  it("proposes copy when the base declares no languages", () => {
    for (const missing of [undefined, [], ["", "  "]] as const) {
      const p = proposeTrack("ewo", missing);
      expect(p.track).toBe("copy");
      expect(p.basis).toBe("no-base-languages");
    }
  });

  it("proposes copy when no target tag is known", () => {
    for (const missing of [undefined, "", "  "] as const) {
      const p = proposeTrack(missing, ["ewo"]);
      expect(p.track).toBe("copy");
      expect(p.basis).toBe("no-target");
    }
  });

  it("always names a basis and the params its catalogue reason interpolates", () => {
    // The reason text itself is catalogue copy (track.proposal.reason.*),
    // resolved by the caption consumer — this proposer owns only the
    // basis and the interpolation values for it.
    expect(proposeTrack("ewo", ["ewo"]).params).toEqual({ target: "ewo" });
    expect(proposeTrack("ewo", ["fr"]).params).toEqual({ base: "fr", target: "ewo" });
    expect(proposeTrack("ewo", undefined).params).toEqual({ target: "ewo" });
    expect(proposeTrack(undefined, undefined).params).toEqual({});
    for (const p of [
      proposeTrack("ewo", ["ewo"]),
      proposeTrack("ewo", ["fr"]),
      proposeTrack("ewo", undefined),
      proposeTrack(undefined, undefined),
    ]) {
      expect(p.basis).toBeTruthy();
      expect(p.params).toBeTypeOf("object");
    }
  });
});

// The canonical target tag omits the script when it is the language's
// langtags default, so a bare target must still match a base that spells
// that script out — the same normalisation buildTargetBcp47 applies.
describe("proposeTrack — suppressed-script normalisation (langtags loaded)", () => {
  // The langtags module is a large generated chunk; its first dynamic load
  // can exceed the default 10s hook timeout on a slow machine.
  beforeAll(async () => {
    await loadLangtags();
  }, 60_000);

  it("a bare target matches a base carrying its default script explicitly", () => {
    // Ewondo's default script is Latn; the canonical target tag is "ewo".
    expect(proposeTrack("ewo", ["ewo-Latn"]).track).toBe("adapt");
  });

  it("a bare target does not match a base in a non-default script", () => {
    const p = proposeTrack("ewo", ["ewo-Arab"]);
    expect(p.track).toBe("copy");
    expect(p.basis).toBe("different-script");
  });
});
