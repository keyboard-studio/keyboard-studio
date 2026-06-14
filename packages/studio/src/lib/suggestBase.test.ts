// Tests for base suggestion by the (language, script) pair, incl. the
// language/script decoupling guarantee (spec §8/§9). refs #369.

import { describe, it, expect } from "vitest";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { suggestBases } from "./suggestBase";

const mk = (id: string, script: string, languages?: string[]): BaseKeyboard => ({
  id,
  script,
  path: `release/x/${id}`,
  targets: ["windows"],
  displayName: id,
  version: "1.0",
  ...(languages !== undefined ? { languages } : {}),
});

const usqwerty = mk("basic_kbdus", "Latn");
const eurolatin = mk("sil_euro_latin", "Latn");
const devanagari = mk("sil_devanagari", "Deva");
const bases = [usqwerty, eurolatin, devanagari];

describe("suggestBases", () => {
  it("returns script-matching bases for a Latin target, fallback last", () => {
    const out = suggestBases(bases, { script: "Latn" });
    expect(out.map((s) => s.base.id)).toEqual([
      "sil_euro_latin", // script-match (input order, fallback deferred)
      "basic_kbdus",    // us-qwerty fallback ranked last
    ]);
    expect(out.find((s) => s.base.id === "basic_kbdus")?.reason).toBe(
      "us-qwerty-fallback",
    );
  });

  it("ranks a language match above a bare script match", () => {
    const out = suggestBases(
      bases,
      { script: "Latn", bcp47: "ak" },
      { languagesById: { sil_euro_latin: ["ak", "fr"] } },
    );
    expect(out[0]?.base.id).toBe("sil_euro_latin");
    expect(out[0]?.reason).toBe("language-match");
  });

  it("DECOUPLING: a hi-Latn romanization never suggests the Devanagari base", () => {
    const out = suggestBases(
      bases,
      { script: "Latn", bcp47: "hi-Latn" },
      { languagesById: { sil_devanagari: ["hi"], sil_euro_latin: ["hi-Latn"] } },
    );
    const ids = out.map((s) => s.base.id);
    expect(ids).not.toContain("sil_devanagari"); // Deva base excluded for a Latn target
    expect(out[0]?.base.id).toBe("sil_euro_latin"); // Latin Hindi base wins (language-match)
    expect(out[0]?.reason).toBe("language-match");
  });

  it("always offers the US-QWERTY fallback even when nothing matches the script", () => {
    const out = suggestBases([usqwerty, devanagari], { script: "Ethi" });
    expect(out).toHaveLength(1);
    expect(out[0]?.base.id).toBe("basic_kbdus");
    expect(out[0]?.reason).toBe("us-qwerty-fallback");
  });

  it("includes the fallback once even when it also matches the script", () => {
    const out = suggestBases(bases, { script: "Latn" });
    expect(out.filter((s) => s.base.id === "basic_kbdus")).toHaveLength(1);
  });

  it("returns [] when no base matches and no fallback is present", () => {
    expect(suggestBases([eurolatin, devanagari], { script: "Ethi" })).toEqual([]);
  });

  it("uses base.languages to build languagesById when caller provides it", () => {
    // When the caller constructs languagesById from base.languages (the pattern
    // BaseResolution uses), language-match fires correctly.
    const haBase = mk("hausa_latin", "Latn", ["ha", "ha-Latn"]);
    const allBases = [usqwerty, eurolatin, haBase];
    const languagesById = Object.fromEntries(
      allBases.map((b) => [b.id, b.languages ?? []] as const),
    );
    const suggestions = suggestBases(
      allBases,
      { script: "Latn", bcp47: "ha-Latn" },
      { languagesById },
    );
    expect(suggestions[0]?.base.id).toBe("hausa_latin");
    expect(suggestions[0]?.reason).toBe("language-match");
  });
});
