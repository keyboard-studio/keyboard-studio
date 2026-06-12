import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseKvksFontFamily } from "./parseKvksFontFamily.js";

// Real .kvks content from the sil_cameroon_azerty keyboard.
const kvksText = readFileSync(
  "/home/user/keyboards/release/sil/sil_cameroon_azerty/source/sil_cameroon_azerty.kvks",
  "utf8",
);

describe("parseKvksFontFamily", () => {
  it('extracts "Andika Afr" from the real sil_cameroon_azerty.kvks', () => {
    expect(parseKvksFontFamily(kvksText)).toBe("Andika Afr");
  });

  it("returns null when there is no fontname attribute", () => {
    const xml = `<encoding name="unicode" fontsize="-12"><layer/></encoding>`;
    expect(parseKvksFontFamily(xml)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseKvksFontFamily("")).toBeNull();
  });

  it("handles a fontname with spaces correctly", () => {
    const xml = `<encoding name="unicode" fontname="My Custom Font" fontsize="10">`;
    expect(parseKvksFontFamily(xml)).toBe("My Custom Font");
  });

  it("returns null when fontname attribute value is empty", () => {
    const xml = `<encoding name="unicode" fontname="" fontsize="10">`;
    expect(parseKvksFontFamily(xml)).toBeNull();
  });

  it("is case-insensitive on the encoding tag name", () => {
    // The regex uses /i; upper-case ENCODING should still match.
    const xml = `<ENCODING name="unicode" fontname="Arial" fontsize="12">`;
    expect(parseKvksFontFamily(xml)).toBe("Arial");
  });
});
