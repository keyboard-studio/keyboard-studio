import { describe, expect, it } from "vitest";
import { classifyFixture, exportFixture, exportInput } from "./__fixtures__/helpers.js";
import { classifyDetailed } from "./classify/classify.js";
import { lowerDocument } from "./lower/document.js";
import { resolveLdmlProfile } from "./profiles/resolve.js";
import { renderReport, type ReportContext } from "./report.js";

const CTX: ReportContext = { keyboardName: "Plain", keyboardId: "plain", version: "1.0", mnemonic: false, provenance: null };

async function reportOf(name: string, profileId: "46" | "49" = "46"): Promise<string> {
  const r = await exportFixture(name, profileId);
  if (!r.ok) throw new Error("refused");
  return r.files.get("LDML-EXPORT-REPORT.md") as string;
}

describe("LDML-EXPORT-REPORT.md (contracts/export-package.md)", () => {
  it("has sections 1 to 7 in order for profile 46, and no section 8", async () => {
    const report = await reportOf("reread-rows.kmn");
    const heads = [...report.matchAll(/^## (\d)\. /gm)].map((m) => Number(m[1]));
    expect(heads).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(report).toMatch(/^# LDML export report: reread_rows \(reread_rows\) version 1\.0/m);
  });

  it("names the profile, namespace and TR35 revision, and the pinned Keyman for 46", async () => {
    const report = await reportOf("plain.kmn");
    expect(report).toContain("Profile: 46");
    expect(report).toContain("https://schemas.unicode.org/cldr/46/keyboard3");
    expect(report).toContain("CLDR 49, tr35-79 (2026-10-21)");
    expect(report).toContain("Keyman 19.0.240-alpha");
  });

  it("says TR35-only (awaiting Keyman) for profile 49 and lists section 8 (FR-064)", async () => {
    const report = await reportOf("plain.kmn", "49");
    expect(report).toContain("TR35-only (awaiting Keyman)");
    expect(report).toMatch(/^## 8\. Version change/m);
    expect(report).toMatch(/\| 4\.10 \| K \| M \|/);
  });

  it("names the base keyboard with its source and the provenance counts per layer (FR-027, FR-028)", async () => {
    const report = await reportOf("plain.kmn");
    expect(report).toContain("US (`us`)");
    expect(report).toContain("the default (en-US)");
    expect(report).toMatch(/\| none \| \d+ \| \d+ \| 0 \|/);
  });

  it("says Nothing was lost. only when A and N are both zero", async () => {
    expect(await reportOf("plain.kmn")).toContain("Nothing was lost.");
    expect(await reportOf("reread-rows.kmn")).not.toContain("Nothing was lost.");
  });

  it("carries the Keyman 19 desktop-only delivery note and the authority statement", async () => {
    const report = await reportOf("plain.kmn");
    expect(report).toContain("Keyman 19 delivers LDML keyboards to desktop only.");
    expect(report).toContain("the KMN keyboard is the source of truth");
  });

  it("states the touch delivery once when a touch layout is present", () => {
    const input = exportInput("plain.kmn");
    const profile = resolveLdmlProfile("46");
    const c = classifyDetailed(
      { ...input, touchLayout: { platforms: [{ id: "phone", layers: [] }], nodeIds: [] } },
      profile,
    ).classification;
    const text = renderReport(c, profile, CTX);
    expect(text.match(/ready for Keyman's touch pipeline/g)).toHaveLength(1);
    expect(renderReport(classifyFixture("plain.kmn"), profile, CTX)).not.toContain("touch pipeline");
  });

  it("lists coded items in the hardware table with location, construct, code, status and consequence", async () => {
    const report = await reportOf("reread-rows.kmn");
    const hw = /## 5\. [\s\S]*?(?=\n## 6\.)/.exec(report)?.[0] ?? "";
    expect(hw).toContain("| Location | Construct | Code | Status | What LDML does instead |");
    expect(hw).toMatch(/\| source\/reread_rows\.kmn:14 \| NUMLOCK or SCROLL modifier flag \| KM_LINT_LDML_MODIFIER \| N \|/);
  });

  it("sorts rows by line, then code", async () => {
    const report = await reportOf("reread-rows.kmn");
    const hw = /## 5\. [\s\S]*?(?=\n## 6\.)/.exec(report)?.[0] ?? "";
    const lines = [...hw.matchAll(/reread_rows\.kmn:(\d+) \|/g)].map((m) => Number(m[1]));
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
  });

  it("gives a rule with no line the location group <name> (<owner>) (FR-017)", () => {
    const input = exportInput("plain.kmn");
    const profile = resolveLdmlProfile("46");
    const c = classifyFixture("reread-rows.kmn");
    const noLine = { ...c, items: c.items.map((i, n) => (n === 0 ? { ...i, line: null, owner: "group main (pattern x)", code: "KM_LINT_LDML_OPAQUE" as const, side: "hardware" as const } : i)) };
    const text = renderReport(noLine, profile, { ...CTX, keyboardId: input.keyboardId });
    expect(text).toContain("group main (pattern x)");
  });

  it("is English, has no timestamp, and is byte-stable", async () => {
    const a = await reportOf("reread-rows.kmn");
    const b = await reportOf("reread-rows.kmn");
    expect(a).toBe(b);
    expect(a).not.toMatch(/\b20\d\d-\d\d-\d\d\b.*generated|\d\d:\d\d:\d\d/);
  });

  it("explains the mnemonic caveat when row 2.7 applies", () => {
    const profile = resolveLdmlProfile("46");
    const text = renderReport(classifyFixture("plain.kmn"), profile, { ...CTX, mnemonic: true });
    expect(text).toContain("mnemonic");
    expect(renderReport(classifyFixture("plain.kmn"), profile, CTX)).not.toContain("mnemonic");
  });

  it("every item the report lists is in the classification it was built from", async () => {
    const r = await exportFixture("reread-rows.kmn");
    if (!r.ok) throw new Error("refused");
    const report = r.files.get("LDML-EXPORT-REPORT.md") as string;
    const listed = [...report.matchAll(/KM_LINT_LDML_[A-Z_]+/g)].map((m) => m[0]);
    const known = new Set(r.classification.items.map((i) => i.code));
    for (const code of listed) expect(known.has(code as never), code).toBe(true);
  });

  it("is built from a lowering that did not change", () => {
    const input = exportInput("plain.kmn");
    const profile = resolveLdmlProfile("46");
    const detail = classifyDetailed(input, profile, { languages: ["en"] });
    expect(lowerDocument(input, profile, detail).provenance.positions.length).toBeGreaterThan(0);
  });
});
