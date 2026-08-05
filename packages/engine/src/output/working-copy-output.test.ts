// spec 034 T009 (PP-1, PP-4; AS-6, SC-001) — the ZIP produced from a completed
// working copy contains the three keyboard source files (.kmn/.kvks/.kps), each
// non-empty, AND that keyboard passes Layer A/B validation and the kmcmplib
// compile oracle (a .kmx artifact with no error/fatal diagnostics).
//
// This is the engine-side floor for the MVP desktop walk: whatever the studio
// serializes at output must be a real, compilable keyboard — not just a bag of
// files. The .kmn reuses the proven-compilable minimal fixture so a regression
// in toZip / compile / the Layer A/B checks fails HERE, decoupled from the SPA.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { unzipSync } from "fflate";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { VirtualFS } from "@keyboard-studio/contracts";
import { toZip } from "./zip.js";
import { compile } from "../compiler/index.js";
import { runAllChecks } from "../validator/index.js";

const KEYBOARD_ID = "t009_working_copy";

const here = dirname(fileURLToPath(import.meta.url));
const minimalKmnPath = resolve(here, "..", "compiler", "__fixtures__", "minimal.kmn");

// A minimal-but-real, kmcmplib-compilable .kmn — reuses the proven-compilable
// compiler/__fixtures__/minimal.kmn fixture (see compile.test.ts) rather than
// retyping it, so the two copies can't silently drift apart.
const KMN = readFileSync(minimalKmnPath, "utf8").replace("Minimal", "T009 Working Copy");

// Minimal well-formed .kvks (visual keyboard) and .kps (package) — content need
// only be present + non-empty for the archive assertions; compile reads the .kmn.
const KVKS = `<?xml version="1.0" encoding="utf-8"?>\n<visualkeyboard><header><version>10.0</version></header><encoding><layer/></encoding></visualkeyboard>`;
const KPS = `<?xml version="1.0" encoding="utf-8"?>\n<Package><Info><Name value="T009 Working Copy"/><Version value="1.0"/></Info></Package>`;

function makeCompletedWorkingCopyVfs(): VirtualFS {
  return createVirtualFS([
    { path: `source/${KEYBOARD_ID}.kmn`, content: KMN, isBinary: false },
    { path: `source/${KEYBOARD_ID}.kvks`, content: KVKS, isBinary: false },
    { path: `source/${KEYBOARD_ID}.kps`, content: KPS, isBinary: false },
  ]);
}

describe("spec 034 T009 — completed working copy → ZIP + compile + Layer A/B", () => {
  it("PP-1: the ZIP contains a non-empty .kmn, .kvks, and .kps", async () => {
    const zip = await toZip(makeCompletedWorkingCopyVfs());
    const entries = unzipSync(zip);
    const paths = Object.keys(entries);

    for (const ext of [".kmn", ".kvks", ".kps"]) {
      const path = paths.find((p) => p.endsWith(ext));
      expect(path, `zip must contain a ${ext} file`).toBeDefined();
      expect(entries[path!]!.length, `${ext} must be non-empty`).toBeGreaterThan(0);
    }
  });

  it("SC-001: the keyboard compiles via the kmcmplib oracle (a .kmx with no error/fatal diagnostics)", async () => {
    const result = await compile(makeCompletedWorkingCopyVfs(), KEYBOARD_ID);

    const kmx = result.artifacts.find((a) => a.filename.endsWith(".kmx"));
    expect(kmx, "compile must emit a .kmx artifact").toBeDefined();
    expect(kmx?.sizeBytes ?? 0).toBeGreaterThan(0);

    const blocking = result.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "fatal",
    );
    expect(blocking).toEqual([]);
  }, 30_000);

  it("passes Layer A/B validation (no error/fatal findings on the .kmn source)", () => {
    const findings = runAllChecks(KMN);
    const blocking = findings.filter(
      (f) => f.severity === "error" || f.severity === "fatal",
    );
    expect(blocking).toEqual([]);
  });
});
