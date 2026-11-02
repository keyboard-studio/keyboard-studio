import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KMX } from "@keymanapp/common-types";
import { describe, expect, it, vi } from "vitest";
import { errorCodes, keymanCompile } from "../__testing__/keymanCompile.js";
import { LDML_IMPORT_46 } from "./ldmlImportAssets.js";
import { buildLdmlInBrowser, compileLdmlInBrowser } from "./loadLdmlCompiler.js";

const kmcLdmlDir = dirname(dirname(dirname(createRequire(import.meta.url).resolve("@keymanapp/kmc-ldml"))));
const dir = join(dirname(createRequire(import.meta.url).resolve("@keymanapp/developer-utils")), "types", "import", "46");

describe("bundled CLDR 46 import files", () => {
  it("are byte-equal to the pinned developer-utils copies", () => {
    expect(Object.keys(LDML_IMPORT_46).sort()).toEqual([
      "keys-Latn-implied.xml",
      "keys-Zyyy-currency.xml",
      "keys-Zyyy-punctuation.xml",
      "scanCodes-implied.xml",
    ]);
    for (const [name, text] of Object.entries(LDML_IMPORT_46)) {
      expect(text, name).toBe(readFileSync(join(dir, name), "utf8"));
    }
  });
});

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<keyboard3 xmlns="https://schemas.unicode.org/cldr/techpreview/keyboard3" locale="en" conformsTo="46">
  <info name="t" author="a" layout="QWERTY" indicator="Q"/>
  <keys><key id="a" output="a"/><import base="cldr" path="46/keys-Latn-implied.xml"/></keys>
  <layers formId="us"><layer id="base"><row keys="a"/></layer></layers>
</keyboard3>
`;

describe("compileLdmlInBrowser", () => {
  it("raises the same message codes as the CI harness", async () => {
    const browser = await compileLdmlInBrowser(XML);
    const node = await keymanCompile(XML);
    expect(browser.ok).toBe(node.ok);
    expect(browser.messages.map((m) => m.code).sort()).toEqual(node.messages.map((m) => m.code).sort());
    expect(errorCodes(browser.messages)).toEqual(errorCodes(node.messages));
  });
});

describe("buildLdmlInBrowser", () => {
  it("builds the KMX and KVK of a valid document with no errors", async () => {
    const r = await buildLdmlInBrowser(XML);
    expect(r.ok).toBe(true);
    expect(r.messages.filter((m) => m.severity === "error" || m.severity === "fatal")).toEqual([]);
    expect(r.kmx?.byteLength ?? 0).toBeGreaterThan(0);
    expect(r.kvk?.byteLength ?? 0).toBeGreaterThan(0);
    // 'KXTS', little-endian.
    expect(Array.from(r.kmx!.slice(0, 4))).toEqual([0x4b, 0x58, 0x54, 0x53]);
  });

  it("names a KMX+ file version and a compiler version", async () => {
    const r = await buildLdmlInBrowser(XML);
    const built = (await keymanCompile(XML, { build: true })).kmx!;
    const header = new DataView(built.buffer, built.byteOffset, built.byteLength).getUint32(4, true);
    expect(r.kmxPlusVersion).toBe(header);
    expect(r.kmxPlusVersion).toBeGreaterThanOrEqual(KMX.KMXFile.VERSION_170);
    expect(r.compilerVersion).not.toBe("");
    const pkg = JSON.parse(readFileSync(join(kmcLdmlDir, "package.json"), "utf8")) as { version: string };
    expect(r.compilerVersion).toBe(pkg.version);
  });

  it("returns no bytes and the same codes as compileLdmlInBrowser for an invalid document", async () => {
    const bad = XML.replace('<key id="a"', '<key id="a" gap="maybe"');
    const compiled = await compileLdmlInBrowser(bad);
    const built = await buildLdmlInBrowser(bad);
    expect(built.ok).toBe(false);
    expect(compiled.ok).toBe(false);
    expect(built.kmx).toBeUndefined();
    expect(built.kvk).toBeUndefined();
    expect([...new Set(built.messages.map((m) => m.code))].sort()).toEqual(
      [...new Set(compiled.messages.map((m) => m.code))].sort(),
    );
  });

  it("raises each message once", async () => {
    const r = await buildLdmlInBrowser(XML);
    const keys = r.messages.map((m) => `${m.code}|${m.line ?? ""}|${m.text}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("a failed chunk load", () => {
  it("stays sticky for the build path as for the compile path", async () => {
    vi.resetModules();
    vi.doMock("@keymanapp/kmc-ldml", () => {
      throw new Error("chunk load failed");
    });
    try {
      const fresh = await import("./loadLdmlCompiler.js");
      await expect(fresh.buildLdmlInBrowser(XML)).rejects.toThrow(/kmc-ldml load failed/);
      await expect(fresh.buildLdmlInBrowser(XML)).rejects.toThrow(/failed earlier/);
      await expect(fresh.compileLdmlInBrowser(XML)).rejects.toThrow(/failed earlier/);
    } finally {
      vi.doUnmock("@keymanapp/kmc-ldml");
      vi.resetModules();
    }
  });
});

/** KMX / KMX+ producers: the builder classes, the writer, and the compiled-file magic. */
const KMX_WRITER = /\b(KMXBuilder|KMXPlusBuilder|KvkFileWriter|KMXPlusFile)\b|0x5354584b|"KXTS"/i;

function productSources(root: string, skipTesting: boolean): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules" && !(skipTesting && e.name === "__testing__")) walk(p);
      } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  walk(root);
  return out;
}

describe("no source writes KMX+ bytes (FR-071)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  it("no engine product source builds a KMX", () => {
    const offenders = productSources(join(here, "..", ".."), true).filter((p) => KMX_WRITER.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("no studio product source builds a KMX", () => {
    const offenders = productSources(join(here, "..", "..", "..", "..", "studio", "src"), false).filter((p) =>
      KMX_WRITER.test(readFileSync(p, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
