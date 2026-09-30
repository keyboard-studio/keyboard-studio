/**
 * Tests for the pinned in-repo Unicode data table (spec 082, FR-021).
 *
 * Spot-checks against known UnicodeData values (including the algorithmic
 * CJK/Tangut/Hangul names), structural invariants of the range encoding,
 * and the determinism gate: the checked-in generated module must match a
 * fresh regeneration from the pinned lib/ucd/UnicodeData.txt.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CATEGORIES,
  NAME_KIND,
  NAME_OFFSETS,
  RUNS,
  UNICODE_VERSION,
} from "./unicodeData.generated.js";
import { getCategory, getCCC, getName } from "./index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
const SOURCE_FILE = resolve(REPO_ROOT, "lib", "ucd", "UnicodeData.txt");
const PIN_FILE = resolve(REPO_ROOT, "scripts", "ucd-version.json");
const GENERATOR = resolve(REPO_ROOT, "scripts", "generate-unicode-data.mjs");

describe("getCategory", () => {
  it("U+0041 → Lu", () => {
    expect(getCategory(0x0041)).toBe("Lu");
  });
  it("U+0327 → Mn", () => {
    expect(getCategory(0x0327)).toBe("Mn");
  });
  it("unassigned U+0378 → undefined (never \"Cn\")", () => {
    expect(getCategory(0x0378)).toBeUndefined();
  });
  it("surrogate U+D800 → Cs", () => {
    expect(getCategory(0xd800)).toBe("Cs");
  });
  it("private use U+E000 → Co", () => {
    expect(getCategory(0xe000)).toBe("Co");
  });
  it("control U+0000 → Cc", () => {
    expect(getCategory(0x0000)).toBe("Cc");
  });
  it("astral unassigned U+10FFFF → undefined", () => {
    expect(getCategory(0x10ffff)).toBeUndefined();
  });
  it("out-of-range and non-integer input → undefined", () => {
    expect(getCategory(-1)).toBeUndefined();
    expect(getCategory(0x110000)).toBeUndefined();
    expect(getCategory(Number.NaN)).toBeUndefined();
    expect(getCategory(65.5)).toBeUndefined();
  });
});

describe("getCCC", () => {
  it("U+0327 → 202 (attached below)", () => {
    expect(getCCC(0x0327)).toBe(202);
  });
  it("U+0300 → 230 (above)", () => {
    expect(getCCC(0x0300)).toBe(230);
  });
  it("Arabic harakat fixed-position classes 27/29/33", () => {
    expect(getCCC(0x064b)).toBe(27);
    expect(getCCC(0x064d)).toBe(29);
    expect(getCCC(0x0651)).toBe(33);
  });
  it("U+0345 → 240, U+035C → 233 (the hand-rolled table got these wrong)", () => {
    expect(getCCC(0x0345)).toBe(240);
    expect(getCCC(0x035c)).toBe(233);
  });
  it("U+0041 → 0", () => {
    expect(getCCC(0x0041)).toBe(0);
  });
  it("unassigned U+0378 → undefined", () => {
    expect(getCCC(0x0378)).toBeUndefined();
  });
});

describe("getName", () => {
  it("U+0327 → COMBINING CEDILLA", () => {
    expect(getName(0x0327)).toBe("COMBINING CEDILLA");
  });
  it("U+0041 → LATIN CAPITAL LETTER A", () => {
    expect(getName(0x0041)).toBe("LATIN CAPITAL LETTER A");
  });
  it("unassigned U+0378 → undefined", () => {
    expect(getName(0x0378)).toBeUndefined();
  });
  it("CJK ranges use the algorithmic name, never a placeholder", () => {
    expect(getName(0x4e00)).toBe("CJK UNIFIED IDEOGRAPH-4E00");
    expect(getName(0x9fff)).toBe("CJK UNIFIED IDEOGRAPH-9FFF");
    expect(getName(0x3400)).toBe("CJK UNIFIED IDEOGRAPH-3400");
    expect(getName(0x20000)).toBe("CJK UNIFIED IDEOGRAPH-20000");
  });
  it("Tangut ranges use the algorithmic name", () => {
    expect(getName(0x17000)).toBe("TANGUT IDEOGRAPH-17000");
    expect(getName(0x18d00)).toBe("TANGUT IDEOGRAPH-18D00");
  });
  it("Hangul syllables use the normative algorithmic names", () => {
    expect(getCategory(0xac00)).toBe("Lo");
    expect(getCCC(0xac00)).toBe(0);
    expect(getName(0xac00)).toBe("HANGUL SYLLABLE GA");
    expect(getName(0xd7a3)).toBe("HANGUL SYLLABLE HIH");
  });
  it("surrogates, private use, and <control> have no real name → undefined", () => {
    expect(getName(0xd800)).toBeUndefined();
    expect(getName(0xe000)).toBeUndefined();
    expect(getName(0x0000)).toBeUndefined();
  });
});

describe("range-encoding invariants", () => {
  it("runs are sorted, non-overlapping, and well-formed", () => {
    expect(RUNS.length).toBeGreaterThan(0);
    let prevEnd = -1;
    for (const run of RUNS) {
      const [start, end, catIdx, ccc, nameKind, nameBase] = run;
      expect(start).toBeLessThanOrEqual(end);
      expect(start).toBeGreaterThan(prevEnd);
      expect(end).toBeLessThanOrEqual(0x10ffff);
      expect(catIdx).toBeGreaterThanOrEqual(0);
      expect(catIdx).toBeLessThan(CATEGORIES.length);
      expect(ccc).toBeGreaterThanOrEqual(0);
      expect(ccc).toBeLessThanOrEqual(255);
      expect(Object.values(NAME_KIND)).toContain(nameKind);
      if (nameKind === NAME_KIND.STORED) {
        expect(nameBase).toBeGreaterThanOrEqual(0);
        expect(nameBase).toBeLessThan(NAME_OFFSETS.length);
      } else {
        expect(nameBase).toBe(-1);
      }
      prevEnd = end;
    }
    // 3,666 runs × several expects is slow under vitest; the default 5s
    // timeout is not enough on a cold import of the 1.5 MB table.
  }, 120000);

  it("category lookup agrees with the table across every run boundary", () => {
    // Exercises the binary search at every decision point: each run's start
    // and end resolve to its own category, and the codepoint just below a
    // run start resolves to the previous run's category when the runs are
    // contiguous — or to undefined across an unassigned gap. (The old
    // assertion here assumed a boundary neighbour always differs in category
    // or ccc; it does not — e.g. U+038B is unassigned between two Lu/0 runs
    // at U+038A and U+038C.)
    for (let i = 0; i < RUNS.length; i++) {
      const run = RUNS[i];
      if (run === undefined) throw new Error(`missing run ${i}`);
      const [start, end, catIdx] = run;
      const expected = CATEGORIES[catIdx];
      expect(getCategory(start)).toBe(expected);
      expect(getCategory(end)).toBe(expected);
      if (i === 0) {
        if (start > 0) expect(getCategory(start - 1)).toBeUndefined();
        continue;
      }
      const prevRun = RUNS[i - 1];
      if (prevRun === undefined) throw new Error(`missing run ${i - 1}`);
      const prevEnd = prevRun[1] ?? -1;
      const prevCatIdx = prevRun[2];
      expect(prevEnd).toBeLessThan(start); // sorted, non-overlapping
      if (prevEnd === start - 1) {
        // Contiguous runs: the neighbour belongs to the previous run. (The
        // generator merges contiguous same-key runs, so the keys differ here
        // and the binary search must not return the current run.)
        expect(getCategory(start - 1)).toBe(CATEGORIES[prevCatIdx]);
      } else {
        // Unassigned gap: the boundary codepoint resolves to undefined.
        expect(getCategory(start - 1)).toBeUndefined();
      }
    }
  }, 120000);
});

describe("version pin", () => {
  it("UNICODE_VERSION matches scripts/ucd-version.json", () => {
    if (!existsSync(PIN_FILE)) {
      console.warn(`[skip] pin file not found: ${PIN_FILE}`);
      return;
    }
    const pin = JSON.parse(readFileSync(PIN_FILE, "utf8")) as { unicodeVersion?: string };
    expect(UNICODE_VERSION).toBe("17.0.0");
    expect(pin.unicodeVersion).toBe(UNICODE_VERSION);
  });
});

describe("determinism", () => {
  it("checked-in module matches a fresh regeneration", () => {
    if (!existsSync(SOURCE_FILE)) {
      // No network fetch is involved (source is the pinned lib/ucd copy),
      // so this only skips when the checkout itself lacks the data file.
      console.warn(`[skip] UCD source not in checkout: ${SOURCE_FILE}`);
      return;
    }
    expect(() =>
      execFileSync("node", [GENERATOR, "--check"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});
