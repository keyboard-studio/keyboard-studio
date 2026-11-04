// FR-074, FR-076, Story 5 scenarios 3 and 3a: the installable LDML .kmp.
import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { inputFromRules } from "../__fixtures__/helpers.js";
import { key, layout, platform } from "../__fixtures__/touchLayouts.js";
import { buildLdmlExport } from "../package.js";
import { buildLdmlKmp } from "./buildLdmlKmp.js";
import { buildLdmlInBrowser } from "./loadLdmlCompiler.js";
import type { KeymanBuildResult } from "./loadLdmlCompiler.js";

async function exported(withTouch: boolean) {
  const base = inputFromRules("+ [K_A] > 'x'\n+ [K_B] > 'y'\n");
  const input = withTouch
    ? { ...base, touchLayout: layout(platform("phone", { default: [[key("K_A"), key("K_B")]] })) }
    : base;
  const r = await buildLdmlExport(input);
  if (!r.ok) throw new Error("export refused");
  return r;
}

async function compiledOf(files: ReadonlyMap<string, string | Uint8Array>): Promise<KeymanBuildResult> {
  const xml = [...files.entries()].find(([k]) => k.endsWith(".xml"))?.[1] as string;
  return buildLdmlInBrowser(xml);
}

function snapshot(files: ReadonlyMap<string, string | Uint8Array>): string[] {
  return [...files.entries()].map(([k, v]) => `${k}:${typeof v === "string" ? v : Array.from(v).join(",")}`);
}

describe("buildLdmlKmp", () => {
  it("packages a zero-error compile of a touch-bearing export as <kmnid>_ldml.kmp", async () => {
    const r = await exported(true);
    const compiled = await compiledOf(r.files);
    expect(compiled.ok).toBe(true);
    const built = await buildLdmlKmp(r.files, "t", compiled);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.filename).toBe("t_ldml.kmp");
    const members = unzipSync(built.bytes);
    expect(Object.keys(members)).toEqual(expect.arrayContaining(["t_ldml.kmx", "t_ldml.kvk", "kmp.json"]));
    const json = JSON.parse(strFromU8(members["kmp.json"] as Uint8Array)) as { keyboards: Array<{ id: string }> };
    expect(json.keyboards.map((k) => k.id)).toEqual(["t_ldml"]);
  });

  it("uses an id and file name that differ from the KMN package for the same keyboard", async () => {
    const r = await exported(false);
    const built = await buildLdmlKmp(r.files, "t", await compiledOf(r.files));
    expect(built.ok && built.filename).toBe("t_ldml.kmp");
    expect(built.ok && built.filename).not.toBe("t.kmp");
  });

  it("leaves the input file map byte-identical (staging happens on a clone)", async () => {
    const r = await exported(true);
    const before = snapshot(r.files);
    const built = await buildLdmlKmp(r.files, "t", await compiledOf(r.files));
    expect(built.ok).toBe(true);
    expect(snapshot(r.files)).toEqual(before);
    expect([...r.files.keys()].some((k) => k.startsWith("build/"))).toBe(false);
  });

  it("returns ok false and no kmp on any compile error, and never touches the touch forms to retry", async () => {
    const r = await exported(true);
    const good = await compiledOf(r.files);
    const before = snapshot(r.files);
    for (const severity of ["error", "fatal"] as const) {
      const failed: KeymanBuildResult = {
        ...good,
        ok: true,
        messages: [{ code: "ERROR_Anything", severity, text: "boom" }],
      };
      const built = await buildLdmlKmp(r.files, "t", failed);
      expect(built.ok).toBe(false);
      expect("bytes" in built).toBe(false);
    }
    const noBytes = await buildLdmlKmp(r.files, "t", { ...good, ok: false, kmx: undefined, kvk: undefined });
    expect(noBytes.ok).toBe(false);
    expect(snapshot(r.files)).toEqual(before);
    expect(strFromU8(new TextEncoder().encode(String(r.files.get("source/t_ldml.xml"))))).toContain('formId="touch"');
  });

  it("says the package is desktop-only, in the descriptor and in the compile report", async () => {
    const r = await exported(false);
    const built = await buildLdmlKmp(r.files, "t", await compiledOf(r.files), { compileReport: "# Report\n\nDesktop only.\n" });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const members = unzipSync(built.bytes);
    const info = strFromU8(members["kmp.json"] as Uint8Array);
    expect(info).toMatch(/desktop only/i);
    expect(strFromU8(members["LDML-COMPILE-REPORT.md"] as Uint8Array)).toContain("Desktop only.");
  });
});
