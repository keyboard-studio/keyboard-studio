// Story 3 (spec 108 T069): the metadata, the header comment and the package files.
import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { exportInput } from "./__fixtures__/helpers.js";
import { buildLdmlExport } from "./package.js";
import type { LdmlExportInput, LdmlPackageFiles } from "./types.js";

const FILES: LdmlPackageFiles = {
  readmeHtm: "<html>readme</html>",
  welcomeHtm: "<html>welcome</html>",
  licenseMd: "MIT License\n\nCopyright (c) Ibono Team\n",
  readmeMd: "# Ibono\n",
  historyMd: "## 1.2\n- first\n",
  icon: { name: "ibono.ico", bytes: new Uint8Array([0, 0, 1, 0, 1, 0]) },
  fonts: [{ name: "Charis.ttf", bytes: new Uint8Array([1, 2, 3, 4]) }],
};

function withMeta(profile: "46" | "49" = "46"): LdmlExportInput {
  const input = exportInput("plain.kmn", profile, undefined, {
    name: "Ibono Keyboard",
    author: "Ada Author",
    authorEmail: "ada@example.org",
    version: "1.2",
    languages: ["ibn-Latn-NG", "en"],
    copyright: "Ibono Team",
    licenceName: "MIT",
    description: "A keyboard for Ibono.",
    homePage: "https://example.org/ibono",
    attributionText: "Adapted from Base Team",
    indicator: "IB",
  });
  return { ...input, packageFiles: FILES, studioVersion: "9.9.9" };
}

async function build(input: LdmlExportInput) {
  const r = await buildLdmlExport(input);
  if (!r.ok) throw new Error("refused");
  return r;
}

describe("LDML export metadata (Story 3)", () => {
  it("scenario 1: name, author, version 1.2 gives 1.2.0, the locale and <locales>", async () => {
    const r = await build(withMeta());
    const xml = r.files.get("source/plain_ldml.xml") as string;
    expect(xml).toMatch(/<keyboard3 [^>]*locale="ibn"/);
    expect(xml).toContain('<version number="1.2.0"/>');
    expect(xml).toContain('<locale id="en"/>');
    expect(xml).toMatch(/<info name="Ibono Keyboard" author="Ada Author" layout="QWERTY" indicator="IB"\/>/);
    // Attribution is dropped under profile 46 (row 4.10).
    expect(xml).not.toContain('attribution="');
  });

  it("scenario 2: the header comment and the package files carry the description, copyright and licence", async () => {
    const r = await build(withMeta());
    const xml = r.files.get("source/plain_ldml.xml") as string;
    const header = xml.slice(0, xml.indexOf("<keyboard3"));
    expect(header).toContain("Ibono Keyboard (plain) version 1.2");
    expect(header).toContain("A keyboard for Ibono.");
    expect(header).toContain("Copyright: Ibono Team   Licence: MIT");
    expect(header).toContain("Author: Ada Author   Attribution: Adapted from Base Team   Home page: https://example.org/ibono");
    expect(header).toContain("Exported by Keyboard Studio 9.9.9 under LDML profile 46");
    expect(header).toContain("Base keyboard resolved against:");
    expect(header).toContain("What did not carry over: LDML-EXPORT-REPORT.md");

    const kps = r.files.get("source/plain_ldml.kps") as string;
    expect(kps).toContain("<Description URL=\"\">A keyboard for Ibono.</Description>");
    expect(kps).toContain("<Copyright URL=\"\">Ibono Team</Copyright>");
    expect(kps).toContain('<Author URL="mailto:ada@example.org">Ada Author</Author>');
    expect(kps).toContain('<WebSite URL="https://example.org/ibono">https://example.org/ibono</WebSite>');
    expect(kps).toContain("<Version URL=\"\">1.2.0</Version>");
    expect(kps).toContain("<ReadMeFile>readme.htm</ReadMeFile>");
    expect(kps).toContain("<WelcomeFile>welcome.htm</WelcomeFile>");
    expect(kps).toContain("<Name>ibono.ico</Name>");
    expect(kps).toContain("<Name>Charis.ttf</Name>");
    expect(kps).toContain('<Language ID="ibn">ibn</Language>');
    expect(kps).toContain('<Language ID="en">en</Language>');
    expect(r.files.get("LICENSE.md")).toContain("MIT License");
  });

  it("places every carried file at the contract path and writes no other project content", async () => {
    const r = await build(withMeta());
    expect([...r.files.keys()]).toEqual([
      "plain_ldml.kpj",
      "source/Charis.ttf",
      "source/ibono.ico",
      "source/plain_ldml.kps",
      "source/plain_ldml.xml",
      "source/readme.htm",
      "source/welcome.htm",
      "HISTORY.md",
      "LICENSE.md",
      "README.md",
      "LDML-EXPORT-REPORT.md",
    ]);
    const zip = unzipSync(r.zip);
    expect(Object.keys(zip).sort()).toEqual([...r.files.keys()].sort());
    expect([...(zip["source/Charis.ttf"] ?? [])]).toEqual([1, 2, 3, 4]);
    expect(strFromU8(zip["source/readme.htm"] as Uint8Array)).toBe("<html>readme</html>");
  });

  it("omits documents the keyboard does not have", async () => {
    const input = exportInput("plain.kmn");
    const r = await build(input);
    expect([...r.files.keys()]).toEqual(["plain_ldml.kpj", "source/plain_ldml.kps", "source/plain_ldml.xml", "LDML-EXPORT-REPORT.md"]);
    const kps = r.files.get("source/plain_ldml.kps") as string;
    expect(kps).not.toContain("ReadMeFile");
    expect(kps).not.toContain("<Description URL");
  });

  it("under profile 49, info/@attribution is present", async () => {
    const r = await build(withMeta("49"));
    const xml = r.files.get("source/plain_ldml.xml") as string;
    expect(xml).toContain('attribution="Adapted from Base Team"');
  });

  it("the same input gives the same zip", async () => {
    const a = await build(withMeta());
    const b = await build(withMeta());
    expect(Buffer.from(a.zip).equals(Buffer.from(b.zip))).toBe(true);
  });
});
