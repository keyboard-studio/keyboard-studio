// NormalizationExamples (spec 086 T033): a semantic list of at most five rows,
// each with an accessible name built from its code-point names.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";

import { render } from "../../test/renderWithI18n.tsx";
import { NormalizationExamples } from "./NormalizationExamples.tsx";

afterEach(cleanup);

const NAMES = new Map<number, string>([
  [0x65, "LATIN SMALL LETTER E"],
  [0x323, "COMBINING DOT BELOW"],
  [0x301, "COMBINING ACUTE ACCENT"],
  [0x1eb9, "LATIN SMALL LETTER E WITH DOT BELOW"],
]);
const loadNames = () => Promise.resolve(NAMES as ReadonlyMap<number, string>);

describe("NormalizationExamples", () => {
  it("renders a semantic list of at most five rows", async () => {
    const examples = Array.from({ length: 8 }, (_, i) => ({ pasted: `e${String.fromCodePoint(0x300 + i)}`, result: "x" }));
    render(<NormalizationExamples examples={examples} loadNames={loadNames} />);
    const list = await screen.findByRole("list");
    expect(list.tagName).toBe("UL");
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
  });

  it("names each glyph from its code-point names, with the glyphs themselves hidden", async () => {
    render(
      <NormalizationExamples examples={[{ pasted: "ẹ", result: "ẹ" }]} loadNames={loadNames} />,
    );
    const item = await screen.findByRole("listitem");
    await screen.findByText(/COMBINING DOT BELOW/);
    expect(item.textContent).toContain("U+0065 LATIN SMALL LETTER E, U+0323 COMBINING DOT BELOW");
    expect(item.textContent).toContain("U+1EB9 LATIN SMALL LETTER E WITH DOT BELOW");
    expect(item.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("renders nothing for no examples", () => {
    const { container } = render(<NormalizationExamples examples={[]} loadNames={loadNames} />);
    expect(container.querySelector("ul")).toBeNull();
  });
});
