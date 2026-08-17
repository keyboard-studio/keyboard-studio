// Tests for the copyright parse/render pair (spec 064, contracts/copyright.md).
//
// The fixture table is HARVESTED from keymanapp/keyboards (FR-014), not invented:
// every input in COPYRIGHT_LINE_FIXTURES / COPYRIGHT_REJECT_FIXTURES is a real
// shipped line with its source path recorded.

import { describe, it, expect } from "vitest";
import {
  parseCopyright,
  renderLicense,
  renderHolderLine,
  renderHolderLineNoYear,
  orderHolders,
  addHolder,
  dedupeHolders,
  MIT_BODY,
  type CopyrightBlock,
  type CopyrightHolder,
} from "./copyright";
import {
  COPYRIGHT_LINE_FIXTURES,
  COPYRIGHT_REJECT_FIXTURES,
  BOM_PREFIXED_LINE,
} from "./fixtures/copyrightLines";

/** Wrap a bare copyright line in a plausible MIT file. */
function asLicense(line: string): string {
  return `The MIT License (MIT)\n\n${line}\n\n${MIT_BODY}\n`;
}

// ---------------------------------------------------------------------------
// P2/P3/P5 — every harvested real line parses correctly
// ---------------------------------------------------------------------------

describe("parseCopyright — harvested corpus lines (FR-014)", () => {
  for (const f of COPYRIGHT_LINE_FIXTURES) {
    describe(`${f.line}  [${f.source}]`, () => {
      const result = parseCopyright(asLicense(f.line));

      it(`parses (${f.note})`, () => {
        expect(result.ok, `failed to parse a real shipped line from ${f.source}`).toBe(true);
      });

      it("extracts the holder verbatim", () => {
        expect(result.ok && result.block[0]?.name).toBe(f.holder);
      });

      it("extracts the years", () => {
        expect(result.ok && result.block[0]?.years).toEqual(f.years);
      });

      it("retains the marker form", () => {
        expect(result.ok && result.block[0]?.marker).toBe(f.marker);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// P4 — real lines the parser must REFUSE rather than misread
// ---------------------------------------------------------------------------

describe("parseCopyright — rejections (contract P4)", () => {
  for (const f of COPYRIGHT_REJECT_FIXTURES) {
    it(`rejects "${f.line}" as ${f.reason} — ${f.note}`, () => {
      const r = parseCopyright(asLicense(f.line));
      expect(r.ok, `must not parse: ${f.source}`).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe(f.reason);
        expect(r.line).toContain(f.line.trim());
      }
    });
  }

  it("rejects a body with no copyright line at all", () => {
    const r = parseCopyright(`The MIT License (MIT)\n\n${MIT_BODY}\n`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_copyright_line");
  });

  // P1: failure must never arrive as an empty success, or "emit a LICENSE.md
  // naming only the current user" becomes the natural path (FR-010).
  it("never reports success with an empty block", () => {
    for (const text of [
      "",
      "The MIT License (MIT)",
      asLicense("Copyright (c) YYYY _____________________"),
      asLicense("Copyright © 2015"),
    ]) {
      const r = parseCopyright(text);
      if (r.ok) {
        expect(r.block.length, `empty success for: ${JSON.stringify(text.slice(0, 40))}`).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// P5 — BOM
// ---------------------------------------------------------------------------

describe("parseCopyright — BOM handling (contract P5)", () => {
  it("strips a leading UTF-8 BOM and still finds the notice", () => {
    const r = parseCopyright(`﻿The MIT License (MIT)\n\n${BOM_PREFIXED_LINE.line.replace("﻿", "")}\n`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.block[0]?.name).toBe(BOM_PREFIXED_LINE.holder);
      expect(r.block[0]?.years).toEqual(BOM_PREFIXED_LINE.years);
    }
  });

  it("parses a BOM-prefixed copyright line itself", () => {
    const r = parseCopyright(BOM_PREFIXED_LINE.line);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.block[0]?.name).toBe(BOM_PREFIXED_LINE.holder);
  });
});

// ---------------------------------------------------------------------------
// The SIL rename must survive untouched (D4)
// ---------------------------------------------------------------------------

describe("holder names are never normalised", () => {
  it("keeps SIL International and SIL Global as DISTINCT holders", () => {
    const r = parseCopyright(
      asLicense("Copyright © 2019 SIL International\nCopyright © 2025 SIL Global"),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.block.map((h) => h.name)).toEqual(["SIL International", "SIL Global"]);
    }
  });

  it("preserves an internal double space in a holder name", () => {
    const r = parseCopyright(asLicense("Copyright © 2021-2023  Dr Khampha Sidavong and John Durdin"));
    expect(r.ok && r.block[0]?.name).toBe("Dr Khampha Sidavong and John Durdin");
  });
});

// ---------------------------------------------------------------------------
// P6 — rendering
// ---------------------------------------------------------------------------

describe("renderHolderLine — year forms (contract P6)", () => {
  const h = (years: number[]): CopyrightHolder => ({
    name: "Foo",
    years,
    marker: "©",
    inherited: false,
  });

  it("omits the year entirely when there is none", () => {
    expect(renderHolderLine(h([]))).toBe("Copyright © Foo");
  });
  it("renders a single year", () => {
    expect(renderHolderLine(h([2016]))).toBe("Copyright © 2016 Foo");
  });
  it("renders two years as a hyphen range", () => {
    expect(renderHolderLine(h([2016, 2021]))).toBe("Copyright © 2016-2021 Foo");
  });
  it("renders three or more years as a comma list", () => {
    expect(renderHolderLine(h([2016, 2019, 2024]))).toBe("Copyright © 2016, 2019, 2024 Foo");
  });
});

describe("renderHolderLineNoYear — the .kmn/.kps metadata mirror (criterion 4.6, #1545)", () => {
  const h = (years: number[]): CopyrightHolder => ({
    name: "Foo",
    years,
    marker: "©",
    inherited: false,
  });

  it("omits the year even when the holder has one", () => {
    expect(renderHolderLineNoYear(h([2016]))).toBe("Copyright © Foo");
  });

  it("omits a year range the same way", () => {
    expect(renderHolderLineNoYear(h([2016, 2021]))).toBe("Copyright © Foo");
  });

  it("does not fall back to the verbatim raw line, unlike renderHolderLine", () => {
    // A raw line with a year must NOT leak through — that's the whole point:
    // renderHolderLine would return `raw` verbatim (see its own contract),
    // which is exactly the year-bearing text this function exists to avoid.
    const withRaw: CopyrightHolder = {
      name: "Foo",
      years: [2016],
      marker: "©",
      inherited: true,
      raw: "Copyright © 2016 Foo",
    };
    expect(renderHolderLine(withRaw)).toBe("Copyright © 2016 Foo");
    expect(renderHolderLineNoYear(withRaw)).toBe("Copyright © Foo");
  });

  it("preserves the marker style", () => {
    expect(renderHolderLineNoYear({ ...h([2016]), marker: "(c)" })).toBe("Copyright (c) Foo");
  });
});

describe("renderLicense — canonical body (FR-005 / SC-006)", () => {
  const block: CopyrightBlock = [
    { name: "Foo", years: [2016], marker: "©", inherited: false },
  ];

  it("emits the MIT body verbatim", () => {
    expect(renderLicense(block)).toContain(MIT_BODY);
  });

  it("emits a body byte-identical across differently-named holders", () => {
    const a = renderLicense([{ name: "Alpha", years: [2020], marker: "©", inherited: false }]);
    const b = renderLicense([{ name: "Beta", years: [2021], marker: "(c)", inherited: false }]);
    const strip = (s: string) => s.split(/\n\n/).slice(1).join("\n\n");
    expect(strip(a)).toBe(strip(b));
  });

  it("emits no BOM", () => {
    expect(renderLicense(block).startsWith("﻿")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D3 — ordering
// ---------------------------------------------------------------------------

describe("orderHolders — D3 ordering", () => {
  it("places inherited holders before the current session's", () => {
    const ordered = orderHolders([
      { name: "New", years: [2026], marker: "©", inherited: false },
      { name: "Old", years: [2016], marker: "©", inherited: true },
    ]);
    expect(ordered.map((h) => h.name)).toEqual(["Old", "New"]);
  });

  it("orders by earliest year within a tier", () => {
    const ordered = orderHolders([
      { name: "Later", years: [2024], marker: "©", inherited: true },
      { name: "Earlier", years: [2016, 2021], marker: "©", inherited: true },
    ]);
    expect(ordered.map((h) => h.name)).toEqual(["Earlier", "Later"]);
  });

  it("sorts year-less holders first — they predate by definition", () => {
    const ordered = orderHolders([
      { name: "Dated", years: [2016], marker: "©", inherited: true },
      { name: "Undated", years: [], marker: "©", inherited: true },
    ]);
    expect(ordered.map((h) => h.name)).toEqual(["Undated", "Dated"]);
  });

  // Stability matters: re-emitting an unchanged keyboard must not churn the file.
  it("is STABLE for holders that compare equal", () => {
    const same: CopyrightHolder[] = [
      { name: "A", years: [2020], marker: "©", inherited: true },
      { name: "B", years: [2020], marker: "©", inherited: true },
      { name: "C", years: [2020], marker: "©", inherited: true },
    ];
    expect(orderHolders(same).map((h) => h.name)).toEqual(["A", "B", "C"]);
    expect(orderHolders(orderHolders(same)).map((h) => h.name)).toEqual(["A", "B", "C"]);
  });

  // Separate branch from the case above: two holders that BOTH lack years take a
  // different comparator path, and a mutation there survived the equal-years
  // test. Covered explicitly.
  it("is STABLE for two holders that BOTH lack years", () => {
    const undated: CopyrightHolder[] = [
      { name: "First", years: [], marker: "©", inherited: true },
      { name: "Second", years: [], marker: "©", inherited: true },
      { name: "Third", years: [], marker: "©", inherited: true },
    ];
    expect(orderHolders(undated).map((h) => h.name)).toEqual(["First", "Second", "Third"]);
    expect(orderHolders(orderHolders(undated)).map((h) => h.name)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });
});

// ---------------------------------------------------------------------------
// FR-007 — inherited lines re-emit VERBATIM
//
// The {name, years, marker} triple is lossy on real corpus data, so an inherited
// holder carries its source line and renders from that.
// ---------------------------------------------------------------------------

describe("inherited lines re-emit verbatim (FR-007)", () => {
  const COMPOUND =
    "Copyright (c) 2008-2024 FirstVoices, SIL International. Portions (c) 2006 Chris Harvey";

  it("re-emits a two-marker compound line byte-identically", () => {
    const r = parseCopyright(asLicense(COMPOUND));
    expect(r.ok).toBe(true);
    if (r.ok) expect(renderLicense(r.block).split("\n")[0]).toBe(COMPOUND);
  });

  it("re-emits a mixed comma-list-and-range line byte-identically", () => {
    const line = "Copyright (c) 2008, 2015, 2018-2023 thamiza.com and SIL International";
    const r = parseCopyright(asLicense(line));
    expect(r.ok && renderLicense(r.block).split("\n")[0]).toBe(line);
  });

  it("preserves the original line when a DIFFERENT author derives from it", () => {
    const r = parseCopyright(asLicense(COMPOUND));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = renderLicense(addHolder(r.block, "New Author", 2026));
    expect(out).toContain(COMPOUND);
    expect(out).toContain("Copyright © 2026 New Author");
  });

  // The subtle case: if the SAME holder derives again, the retained raw line no
  // longer states the new year, so it must be reconstructed rather than reused.
  it("stops re-emitting raw once that holder's years change", () => {
    const r = parseCopyright(asLicense("Copyright (c) 2016 Original Author"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = renderLicense(addHolder(r.block, "Original Author", 2026));
    expect(out).toContain("2016-2026 Original Author");
    expect(out).not.toContain("Copyright (c) 2016 Original Author");
  });

  it("every harvested line re-emits byte-identically", () => {
    for (const f of COPYRIGHT_LINE_FIXTURES) {
      const r = parseCopyright(asLicense(f.line));
      expect(r.ok, f.source).toBe(true);
      if (r.ok) {
        expect(renderLicense(r.block).split("\n")[0], `verbatim drift for ${f.source}`).toBe(f.line);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// P8 — dedupe + year accumulation
// ---------------------------------------------------------------------------

describe("addHolder / dedupeHolders — contract P8", () => {
  const base: CopyrightBlock = [
    { name: "Original Author", years: [2016, 2021], marker: "(c)", inherited: true },
  ];

  it("appends a new holder rather than replacing the original", () => {
    const out = addHolder(base, "Second Author", 2024, "(c)");
    expect(out.map((h) => h.name)).toEqual(["Original Author", "Second Author"]);
  });

  it("EXTENDS an existing holder's years instead of duplicating the line", () => {
    const twice = addHolder(addHolder(base, "Second Author", 2024), "Second Author", 2026);
    expect(twice.filter((h) => h.name === "Second Author")).toHaveLength(1);
    expect(twice.find((h) => h.name === "Second Author")?.years).toEqual([2024, 2026]);
  });

  it("renders the extended holder as a range", () => {
    const twice = addHolder(addHolder(base, "Second Author", 2024), "Second Author", 2026);
    expect(renderLicense(twice)).toContain("Copyright © 2024-2026 Second Author");
  });

  it("does NOT merge SIL International into SIL Global (exact-match only)", () => {
    const out = dedupeHolders([
      { name: "SIL International", years: [2019], marker: "©", inherited: true },
      { name: "SIL Global", years: [2025], marker: "©", inherited: true },
    ]);
    expect(out).toHaveLength(2);
  });

  it("marks a holder as current once they contribute in this session", () => {
    const out = addHolder(base, "Original Author", 2026);
    expect(out.find((h) => h.name === "Original Author")?.inherited).toBe(false);
    expect(out.find((h) => h.name === "Original Author")?.years).toEqual([2016, 2021, 2026]);
  });
});

// ---------------------------------------------------------------------------
// P7 — round-trip stability: the load-bearing test
//
// No release/ keyboard has two copyright lines, so multi-holder files have no
// precedent in the corpus — the studio authors the first ones and is therefore
// its OWN only upstream. Our own output is the real risk, not exotic shapes.
// ---------------------------------------------------------------------------

describe("round-trip stability — parse(render(x)) === x (contract P7)", () => {
  function roundTrip(block: CopyrightBlock): CopyrightBlock {
    const r = parseCopyright(renderLicense(block));
    expect(r.ok, "our own rendered output must be re-readable").toBe(true);
    return r.ok ? r.block : [];
  }

  /** Parsed output is always inherited:true, so compare on the rest. */
  function shape(block: CopyrightBlock) {
    return block.map((h) => ({ name: h.name, years: h.years, marker: h.marker }));
  }

  it("round-trips a single holder", () => {
    const block: CopyrightBlock = [
      { name: "Original Author", years: [2016, 2021], marker: "(c)", inherited: true },
    ];
    expect(shape(roundTrip(block))).toEqual(shape(block));
  });

  it("round-trips a two-holder fork chain", () => {
    const block = addHolder(
      [{ name: "Original Author", years: [2016, 2021], marker: "(c)", inherited: true }],
      "Second Author",
      2024,
    );
    expect(shape(roundTrip(block))).toEqual(shape(block));
  });

  it("round-trips a three-holder chain (fork of a fork)", () => {
    const block = addHolder(
      addHolder(
        [{ name: "Original Author", years: [2016, 2021], marker: "(c)", inherited: true }],
        "Second Author",
        2024,
      ),
      "Third Author",
      2026,
    );
    expect(block).toHaveLength(3);
    expect(shape(roundTrip(block))).toEqual(shape(block));
  });

  it("round-trips a four-holder chain including a year-less holder", () => {
    let block: CopyrightBlock = [
      { name: "SIL International", years: [], marker: "©", inherited: true },
      { name: "Original Author", years: [2016, 2021], marker: "(c)", inherited: true },
    ];
    block = addHolder(block, "Second Author", 2024);
    block = addHolder(block, "Third Author", 2026);
    expect(block).toHaveLength(4);
    expect(shape(roundTrip(block))).toEqual(shape(block));
  });

  it("is IDEMPOTENT — rendering twice yields byte-identical text", () => {
    const block = addHolder(
      [{ name: "Original Author", years: [2016, 2021], marker: "(c)", inherited: true }],
      "Second Author",
      2024,
    );
    const once = renderLicense(block);
    const twice = renderLicense(roundTrip(block));
    expect(twice).toBe(once);
  });

  it("round-trips every harvested corpus line through our own renderer", () => {
    for (const f of COPYRIGHT_LINE_FIXTURES) {
      const parsed = parseCopyright(asLicense(f.line));
      expect(parsed.ok, f.source).toBe(true);
      if (!parsed.ok) continue;
      const reparsed = parseCopyright(renderLicense(parsed.block));
      expect(reparsed.ok, `re-parse failed for ${f.source}`).toBe(true);
      if (reparsed.ok) {
        expect(shape(reparsed.block), `round-trip drift for ${f.source}`).toEqual(
          shape(parsed.block),
        );
      }
    }
  });
});
