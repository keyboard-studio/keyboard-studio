// readCatalogEntry (vite-plugins/keyboardCatalog.ts): the catalog record the
// start-keyboard browser lists, lifted out of the localKeyboards plugin scan.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCatalogEntry } from "../../vite-plugins/keyboardCatalog.ts";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "kbcat-"));
  const src = join(root, "release", "basic", "basic_demo", "source");
  mkdirSync(src, { recursive: true });
  writeFileSync(
    join(src, "basic_demo.kmn"),
    "store(&NAME) 'Demo Basic'\nstore(&VERSION) '2.3'\nbegin Unicode > use(main)\n",
  );
  writeFileSync(
    join(src, "basic_demo.kps"),
    '<Package><Keyboards><Keyboard><Languages><Language ID="en">English</Language><Language ID="fr">French</Language></Languages></Keyboard></Keyboards></Package>',
  );
  const bare = join(root, "release", "basic", "basic_bare", "source");
  mkdirSync(bare, { recursive: true });
  writeFileSync(join(bare, "basic_bare.kmn"), "begin Unicode > use(main)\n");
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("readCatalogEntry", () => {
  const facets = new Map<string, string>([["basic_demo", "Latn"]]);

  it("reads the display name and version from the .kmn header and the languages from the .kps", () => {
    const entry = readCatalogEntry(root, "release", "basic", "basic_demo", facets);
    expect(entry).toMatchObject({
      id: "basic_demo",
      path: "release/basic/basic_demo",
      displayName: "Demo Basic",
      version: "2.3",
      script: "Latn",
      languages: ["en", "fr"],
    });
  });

  it("falls back to the id for the name and omits languages when there is no .kps", () => {
    const entry = readCatalogEntry(root, "release", "basic", "basic_bare", facets);
    expect(entry?.displayName).toBe("basic_bare");
    expect(entry?.version).toBe("1.0");
    expect(entry).not.toHaveProperty("languages");
  });

  it("returns null for a directory that is not a keyboard", () => {
    expect(readCatalogEntry(root, "release", "basic", "nope", facets)).toBeNull();
  });
});
