// T021 [US2] — genealogical base-tier integration (spec 036 US2, FR-014..017c).
//
// Exercises the studio-side composition: the REAL Glottolog bridge (over the
// pinned classification data) merged into the existing suggestBases ranking. A
// target with no direct keyboard must surface a genealogical base AHEAD of a
// pure same-script match. resolveLanguage is stubbed (as the studio wires it
// from langtags): German de→deu is a same-family relative of English; a plain
// Latin base supports no relative.

import { describe, expect, it } from "vitest";
import { makeBaseKeyboard } from "@keyboard-studio/contracts/fixtures";
import { suggestBases } from "./suggestBase.ts";
import {
  applyGenealogicalTier,
  makeResolveLanguage,
  type ResolveLanguage,
} from "./genealogyTier.ts";
import type { LanguageDefaults } from "@keyboard-studio/contracts";

const germanBase = makeBaseKeyboard({
  id: "german_kbd",
  script: "Latn",
  path: "release/g/german_kbd",
  targets: ["windows"],
  displayName: "German",
  version: "1.0",
});
const plainLatin = makeBaseKeyboard({
  id: "plain_latin",
  script: "Latn",
  path: "release/p/plain_latin",
  targets: ["windows"],
  displayName: "Plain Latin",
  version: "1.0",
});

// resolveLanguage is built the same way the studio wires it (langtags-backed),
// so it parses primary subtag + explicit script (the bridge resolves "en-Latn").
// German (deu, Latin) is a real Glottolog relative of English; Finnish (fin) is
// Latin but Uralic — cross-family, so it never becomes genealogical.
const DEFAULTS: Record<string, LanguageDefaults> = {
  en: { code: "en", iso639_3: "eng", defaultScript: "Latn", regions: [] },
  de: { code: "de", iso639_3: "deu", defaultScript: "Latn", regions: [] },
  nl: { code: "nl", iso639_3: "nld", defaultScript: "Latn", regions: [] },
  fi: { code: "fi", iso639_3: "fin", defaultScript: "Latn", regions: [] },
};
const resolveLanguage: ResolveLanguage = makeResolveLanguage(
  (s) => DEFAULTS[s] ?? null,
);

const languagesById = { german_kbd: ["de"], plain_latin: ["fi"] };

describe("applyGenealogicalTier — integration over real relatedness", () => {
  it("ranks a genealogical base ahead of a pure script-match", () => {
    const bases = [germanBase, plainLatin];
    const target = { script: "Latn", bcp47: "en" };
    const ranked = suggestBases(bases, target, { languagesById });
    // Both are plain script-matches before the genealogical merge.
    expect(ranked.every((s) => s.reason === "script-match")).toBe(true);

    const resolved = applyGenealogicalTier(ranked, target, {
      resolveLanguage,
      languagesById,
    });
    expect(resolved.map((s) => [s.base.id, s.reason])).toEqual([
      ["german_kbd", "genealogical"], // promoted + ranked first
      ["plain_latin", "script-match"], // unrelated, stays a plain match
    ]);

    // The genealogical suggestion names the closest relative that ranked it
    // (German, deu) and carries the numeric path-length distance for the UI.
    const german = resolved[0]!;
    expect(german.relative?.iso639p3).toBe("deu");
    expect(german.relative?.name).toBeTruthy();
    expect(german.relative?.distance).toBeGreaterThan(0);
    // Pure script-matches carry no relative.
    expect(resolved[1]!.relative).toBeUndefined();
  });

  it("orders genealogical bases by full both-legs distance (closer relative first)", () => {
    // For an English target, Dutch and German share the same West-Germanic
    // ancestor (equal up-leg) but Dutch sits on a shorter down-leg — so Dutch is
    // the closer relative by TOTAL path length. The Dutch base must rank ahead
    // of the German one, and its distance must be strictly smaller.
    const dutchBase = makeBaseKeyboard({
      id: "dutch_kbd",
      script: "Latn",
      path: "release/d/dutch_kbd",
      targets: ["windows"],
      displayName: "Dutch",
      version: "1.0",
    });
    const target = { script: "Latn", bcp47: "en" };
    const byId = { dutch_kbd: ["nl"], german_kbd: ["de"] };
    const ranked = suggestBases([germanBase, dutchBase], target, {
      languagesById: byId,
    });
    const resolved = applyGenealogicalTier(ranked, target, {
      resolveLanguage,
      languagesById: byId,
    });
    expect(resolved.map((s) => s.base.id)).toEqual(["dutch_kbd", "german_kbd"]);
    const dutch = resolved[0]!.relative!;
    const german = resolved[1]!.relative!;
    expect(dutch.iso639p3).toBe("nld");
    expect(german.iso639p3).toBe("deu");
    expect(dutch.distance).toBeLessThan(german.distance); // both legs counted
  });

  it("leaves ranking unchanged when no base supports a relative", () => {
    const bases = [plainLatin];
    const target = { script: "Latn", bcp47: "en" };
    const ranked = suggestBases(bases, target, { languagesById });
    const resolved = applyGenealogicalTier(ranked, target, {
      resolveLanguage,
      languagesById,
    });
    expect(resolved.map((s) => s.reason)).toEqual(["script-match"]);
  });

  it("never downgrades a language-match to genealogical", () => {
    // A base that directly supports English keeps language-match even though
    // English is trivially 'related' to itself's relatives.
    const englishBase = makeBaseKeyboard({
      id: "english_kbd",
      script: "Latn",
      path: "release/e/english_kbd",
      targets: ["windows"],
      displayName: "English",
      version: "1.0",
    });
    const target = { script: "Latn", bcp47: "en" };
    const byId = { english_kbd: ["en"], german_kbd: ["de"] };
    const ranked = suggestBases([englishBase, germanBase], target, {
      languagesById: byId,
    });
    const resolved = applyGenealogicalTier(ranked, target, {
      resolveLanguage,
      languagesById: byId,
    });
    expect(resolved.map((s) => [s.base.id, s.reason])).toEqual([
      ["english_kbd", "language-match-monolingual"], // only "en" declared
      ["german_kbd", "genealogical"],
    ]);
  });
});

describe("makeResolveLanguage — langtags adapter", () => {
  const defaults: Record<string, LanguageDefaults> = {
    hi: { code: "hi", iso639_3: "hin", defaultScript: "Deva", regions: [] },
  };
  const resolve = makeResolveLanguage((s) => defaults[s] ?? null);

  it("uses the language default script for a bare tag", () => {
    expect(resolve("hi")).toEqual({ iso639p3: "hin", script: "Deva" });
  });

  it("honours an explicit script subtag over the default", () => {
    expect(resolve("hi-Latn")).toEqual({ iso639p3: "hin", script: "Latn" });
  });

  it("normalizes script casing to ISO 15924 title-case", () => {
    expect(resolve("hi-latn")?.script).toBe("Latn");
  });

  it("returns null for an unknown, script-less tag", () => {
    expect(resolve("zz")).toBeNull();
  });
});
