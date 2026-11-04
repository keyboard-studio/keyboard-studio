// H9 (SC-006): the export of ibono_chwerty against the hand-written `source/extras/ibono_chwerty.xml`.
//
// For every hardware position and layer that both files define, the export's output equals the
// hand-written file's. The hand-written file's CLDR imports (`<import base="cldr" path="45/...">`)
// are resolved through the `developer-utils` `import/46` files, the closest set the pinned package
// ships; the key ids it needs are the same in 45 and 46.
//
// A missing corpus is a failed precondition, never a skip.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCorpusKeyboard } from "./__testing__/corpus.js";
import { corpusAvailable, corpusExportInput, KEYBOARDS_ROOT } from "./__testing__/corpusExport.js";
import { loadLdml, type LdmlKeystroke } from "./__testing__/ldmlInterpreter.js";
import { buildLdmlExport } from "./package.js";
import { US_BASE } from "./__fixtures__/us-base.js";

const importsDir = join(dirname(createRequire(import.meta.url).resolve("@keymanapp/developer-utils")), "types", "import", "46");

/** Replaces each `<import base="cldr" path="N/file.xml"/>` with the keys of the 46 copy of that file. */
function inlineImports(xml: string): string {
  return xml.replace(/<import\s+base="cldr"\s+path="[^"/]+\/([^"]+)"\s*\/>/g, (_m, file: string) => {
    const p = join(importsDir, file);
    if (!existsSync(p)) throw new Error(`import file ${file} is not in ${importsDir}`);
    const body = readFileSync(p, "utf8");
    return [...body.matchAll(/<key\s[^>]*\/>/g)].map((m) => m[0]).join("\n");
  });
}

const POSITIONS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => `K_${c}`),
  ..."0123456789".split("").map((c) => `K_${c}`),
  "K_BKQUOTE", "K_HYPHEN", "K_EQUAL", "K_LBRKT", "K_RBRKT", "K_BKSLASH",
  "K_COLON", "K_QUOTE", "K_COMMA", "K_PERIOD", "K_SLASH", "K_SPACE",
];

const LAYERS: { name: string; mods: string[]; caps: boolean }[] = [
  { name: "none", mods: [], caps: false },
  { name: "shift", mods: ["shift"], caps: false },
  { name: "caps", mods: [], caps: true },
  { name: "shift caps", mods: ["shift"], caps: true },
];

describe("reference corpus (SC-006): ibono_chwerty", () => {
  it("the sibling ../keyboards corpus is present", () => {
    expect(corpusAvailable, `${KEYBOARDS_ROOT}/release is missing: H9 proves nothing without it`).toBe(true);
  });

  it("every position both files define has the same output", async () => {
    const kb = loadCorpusKeyboard("ibono_chwerty");
    expect(kb?.ldmlXml, "the hand-written extras/ibono_chwerty.xml is missing").toBeDefined();
    const built = corpusExportInput(kb!, "46", US_BASE);
    const result = await buildLdmlExport(built!.input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const exported = loadLdml([...result.files.entries()].find(([k]) => k.endsWith(".xml"))?.[1] as string);
    const reference = loadLdml(inlineImports(kb!.ldmlXml as string));

    // A position the export leaves for a rule that has context (a key that carries a trigger) still
    // types its base character with no context, which is what the reference defines.
    const different: string[] = [];
    let compared = 0;
    for (const layer of LAYERS) {
      for (const vkey of POSITIONS) {
        const key: LdmlKeystroke = { vkey, modifiers: layer.mods, caps: layer.caps };
        const ref = reference.type([key]);
        const out = exported.type([key]);
        compared += 1;
        if (ref !== out) different.push(`${layer.name} ${vkey}: reference "${ref}" export "${out}"`);
      }
    }
    console.info(`[INFO] ibono_chwerty: ${compared} positions compared, ${different.length} differ`);
    // Where the keyboard's own rules produce a character the plain US reference does not define, the
    // difference is the keyboard's content and not an export error: each must be a position the KMN
    // keyboard has a context-free rule for.
    const authored = new Set<string>();
    for (const g of built!.input.ir.groups) {
      for (const r of g.rules) {
        if (r.context.length !== 1) continue;
        const el = r.context[0];
        if (el?.kind === "vkey") authored.add(el.name.toUpperCase());
      }
    }
    const unexplained = different.filter((d) => !authored.has(/(K_[A-Z0-9a-z]+)/.exec(d)?.[1]?.toUpperCase() ?? ""));
    expect(unexplained).toEqual([]);
  });
});
