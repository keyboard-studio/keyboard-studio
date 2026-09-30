// Contract tests for scripts/codegen-host-layouts.mjs, the generator behind
// ./generated/hostLayouts.generated.json (spec 076 FR-023).
//
// The parser tests always run. The staleness check re-derives the tables from
// the sibling keyboards corpus and compares them with the committed file; it
// runs wherever the corpus is present (CI places it at ../keyboards) and is a
// visible skip otherwise.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
const KEYBOARDS_DIR = resolve(REPO_ROOT, "..", "keyboards");
const HAS_CORPUS = existsSync(join(KEYBOARDS_DIR, "release", "basic"));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScriptModule = Record<string, any>;

let codegen: ScriptModule;

beforeAll(async () => {
  codegen = (await import(
    pathToFileURL(join(REPO_ROOT, "scripts", "codegen-host-layouts.mjs")).href
  )) as ScriptModule;
});

describe("codegen-host-layouts parser", () => {
  it("reads the four modifier layers and upper-cases key ids", () => {
    const layers = codegen.parseBasicKeyboard(
      [
        "+ [K_A] > U+0061",
        "+ [SHIFT K_A] > U+0041",
        "+ [RALT K_4] > U+20ac c euro",
        "+ [SHIFT RALT K_A] > U+00c1",
        "+ [K_oE2] > U+003c",
      ].join("\n"),
      "t",
    );
    expect(layers.base).toEqual({ K_A: "a", K_OE2: "<" });
    expect(layers.shift).toEqual({ K_A: "A" });
    expect(layers.altgr).toEqual({ K_4: "€" });
    expect(layers.shiftAltgr).toEqual({ K_A: "Á" });
  });

  it("marks dk() outputs as deadkeys and ignores context and Ctrl rules", () => {
    const layers = codegen.parseBasicKeyboard(
      ["+ [K_QUOTE] > dk(0027)", "dk(0027) + [K_A] > U+00e1", "+ [CTRL K_A] > U+0001"].join("\n"),
      "t",
    );
    expect(layers.base).toEqual({ K_QUOTE: codegen.DEADKEY });
    expect(layers.altgr).toEqual({});
  });

  it("keeps the first rule for a key, as Keyman does", () => {
    const layers = codegen.parseBasicKeyboard("+ [K_A] > U+0061\n+ [K_A] > U+0062", "t");
    expect(layers.base).toEqual({ K_A: "a" });
  });

  it("fails loudly on an output it cannot model", () => {
    expect(() => codegen.parseBasicKeyboard("+ [K_A] > 'a'", "t")).toThrow(/unsupported rule output/);
  });
});

describe("committed host tables match the keyboards corpus", () => {
  it.skipIf(!HAS_CORPUS)(
    `re-derives hostLayouts.generated.json from ${KEYBOARDS_DIR} (skipped: corpus not present)`,
    () => {
      const committed = JSON.parse(readFileSync(codegen.OUTPUT_PATH, "utf8"));
      const built = codegen.buildHostLayouts(KEYBOARDS_DIR);
      // The corpus commit is provenance only; a bump that leaves the five
      // source keyboards untouched must not force a regeneration.
      expect(committed.source.files).toEqual(built.files);
      expect(committed.hosts).toEqual(built.hosts);
    },
  );
});
