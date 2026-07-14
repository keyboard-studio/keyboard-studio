// T017 [US2] — keyboard-base bridge tests (spec 036, FR-014..017c, FR-015,
// FR-016a, SC-002).
//
// The bridge is pure with injected deps: relatedness is real (over the pinned
// Glottolog index), but `resolveLanguage`/`languagesById`/`scriptFallback`/
// `getBase` are stubbed. Fixtures use known Glottolog relatives of English
// (stan1293): German stan1295/deu and Dutch dutc1256/nld are same-family
// (Indo-European, Latin); Tamil tami1289/tam is cross-family (Dravidian).

import { describe, expect, it } from "vitest";
import {
  findKeyboardBaseCandidates,
  type BridgeDeps,
} from "./bridge.js";

// Stub resolver: BCP47 tag → ISO 639-3 + chosen script. Mirrors what the studio
// wires from langtags + explicit script subtags.
const TAGS: Record<string, { iso639p3?: string; script?: string }> = {
  en: { iso639p3: "eng", script: "Latn" },
  de: { iso639p3: "deu", script: "Latn" },
  nl: { iso639p3: "nld", script: "Latn" },
  ta: { iso639p3: "tam", script: "Taml" }, // Tamil, different script AND family
  "de-Cyrl": { iso639p3: "deu", script: "Cyrl" }, // German, wrong script
  und: { script: "Latn" }, // script known, no ISO
};

const resolveLanguage: BridgeDeps["resolveLanguage"] = (bcp47) =>
  TAGS[bcp47] ?? null;

describe("findKeyboardBaseCandidates — genealogical tier (FR-014/016)", () => {
  it("surfaces a same-family, same-script relative as a genealogical candidate", () => {
    const out = findKeyboardBaseCandidates(
      { bcp47: "en" },
      { resolveLanguage, languagesById: { german_kbd: ["de"] } },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.keyboardId).toBe("german_kbd");
    expect(out[0]!.tier).toBe("genealogical");
    expect(out[0]!.script).toBe("Latn");
    expect(out[0]!.closestRelative?.iso639p3).toBe("deu");
    expect(out[0]!.closestRelative?.glottocode).toBe("stan1295");
  });
});

describe("findKeyboardBaseCandidates — script coincidence (FR-017b, SC-002)", () => {
  it("excludes a related keyboard on a different script", () => {
    const out = findKeyboardBaseCandidates(
      { bcp47: "en" },
      { resolveLanguage, languagesById: { german_cyrl: ["de-Cyrl"] } },
    );
    expect(out).toEqual([]);
  });

  it("excludes a cross-family, cross-script keyboard (Tamil for English)", () => {
    const out = findKeyboardBaseCandidates(
      { bcp47: "en" },
      { resolveLanguage, languagesById: { tamil_kbd: ["ta"] } },
    );
    expect(out).toEqual([]);
  });

  it("never emits a candidate whose script differs from the target", () => {
    const out = findKeyboardBaseCandidates(
      { bcp47: "en" },
      {
        resolveLanguage,
        languagesById: { german_kbd: ["de"], tamil_kbd: ["ta"] },
        scriptFallback: () => [{ keyboardId: "some_latin_kbd" }],
      },
    );
    expect(out.every((c) => c.script === "Latn")).toBe(true);
  });
});

describe("findKeyboardBaseCandidates — direct tier (FR-017)", () => {
  it("ranks a keyboard declaring the target's own language+script first, distance 0", () => {
    const out = findKeyboardBaseCandidates(
      { bcp47: "en" },
      {
        resolveLanguage,
        languagesById: { english_kbd: ["en"], german_kbd: ["de"] },
      },
    );
    expect(out.map((c) => c.keyboardId)).toEqual(["english_kbd", "german_kbd"]);
    expect(out[0]!.tier).toBe("direct");
    expect(out[0]!.closestRelative).toEqual({
      iso639p3: "eng",
      glottocode: "stan1293",
      distance: 0,
    });
    expect(out[1]!.tier).toBe("genealogical");
  });
});

