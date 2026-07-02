import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { compile } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const minimalKmnPath = resolve(here, "__fixtures__", "minimal.kmn");
const minimalKmn = readFileSync(minimalKmnPath, "utf8");

describe("compile() — kmc-kmn pipeline against minimal.kmn fixture", () => {
  it("produces a non-empty .kmx artifact", async () => {
    const vfs = createVirtualFS([
      { path: "source/minimal.kmn", content: minimalKmn, isBinary: false },
    ]);
    const result = await compile(vfs, "minimal");

    const kmx = result.artifacts.find((a) => a.filename.endsWith(".kmx"));
    expect(kmx).toBeDefined();
    expect(kmx?.sizeBytes ?? 0).toBeGreaterThan(0);
  }, 30_000);

  it("emits no error- or fatal-severity diagnostics", async () => {
    const vfs = createVirtualFS([
      { path: "source/minimal.kmn", content: minimalKmn, isBinary: false },
    ]);
    const result = await compile(vfs, "minimal");

    const blocking = result.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "fatal",
    );
    expect(blocking).toEqual([]);
  }, 30_000);
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
