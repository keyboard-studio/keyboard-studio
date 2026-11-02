import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { AZERTY_BASE } from "./__fixtures__/azerty-base.js";
import { exportFixture, exportInput, xmlOf } from "./__fixtures__/helpers.js";
import { loadLdml, type LdmlKeystroke } from "./__testing__/ldmlInterpreter.js";
import { classifyDetailed } from "./classify/classify.js";
import { lowerDocument } from "./lower/document.js";
import { resolveLdmlProfile } from "./profiles/resolve.js";
import { buildLdmlExport } from "./package.js";

const k = (vkey: string, modifiers: readonly string[] = [], caps = false): LdmlKeystroke => ({ vkey, modifiers, caps });

async function okFiles(name: string, base = undefined as Parameters<typeof exportFixture>[2]) {
  const r = await exportFixture(name, "46", base);
  if (!r.ok) throw new Error("refused");
  return r;
}

describe("buildLdmlExport: Story 1", () => {
  it("scenario 1: plain.kmn gives A=N=0 and the report says nothing was lost", async () => {
    const r = await okFiles("plain.kmn");
    expect(r.classification.counts.A).toBe(0);
    expect(r.classification.counts.N).toBe(0);
    expect(r.files.get("LDML-EXPORT-REPORT.md")).toContain("Nothing was lost.");
  });

  it("scenario 2: options-postkeystroke exports with the option rule at its default", async () => {
    const r = await okFiles("options-postkeystroke.kmn");
    const xml = r.files.get("source/options_postkeystroke_ldml.xml") as string;
    const ldml = loadLdml(xml);
    // opt defaults to '0', so `if(opt = '1') + [K_A] > 'A1'` is not in effect and K_A types 'a'.
    expect(ldml.type([k("K_A")])).toBe("a");
    const report = r.files.get("LDML-EXPORT-REPORT.md") as string;
    // PostKeystroke (touch layer behaviour), the set() fragment and the option guard are all listed with a line.
    expect(report).toContain("KM_LINT_LDML_NO_KEY_TRIGGER");
    expect(report).toContain("KM_LINT_LDML_OPTION_STATE");
    expect(report).toMatch(/source\/options_postkeystroke\.kmn:15 \|/);
    expect(report).toMatch(/source\/options_postkeystroke\.kmn:12 \|/);
    const items = r.classification.items;
    expect(items.some((i) => i.rowId === "1.4b" && i.line !== null)).toBe(true);
    expect(items.some((i) => i.rowId === "3.18" && i.params["reason"] === "option-store-directive")).toBe(true);
    expect(items.some((i) => i.rowId === "3.17" && i.params["default"] === "0")).toBe(true);
    // PostKeystroke is omitted: nothing in the document calls it.
    expect(xml).not.toContain("PostKeystroke");
  });

  it("scenario 3: unruled keys type the base character, except where the base has a dead key", async () => {
    const r = await okFiles("unruled.kmn", AZERTY_BASE);
    const ldml = loadLdml(r.files.get("source/unruled_ldml.xml") as string);
    expect(ldml.type([k("K_B")])).toBe("b");
    expect(ldml.type([k("K_B", ["shift"])])).toBe("B");
    expect(ldml.type([k("K_A")])).toBe("ä");
    // AZERTY has a dead key at K_LBRKT: the position is omitted and reported as row 2.26.
    expect(ldml.type([k("K_LBRKT")])).toBe("");
    const hints = r.classification.items.filter((i) => i.rowId === "2.26");
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some((i) => i.nodeKey === "base:none/K_LBRKT")).toBe(true);
    expect(r.files.get("LDML-EXPORT-REPORT.md")).toContain("KM_LINT_LDML_BASE_DEADKEY");
  });

  it("the ANSI-only result is refused", async () => {
    const r = await exportFixture("ansi-only.kmn");
    expect(r).toMatchObject({ ok: false, reason: "ansi-only" });
    expect(r.classification.ansiOnly).toBe(true);
  });

  it("scenario 5: two builds are byte-identical, also under TZ=Pacific/Auckland", async () => {
    const a = await okFiles("plain.kmn");
    const b = await okFiles("plain.kmn");
    expect(Buffer.from(a.zip).equals(Buffer.from(b.zip))).toBe(true);
    const before = process.env["TZ"];
    process.env["TZ"] = "Pacific/Auckland";
    try {
      const c = await okFiles("plain.kmn");
      expect(Buffer.from(a.zip).equals(Buffer.from(c.zip))).toBe(true);
    } finally {
      if (before === undefined) delete process.env["TZ"];
      else process.env["TZ"] = before;
    }
  });

  it("names the zip <kmnid>_ldml-<semver>.zip and uses the id <kmnid>_ldml in every project file", async () => {
    const r = await okFiles("plain.kmn");
    expect(r.filename).toBe("plain_ldml-1.0.0.zip");
    expect([...r.files.keys()].sort()).toEqual([
      "LDML-EXPORT-REPORT.md",
      "plain_ldml.kpj",
      "source/plain_ldml.kps",
      "source/plain_ldml.xml",
    ]);
    const kps = r.files.get("source/plain_ldml.kps") as string;
    expect(kps).toContain("<ID>plain_ldml</ID>");
    expect(kps).toContain("..\\build\\plain_ldml.kmx");
    expect(kps).toContain("..\\build\\plain_ldml.kvk");
    expect(r.files.get("plain_ldml.kpj")).toContain("<Version>2.0</Version>");
  });

  it("has no NEXT_STEPS.md, no .kmn and no build output", async () => {
    const r = await okFiles("plain.kmn");
    const names = Object.keys(unzipSync(r.zip));
    expect(names).not.toContain("NEXT_STEPS.md");
    expect(names.some((n) => n.endsWith(".kmn") || n.startsWith("build/") || n.startsWith(".studio/"))).toBe(false);
    expect(names.sort()).toEqual([...r.files.keys()].sort());
  });

  it("rejects a project id that is not a valid Keyman id", async () => {
    const input = exportInput("plain.kmn");
    await expect(buildLdmlExport({ ...input, metadata: { ...input.metadata, projectId: "Bad-Id" } })).rejects.toThrow(/project id/);
  });

  it("nul-beep.kmn: K_Q and K_W are gap keys, the contextual nul is an empty-to transform, nothing is dropped", async () => {
    const r = await okFiles("nul-beep.kmn");
    const xml = r.files.get("source/nul_beep_ldml.xml") as string;
    const ldml = loadLdml(xml);
    expect(ldml.type([k("K_Q")])).toBe("");
    expect(ldml.type([k("K_W")])).toBe("");
    expect(ldml.type([k("K_E")])).toBe("e");
    // `'a' + [K_E] > nul` is a transform with no `to`, and it is a transform, not a key.
    expect(xml).toMatch(/<transform from="a\\m\{[^}]+\}"\/>/);
    expect(ldml.type([k("K_A"), k("K_E")])).toBe("");
    // The base layout has K_Q at row 1, column 0: its token is the gap.
    const none = /<layer modifiers="none">\s*<row[^>]*\/>\s*<row keys="([^"]*)"/.exec(xml);
    expect(none?.[1]?.split(" ")[0]).toBe("gap");
    expect(none?.[1]?.split(" ")[1]).toBe("gap");
    const items = r.classification.items;
    expect(items.find((i) => i.rowId === "3.15a")?.status).toBe("M");
    expect(items.find((i) => i.rowId === "3.16")?.code).toBe("KM_LINT_LDML_BEEP");
    expect(items.some((i) => i.rowId === "3.15b")).toBe(true);
    expect(r.classification.counts.N).toBe(0);
    expect(r.files.get("LDML-EXPORT-REPORT.md")).toContain("KM_LINT_LDML_BEEP");
  });

  it("provenance lists every main-block position of every hardware layer once and matches the key map", async () => {
    const input = exportInput("nul-beep.kmn");
    const profile = resolveLdmlProfile("46");
    const detail = classifyDetailed(input, profile, { languages: ["en"] });
    const low = lowerDocument(input, profile, detail);
    const seen = new Set<string>();
    for (const p of low.provenance.positions) {
      const key = `${p.layer}|${p.vkey}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    const layers = low.grid.layers.length;
    expect(low.provenance.positions).toHaveLength(layers * 48);
    expect(low.provenance.positions.filter((p) => p.provenance === "suppressed").map((p) => p.vkey).sort()).toEqual(
      ["K_Q", "K_Q", "K_W", "K_W"].sort(),
    );
    // The key map agrees: a suppressed position is a gap token.
    const xml = await xmlOf("nul-beep.kmn");
    const rowsOfNone = [...(/<layer modifiers="none">([\s\S]*?)<\/layer>/.exec(xml)?.[1] ?? "").matchAll(/keys="([^"]*)"/g)].map((m) => m[1] ?? "");
    expect(rowsOfNone[1]?.split(" ")[0]).toBe("gap");
    expect(low.provenance.baseKeyboard).toEqual({ id: "us", source: "en-US" });
    // Row 4.17: the record is report-only and is never written into the document.
    expect(xml).not.toContain("<special");
    expect(r4_17(low)).toBe(true);
  });

  it("shared-output.kmn: trigger markers get a catch-all that is last in its group, and no marker survives", async () => {
    const xml = await xmlOf("shared-output.kmn");
    const ids = [...xml.matchAll(/<key id="[^"]*" output="\\m\{([^}]*)\}"\/>/g)].map((m) => m[1] as string);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const transforms = [...xml.matchAll(/<transform from="([^"]*)"(?: to="([^"]*)")?\/>/g)].map((m) => ({ from: m[1] as string, to: m[2] ?? "" }));
    ids.forEach((id) => {
      const idx = transforms.findIndex((t) => t.from === `\\m{${id}}`);
      expect(idx, `catch-all for ${id}`).toBeGreaterThanOrEqual(0);
      expect(transforms[idx]?.to).toBe("x");
    });
    // Every catch-all comes after every contextual transform.
    const firstCatch = Math.min(...ids.map((id) => transforms.findIndex((t) => t.from === `\\m{${id}}`)));
    expect(transforms.slice(0, firstCatch).every((t) => !t.from.startsWith("\\m{trigger"))).toBe(true);
    const ldml = loadLdml(xml);
    expect(ldml.type([k("K_A")])).toBe("x");
    expect(ldml.type([k("K_B")])).toBe("x");
    expect(ldml.type([k("K_P"), k("K_A")])).toBe("q");
    expect(ldml.type([k("K_R"), k("K_B")])).toBe("s");
    expect(ldml.type([k("K_R"), k("K_A")])).toBe("rx");
    expect(ldml.type([k("K_P"), k("K_B")])).toBe("px");
    // `p` then `x`-typed-by-the-other-key is exactly the case a marker prevents.
    expect(ldml.type([k("K_X"), k("K_A")])).toBe("xx");
  });

  it("all-opaque.kmn exports with the key map from the base layout alone and one report row per fragment", async () => {
    const r = await okFiles("all-opaque.kmn");
    const xml = r.files.get("source/all_opaque_ldml.xml") as string;
    expect(xml).not.toContain("<transforms");
    const ldml = loadLdml(xml);
    expect(ldml.type([k("K_A")])).toBe("a");
    expect(ldml.type([k("K_D", ["shift"])])).toBe("D");
    const report = r.files.get("LDML-EXPORT-REPORT.md") as string;
    for (const line of [11, 12, 13, 14]) {
      const rows = report.split("\n").filter((l) => l.startsWith(`| source/all_opaque.kmn:${line} |`));
      expect(rows, `line ${line}`).toHaveLength(1);
    }
    const frags = r.classification.items.filter((i) => i.nodeKey.startsWith("fragment#"));
    expect(frags).toHaveLength(4);
  });

  it("profile 49 writes its namespace and conformsTo", async () => {
    const xml = await xmlOf("plain.kmn", "49");
    expect(xml).toContain('xmlns="https://schemas.unicode.org/cldr/49/keyboard3"');
    expect(xml).toContain('conformsTo="49"');
  });
});

function r4_17(low: { provenance: { positions: unknown[] } }): boolean {
  return low.provenance.positions.length > 0;
}
