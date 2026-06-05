import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { makeMockVirtualFS } from "@keyboard-studio/contracts/mocks";
import { compile } from "./index.js";

// Compile gate for the nfd-latin reorder pattern's demo skeleton (issue #40).
// The pattern's demo.filled_kmn is mirrored verbatim into this fixture so the
// canonical mark-reorder block is proven to compile clean through kmc-kmn.
const here = dirname(fileURLToPath(import.meta.url));
const demoKmnPath = resolve(here, "__fixtures__", "nfd_latin_demo.kmn");
const demoKmn = readFileSync(demoKmnPath, "utf8");

describe("compile() — nfd-latin reorder demo skeleton", () => {
  it("produces a non-empty .kmx artifact", async () => {
    const vfs = makeMockVirtualFS([
      { path: "source/nfd_latin_demo.kmn", content: demoKmn },
    ]);
    const result = await compile(vfs, "nfd_latin_demo");

    const kmx = result.artifacts.find((a) => a.filename.endsWith(".kmx"));
    expect(kmx).toBeDefined();
    expect(kmx?.sizeBytes ?? 0).toBeGreaterThan(0);
  }, 30_000);

  it("emits no error- or fatal-severity diagnostics", async () => {
    const vfs = makeMockVirtualFS([
      { path: "source/nfd_latin_demo.kmn", content: demoKmn },
    ]);
    const result = await compile(vfs, "nfd_latin_demo");

    const blocking = result.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "fatal",
    );
    expect(blocking).toEqual([]);
  }, 30_000);
});