describe("findKeyboardBaseCandidates — per-keyboard dedup + alsoSupports (FR-016a, D10)", () => {
  it("emits a keyboard covering two relatives once, other relative in alsoSupports", () => {
    const out = findKeyboardBaseCandidates(
      { bcp47: "en" },
      { resolveLanguage, languagesById: { multi_kbd: ["de", "nl"] } },
    );
    expect(out).toHaveLength(1);
    const c = out[0]!;
    expect(c.tier).toBe("genealogical");
    // One relative is the closestRelative; the other is in alsoSupports.
    const covered = [c.closestRelative!.iso639p3, ...c.alsoSupports].sort();
    expect(covered).toEqual(["deu", "nld"]);
    expect(c.alsoSupports).toHaveLength(1);
  });

  it("keeps every returned candidate unique by keyboardId", () => {
    const out = findKeyboardBaseCandidates(
      { bcp47: "en" },
      {
        resolveLanguage,
        languagesById: { german_kbd: ["de"], multi_kbd: ["de", "nl"] },
        scriptFallback: () => [
          { keyboardId: "german_kbd" }, // already genealogical — must not repeat
          { keyboardId: "plain_latin" },
        ],
      },
    );
    const ids = out.map((c) => c.keyboardId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("findKeyboardBaseCandidates — script-fallback tier + ordering (FR-017c)", () => {
  it("ranks direct → genealogical → script-fallback; fallback dedups against stronger tiers", () => {
    const out = findKeyboardBaseCandidates(
      { bcp47: "en" },
      {
        resolveLanguage,
        languagesById: { english_kbd: ["en"], german_kbd: ["de"] },
        scriptFallback: () => [
          { keyboardId: "german_kbd" }, // suppressed (already genealogical)
          { keyboardId: "plain_latin" }, // pure fallback
        ],
      },
    );
    expect(out.map((c) => [c.keyboardId, c.tier])).toEqual([
      ["english_kbd", "direct"],
      ["german_kbd", "genealogical"],
      ["plain_latin", "script-fallback"],
    ]);
    const fb = out.find((c) => c.keyboardId === "plain_latin")!;
    expect(fb.closestRelative).toBeNull();
    expect(fb.alsoSupports).toEqual([]);
  });

  it("skips the fallback tier entirely when no scriptFallback is injected", () => {
    const out = findKeyboardBaseCandidates(
      { bcp47: "en" },
      { resolveLanguage, languagesById: { german_kbd: ["de"] } },
    );
    expect(out.every((c) => c.tier !== "script-fallback")).toBe(true);
  });
});

describe("findKeyboardBaseCandidates — empty result (FR-015)", () => {
  it("returns [] only when both tiers are empty (no same-script relative, no fallback)", () => {
    const out = findKeyboardBaseCandidates(
      { bcp47: "en" },
      { resolveLanguage, languagesById: { tamil_kbd: ["ta"] } },
    );
    expect(out).toEqual([]);
  });

  it("returns [] when the target resolves to no script (cannot enforce coincidence)", () => {
    const out = findKeyboardBaseCandidates(
      { bcp47: "xyz" }, // unknown → resolveLanguage yields null
      { resolveLanguage, languagesById: { german_kbd: ["de"] } },
    );
    expect(out).toEqual([]);
  });

  it("with a script but no ISO, only script-fallback can contribute", () => {
    const out = findKeyboardBaseCandidates(
      { bcp47: "und" },
      {
        resolveLanguage,
        languagesById: { german_kbd: ["de"] }, // genealogical needs targetIso
        scriptFallback: () => [{ keyboardId: "plain_latin" }],
      },
    );
    expect(out.map((c) => [c.keyboardId, c.tier])).toEqual([
      ["plain_latin", "script-fallback"],
    ]);
  });
});

describe("findKeyboardBaseCandidates — getBase + maxResults + purity", () => {
  it("populates base when getBase is injected", () => {
    const fakeBase = { id: "german_kbd", script: "Latn" } as never;
    const out = findKeyboardBaseCandidates(
      { bcp47: "en" },
      {
        resolveLanguage,
        languagesById: { german_kbd: ["de"] },
        getBase: (id) => (id === "german_kbd" ? fakeBase : undefined),
      },
    );
    expect(out[0]!.base).toBe(fakeBase);
  });

  it("honours maxResults (opt-in cap, default none)", () => {
    const deps: BridgeDeps = {
      resolveLanguage,
      languagesById: { english_kbd: ["en"], german_kbd: ["de"], multi_kbd: ["nl"] },
    };
    expect(findKeyboardBaseCandidates({ bcp47: "en" }, deps)).toHaveLength(3);
    expect(
      findKeyboardBaseCandidates({ bcp47: "en" }, deps, { maxResults: 1 }),
    ).toHaveLength(1);
    expect(
      findKeyboardBaseCandidates({ bcp47: "en" }, deps, { maxResults: 0 }),
    ).toHaveLength(0);
  });

  it("is pure: identical input yields identical output", () => {
    const deps: BridgeDeps = {
      resolveLanguage,
      languagesById: { english_kbd: ["en"], german_kbd: ["de"] },
    };
    const a = findKeyboardBaseCandidates({ bcp47: "en" }, deps);
    const b = findKeyboardBaseCandidates({ bcp47: "en" }, deps);
    expect(a).toEqual(b);
  });
});
