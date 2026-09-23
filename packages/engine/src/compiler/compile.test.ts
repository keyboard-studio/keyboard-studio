import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS, type CompileResult } from "@keyboard-studio/contracts";
import { compile } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (keyboardId: string) =>
  readFileSync(resolve(here, "__fixtures__", `${keyboardId}.kmn`), "utf8");
const minimalKmn = readFixture("minimal");

// Fixtures that must compile clean through kmc-kmn. Each is compiled once and
// the assertions share the result.
//   - minimal: the smallest compilable keyboard.
//   - nfd_latin_demo: the nfd-latin reorder pattern's demo skeleton (issue
//     #40). The pattern's demo.filled_kmn is mirrored verbatim into this
//     fixture so the canonical mark-reorder block is proven to compile clean.
describe.each(["minimal", "nfd_latin_demo"])("compile() — kmc-kmn pipeline against %s.kmn fixture", (keyboardId) => {
  let result: CompileResult;

  beforeAll(async () => {
    const vfs = createVirtualFS([
      { path: `source/${keyboardId}.kmn`, content: readFixture(keyboardId), isBinary: false },
    ]);
    result = await compile(vfs, keyboardId);
  }, 30_000);

  it("produces a non-empty .kmx artifact", () => {
    const kmx = result.artifacts.find((a) => a.filename.endsWith(".kmx"));
    expect(kmx).toBeDefined();
    expect(kmx?.sizeBytes ?? 0).toBeGreaterThan(0);
  });

  it("emits no error- or fatal-severity diagnostics", () => {
    const blocking = result.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "fatal",
    );
    expect(blocking).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Oracle-pinning: empty-store guard evidence (packages/engine/src/pattern-apply/
// applyStoreSlotRemovals.ts). These two tests pin the exact kmcmplib behavior
// that justifies that transform's refusal guard, against the real in-repo
// kmcmplib WASM (not a mock):
//
//   (i)  An empty store DECLARATION (`store(name)`, zero value tokens) is
//        legal on its own — it compiles to a valid .kmx with no error/fatal
//        diagnostics when the store is unreferenced.
//   (ii) The SAME empty store consumed by any() in a rule
//        (`+ any(name) > 'x'`) compiles with only a warning-level "zero
//        characters" diagnostic and produces NO .kmx artifact at all — a
//        silent build failure, not a loud one.
//
// If either of these regresses (e.g. a kmcmplib upgrade starts rejecting
// case (i), or starts emitting a .kmx for case (ii)), the refusal guard's
// premise needs re-deriving — treat a failure here as a signal to revisit
// applyStoreSlotRemovals's drop-class empty-store handling, not just a test
// fixture to patch.
// ---------------------------------------------------------------------------

describe("compile() — oracle pinning for the empty-store guard (#523)", () => {
  it("an unreferenced empty store declaration compiles to a .kmx artifact with no error/fatal diagnostics", async () => {
    const kmnWithEmptyStore = minimalKmn + "\nstore(emptyProbe)\n";
    const vfs = createVirtualFS([
      { path: "source/minimal.kmn", content: kmnWithEmptyStore, isBinary: false },
    ]);
    const result = await compile(vfs, "minimal");

    const kmx = result.artifacts.find((a) => a.filename.endsWith(".kmx"));
    expect(kmx).toBeDefined();
    expect(kmx?.sizeBytes ?? 0).toBeGreaterThan(0);

    const blocking = result.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "fatal",
    );
    expect(blocking).toEqual([]);
  }, 30_000);

  it("an empty store consumed by any() produces NO .kmx artifact (silent failure), with no error/fatal diagnostics", async () => {
    const kmnWithAnyOfEmptyStore =
      minimalKmn +
      [
        "",
        "store(emptyProbe)",
        "group(probe) using keys",
        "+ any(emptyProbe) > 'x'",
        "",
      ].join("\n");
    const vfs = createVirtualFS([
      { path: "source/minimal.kmn", content: kmnWithAnyOfEmptyStore, isBinary: false },
    ]);
    const result = await compile(vfs, "minimal");

    const kmx = result.artifacts.find((a) => a.filename.endsWith(".kmx"));
    expect(kmx).toBeUndefined();

    const blocking = result.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "fatal",
    );
    expect(blocking).toEqual([]);
  }, 30_000);
});
