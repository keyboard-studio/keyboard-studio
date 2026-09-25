import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS, type CompileResult } from "@keyboard-studio/contracts";
import { compile, mapKmnCompilerEvent } from "./index.js";
import { loadKmcMessageTables } from "./kmcMessages.js";

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
//        (`+ any(name) > 'x'`) fails with kmcmplib's error-severity "A string
//        of zero characters was found" (ERROR_ZeroLengthString, 0x502017) on
//        the rule line and produces NO .kmx artifact at all. (This read as a
//        "silent" warning-level failure until compile() decoded kmcmplib's
//        severity from the message code.)
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

  it("an empty store consumed by any() produces NO .kmx artifact, with an error diagnostic on the rule line", async () => {
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
    expect(result.success).toBe(false);

    const ruleLine = kmnWithAnyOfEmptyStore.split("\n").indexOf("+ any(emptyProbe) > 'x'") + 1;
    const blocking = result.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "fatal",
    );
    expect(blocking).toEqual([
      expect.objectContaining({
        code: `KM_ERROR_KMCMP_${0x502017}`,
        severity: "error",
        message: expect.stringMatching(/zero characters/i),
        location: expect.objectContaining({ line: ruleLine }),
      }),
    ]);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Severity + location decode (regression). kmc-kmn's CompilerEvent has no
// `severity` field — severity is bit-packed into the numeric `code` — and it
// names the line field `line`, not `lineNumber`. compile() used to read both
// absent fields, so every kmcmplib error arrived as severity "warning"
// (`KM_WARNING_KMCMP_<code>`) with no location, and a "no error/fatal
// diagnostics" assertion (like the one above) could never catch one.
// ---------------------------------------------------------------------------

describe("compile() — kmcmplib severity and line decode", () => {
  it("labels a kmcmplib error as severity 'error' with its .kmn line", async () => {
    // Line 7 references a store that is never declared: kmcmplib's
    // ERROR_StoreDoesNotExist (SevError | KmnCompiler | 0x01D = 0x50201D).
    const failingKmn = [
      "store(&NAME) 'Severity Probe'",
      "store(&VERSION) '10.0'",
      "store(&TARGETS) 'any'",
      "begin Unicode > use(main)",
      "",
      "group(main) using keys",
      "+ [K_A] > index(nosuch, 1)",
      "",
    ].join("\n");
    const vfs = createVirtualFS([
      { path: "source/probe.kmn", content: failingKmn, isBinary: false },
    ]);
    const result = await compile(vfs, "probe");

    expect(result.success).toBe(false);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: `KM_ERROR_KMCMP_${0x50201d}`,
      severity: "error",
      layer: "A",
      location: { line: 7 },
    });
    expect(errors[0]?.location?.file).toMatch(/probe\.kmn$/);
    expect(result.diagnostics.some((d) => d.code.startsWith("KM_WARNING_"))).toBe(false);
  }, 30_000);

  it("decodes every CompilerErrorSeverity band from the code's severity bits", async () => {
    const tables = await loadKmcMessageTables();
    const base = 0x2000 | 0x01d; // KmnCompiler namespace | base code
    expect(tables.severity(0x000000 | base)).toBe("info"); // Debug
    expect(tables.severity(0x100000 | base)).toBe("info"); // Verbose
    expect(tables.severity(0x200000 | base)).toBe("info");
    expect(tables.severity(0x300000 | base)).toBe("hint");
    expect(tables.severity(0x400000 | base)).toBe("warning");
    expect(tables.severity(0x500000 | base)).toBe("error");
    expect(tables.severity(0x600000 | base)).toBe("fatal");
    // Symbolic names come from kmc-kmn's own message tables.
    expect(tables.name(0x50201d)).toBe("ERROR_StoreDoesNotExist");
    expect(tables.name(0x3020ae)).toBe("HINT_UnreachableRule");
    expect(tables.name(0x507004)).toBe("ERROR_TouchLayoutFileDoesNotExist"); // KmwCompiler namespace
    expect(tables.name(0x5020ff)).toBeUndefined();
  });

  it("maps the CompilerEvent shape: severity-derived code prefix, `line`, filename fallback", async () => {
    const tables = await loadKmcMessageTables();
    // Non-numeric codes keep the old "warning" fallback.
    expect(mapKmnCompilerEvent({ code: "ERROR_Something", message: "x" }, "k", tables).severity).toBe("warning");
    expect(
      mapKmnCompilerEvent({ code: 0x4020a3, message: "w", line: 3 }, "source/k.kmn", tables),
    ).toEqual({
      code: `KM_WARN_KMCMP_${0x4020a3}`,
      severity: "warning",
      layer: "A",
      message: "w",
      location: { file: "source/k.kmn", line: 3 },
    });
    expect(
      mapKmnCompilerEvent(
        { code: 0x600000 | 0x2001, message: "f", filename: "source/other.kmn", line: 9 },
        "source/k.kmn",
        tables,
      ),
    ).toMatchObject({ severity: "fatal", location: { file: "source/other.kmn", line: 9 } });
    // No line → no location (kmc-kmn's own messages, e.g. Error_FileNotFound).
    expect(mapKmnCompilerEvent({ code: 0x50290c, message: "e" }, "source/k.kmn", tables)).not.toHaveProperty(
      "location",
    );
  });
});
