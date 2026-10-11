import { describe, expect, it } from "vitest";
import { createVirtualFS, makeStartKeyboard } from "@keyboard-studio/contracts";
import { kpsWebSite, proposeProjectUrl, proposeProvenanceBasis } from "./phaseFSeeds.ts";

const BASE = makeStartKeyboard({
  id: "sil_bafut",
  path: "release/sil/sil_bafut",
  script: "Latn",
  targets: ["windows"],
  displayName: "Bafut",
  version: "1.2",
});

function vfsWithKps(kps: string) {
  const vfs = createVirtualFS();
  vfs.set("source/sil_bafut.kps", kps);
  return vfs;
}

describe("kpsWebSite", () => {
  it("reads the URL attribute, decoding entities", () => {
    expect(kpsWebSite('<Info><WebSite URL="https://x.org/?a=1&amp;b=2">x.org</WebSite></Info>')).toBe(
      "https://x.org/?a=1&b=2",
    );
  });

  it("falls back to the element text", () => {
    expect(kpsWebSite("<WebSite>https://x.org</WebSite>")).toBe("https://x.org");
  });

  it("is undefined when absent or blank", () => {
    expect(kpsWebSite("<Info></Info>")).toBeUndefined();
    expect(kpsWebSite('<WebSite URL=""> </WebSite>')).toBeUndefined();
    expect(kpsWebSite(null)).toBeUndefined();
  });
});

describe("proposeProjectUrl", () => {
  const kps = '<Package><Info><WebSite URL="https://bafut.org">https://bafut.org</WebSite></Info></Package>';

  it("proposes the released package's website on an update", () => {
    expect(
      proposeProjectUrl({ instantiationMode: "adapt-existing", startKeyboard: BASE, startVfs: vfsWithKps(kps) }),
    ).toBe("https://bafut.org");
  });

  it("proposes nothing on a copy, whose website is not the original's", () => {
    expect(
      proposeProjectUrl({ instantiationMode: "new-from-base", startKeyboard: BASE, startVfs: vfsWithKps(kps) }),
    ).toBeUndefined();
  });

  it("proposes nothing without a .kps", () => {
    expect(
      proposeProjectUrl({ instantiationMode: "adapt-existing", startKeyboard: BASE, startVfs: createVirtualFS() }),
    ).toBeUndefined();
  });
});

describe("proposeProvenanceBasis", () => {
  it("names the copied keyboard on a copy", () => {
    expect(proposeProvenanceBasis({ instantiationMode: "new-from-base", startKeyboard: BASE, startVfs: null })).toBe(
      "This keyboard started as a copy of the Bafut keyboard (sil_bafut).",
    );
  });

  it("proposes nothing on an update or before instantiation", () => {
    expect(
      proposeProvenanceBasis({ instantiationMode: "adapt-existing", startKeyboard: BASE, startVfs: null }),
    ).toBeUndefined();
    expect(proposeProvenanceBasis({ instantiationMode: null, startKeyboard: null, startVfs: null })).toBeUndefined();
  });
});
