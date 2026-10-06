// Contract tests for scripts/codegen-windows-layouts.mjs, the generator behind
// ./generated/windowsLayouts.generated.json and the generated section of
// docs/keyboard-index.md (spec 076 A4). Pure-parser tests only: the corpus is
// not present in every environment and is not pinned to the committed file
// (regenerate deliberately after a corpus bump).

import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScriptModule = Record<string, any>;
let gen: ScriptModule;

beforeAll(async () => {
  gen = (await import(pathToFileURL(join(REPO_ROOT, "scripts", "codegen-windows-layouts.mjs")).href)) as ScriptModule;
});

describe("deriveFamily", () => {
  const out = (q: string, w: string, y: string, z: string, a: string) => ({
    K_Q: q, K_W: w, K_Y: y, K_Z: z, K_A: a,
  });

  it("qwerty / qwertz / azerty from the base-layer letters", () => {
    expect(gen.deriveFamily(out("q", "w", "y", "z", "a"))).toBe("qwerty");
    expect(gen.deriveFamily(out("q", "w", "z", "y", "a"))).toBe("qwertz");
    expect(gen.deriveFamily(out("a", "z", "y", "w", "q"))).toBe("azerty");
  });

  it("any non-Latin base output is non-roman", () => {
    expect(gen.deriveFamily(out("й", "ц", "н", "я", "ф"))).toBe("non-roman");
  });

  it("missing letters are other", () => {
    expect(gen.deriveFamily({ K_Q: "q" })).toBe("other");
  });
});

describe("baseOutputs", () => {
  it("reads the unshifted rule only, accepting caps-state modifiers", () => {
    const o = gen.baseOutputs(
      ["+ [K_Q] > U+0061", "+ [SHIFT K_Q] > U+0041", "+ [NCAPS K_W] > U+007a", "+ [RALT K_Y] > U+0040"].join("\n"),
      ["K_Q", "K_W", "K_Y"],
    );
    expect(o).toEqual({ K_Q: "a", K_W: "z" });
  });
});

describe("parseKps", () => {
  it("reads name, author fallback, and languages", () => {
    const kps = `<Info><Name URL="">French Basic</Name><Copyright URL="">(c) SIL</Copyright><Author URL=""></Author></Info>
      <Keyboard><Languages><Language ID="fr">French</Language><Language ID="fr-CA">French (Canada)</Language></Languages></Keyboard>`;
    expect(gen.parseKps(kps)).toEqual({
      name: "French Basic",
      author: "(c) SIL",
      languages: [{ id: "fr", name: "French" }, { id: "fr-CA", name: "French (Canada)" }],
    });
  });
});

describe("spliceIndex", () => {
  it("drops hand-written basic_kbd rows on first run and is idempotent afterwards", () => {
    const md = "| Keyboard | id |\n| --- | --- |\n| A | `alpha` |\n| French Basic | `basic_kbdfr` | x |\n";
    const sec = [gen.BEGIN_MARK, "generated", gen.END_MARK].join("\n");
    const once = gen.spliceIndex(md, sec) as string;
    expect(once).not.toContain("| French Basic |");
    expect(once).toContain("| A | `alpha` |");
    const twice = gen.spliceIndex(once, sec.replace("generated", "regenerated")) as string;
    expect(twice.match(/BEGIN WINDOWS-LAYOUTS/g)).toHaveLength(1);
    expect(twice).toContain("regenerated");
  });
});
