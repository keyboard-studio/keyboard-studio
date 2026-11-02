import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { errorCodes, keymanCompile } from "../__testing__/keymanCompile.js";
import { LDML_IMPORT_46 } from "./ldmlImportAssets.js";
import { compileLdmlInBrowser } from "./loadLdmlCompiler.js";

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
