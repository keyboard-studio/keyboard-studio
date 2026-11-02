// ldmlExportMetadata (spec 108 T065): the metadata and files come from the same sources the
// KMN package descriptor reads.
import { createVirtualFS } from "@keyboard-studio/contracts";
import { describe, expect, it } from "vitest";
import {
  buildLdmlExportMetadata,
  collectLdmlPackageFiles,
  ldmlAttributionText,
  ldmlMetadataLanguages,
  type LdmlMetadataState,
} from "./ldmlExportMetadata.ts";

const STATE = {
  identity: { bcp47: "ibn-Latn-NG" },
  attribution: { authorName: " Ada Author ", authorEmail: "ada@example.org", copyrightHolder: "Ibono Team" },
  helpDocs: { description: " A keyboard for Ibono. ", usageTips: [], projectHomeUrl: "https://example.org/ibono" },
  startKeyboard: { languages: ["en"] },
  startIr: { header: { copyright: "Base Holder" } },
  startLicenseText: "Copyright (c) 2019 Base Team\n",
  startHolderOverride: null,
  instantiationMode: "new-from-base",
} as unknown as LdmlMetadataState;

function projectedVfs() {
  const vfs = createVirtualFS();
  vfs.set("source/readme.htm", "<p>readme</p>", false);
  vfs.set("source/welcome/welcome.htm", "<p>welcome</p>", false);
  vfs.set("LICENSE.md", "MIT License\n\nCopyright (c) Ibono Team\n", false);
  vfs.set("README.md", "# Ibono\n", false);
  vfs.set("HISTORY.md", "## 1.0\n", false);
  vfs.set("source/ibono.ico", new Uint8Array([1, 2]), true);
  vfs.set("source/Charis.ttf", new Uint8Array([3, 4]), true);
  vfs.set("shared/fonts/sil/charis/Doulos.ttf", new Uint8Array([5]), true);
  vfs.set(
    "source/ibono.kps",
    `<Package><Files>
      <File><Name>..\\build\\ibono.kmx</Name></File>
      <File><Name>ibono.ico</Name></File>
      <File><Name>Charis.ttf</Name></File>
      <File><Name>..\\..\\..\\shared\\fonts\\sil\\charis\\Doulos.ttf</Name></File>
      <File><Name>missing.ttf</Name></File>
    </Files></Package>`,
    false,
  );
  return vfs;
}

describe("buildLdmlExportMetadata", () => {
  it("reads identity, attribution, help docs and inherited holders", () => {
    const m = buildLdmlExportMetadata(STATE, { keyboardId: "ibono", displayName: "Ibono", version: "1.2", vfs: projectedVfs() });
    expect(m).toEqual({
      projectId: "ibono_ldml",
      name: "Ibono",
      version: "1.2",
      languages: ["ibn-Latn-NG"],
      author: "Ada Author",
      authorEmail: "ada@example.org",
      copyright: "Ibono Team",
      licenceName: "MIT",
      description: "A keyboard for Ibono.",
      homePage: "https://example.org/ibono",
      attributionText: "Base Team",
      indicator: null,
    });
  });

  it("falls back: start keyboard languages, header copyright, empty strings", () => {
    const bare = { ...STATE, identity: null, attribution: null, helpDocs: null, startLicenseText: null } as unknown as LdmlMetadataState;
    const m = buildLdmlExportMetadata(bare, { keyboardId: "k", displayName: "K", version: "1.0", vfs: createVirtualFS() });
    expect(m.languages).toEqual(["en"]);
    expect(m.copyright).toBe("Base Holder");
    expect([m.author, m.authorEmail, m.description, m.homePage, m.licenceName, m.attributionText]).toEqual(["", "", "", "", "", ""]);
    expect(ldmlMetadataLanguages({ identity: null, startKeyboard: null })).toEqual([]);
  });

  it("an adaptation adds no inherited holders line", () => {
    expect(ldmlAttributionText({ instantiationMode: "adapt-existing", startLicenseText: "Copyright (c) 2019 Base Team\n", startHolderOverride: null })).toBe("");
  });
});

describe("collectLdmlPackageFiles", () => {
  it("takes the documents, the icon and the fonts the KMN descriptor lists", () => {
    const f = collectLdmlPackageFiles(projectedVfs(), "ibono");
    expect(f.readmeHtm).toBe("<p>readme</p>");
    expect(f.welcomeHtm).toBe("<p>welcome</p>");
    expect(f.licenseMd).toContain("MIT License");
    expect(f.readmeMd).toBe("# Ibono\n");
    expect(f.historyMd).toBe("## 1.0\n");
    expect(f.icon?.name).toBe("ibono.ico");
    expect(f.fonts.map((x) => x.name)).toEqual(["Charis.ttf", "Doulos.ttf"]);
    expect([...(f.fonts[1]?.bytes ?? [])]).toEqual([5]);
  });

  it("returns empty documents and no binaries for an empty tree", () => {
    expect(collectLdmlPackageFiles(createVirtualFS(), "k")).toEqual({
      readmeHtm: "",
      welcomeHtm: "",
      licenseMd: "",
      readmeMd: "",
      historyMd: "",
      icon: null,
      fonts: [],
    });
  });
});
