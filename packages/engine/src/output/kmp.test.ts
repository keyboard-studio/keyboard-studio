// buildKmp() against the REAL bambara descriptor (see __fixtures__/bambara/
// PROVENANCE.md). This is the integration proof: the .kmn compile and the .kmp
// package must fit together, and every member path the descriptor names must
// resolve to a VirtualFS key.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { unzipSync } from "fflate";
import { createVirtualFS, type VirtualFS } from "@keyboard-studio/contracts";
import { compile } from "../compiler/index.js";
import { buildKmp, formatKmCode, mapKmpEvent, type KmpBuildArtifacts } from "./kmp.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (...p: string[]): string => resolve(here, "__fixtures__", "bambara", ...p);
const readText = (...p: string[]): string => readFileSync(fx(...p), "utf8");

const KBD = "bambara";

function fixtureVfs(): VirtualFS {
  return createVirtualFS([
    { path: `source/${KBD}.kps`, content: readText("source", `${KBD}.kps`), isBinary: false },
    { path: `source/${KBD}.kmn`, content: readText("source", `${KBD}.kmn`), isBinary: false },
    { path: `source/${KBD}.kvks`, content: readText("source", `${KBD}.kvks`), isBinary: false },
    // &BITMAP and &LAYOUTFILE: the .kmn header names both, and the compile fails
    // (KM02031, "cannot open the bitmap or icon file") without the icon.
    { path: `source/${KBD}.ico`, content: readFileSync(fx("source", `${KBD}.ico`)), isBinary: true },
    {
      path: `source/${KBD}.keyman-touch-layout`,
      content: readText("source", `${KBD}.keyman-touch-layout`),
      isBinary: false,
    },
    { path: "source/welcome.htm", content: readText("source", "welcome.htm"), isBinary: false },
    { path: "source/readme.htm", content: readText("source", "readme.htm"), isBinary: false },
    { path: "LICENSE.md", content: readText("LICENSE.md"), isBinary: false },
  ]);
}

/**
 * Compile the fixture once for the whole suite — the .kmn compile is the slow
 * part (wasm load), the packaging is milliseconds.
 */
let artifacts: KmpBuildArtifacts;

beforeAll(async () => {
  const result = await compile(fixtureVfs(), KBD);
  const pick = (ext: string): Uint8Array | undefined =>
    result.artifacts.find((a) => a.filename.toLowerCase().endsWith(ext))?.data;
  const kmx = pick(".kmx");
  if (kmx === undefined) {
    throw new Error(
      `fixture precondition failed: no .kmx from compile(). diagnostics=${JSON.stringify(
        result.diagnostics.map((d) => `${d.severity}:${d.message}`),
      )}`,
    );
  }
  artifacts = {
    kmx,
    ...(pick(".kvk") !== undefined ? { kvk: pick(".kvk") as Uint8Array } : {}),
    ...(pick(".js") !== undefined ? { js: pick(".js") as Uint8Array } : {}),
  };
}, 60_000);

describe("buildKmp() — real kmc-package against the bambara fixture", () => {
  it("produces a non-empty .kmp that is a zip", async () => {
    const result = await buildKmp(fixtureVfs(), KBD, artifacts);

    expect(
      result.diagnostics.filter((d) => d.severity === "error" || d.severity === "fatal"),
    ).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.filename).toBe(`${KBD}.kmp`);
    expect(result.bytes.byteLength).toBeGreaterThan(0);
    // Zip local-file-header magic.
    expect(result.bytes[0]).toBe(0x50); // 'P'
    expect(result.bytes[1]).toBe(0x4b); // 'K'
  }, 60_000);

  it("contains every descriptor member, FLATTENED to basename", async () => {
    // THE assertion that proves all three path shapes resolved:
    //   ..\build\bambara.kmx|.js|.kvk  (up out of source/)
    //   welcome.htm, readme.htm        (siblings of the .kps)
    //   ..\LICENSE.md                  (up to the repo root)
    // If any had failed to resolve, kmc-package would have reported KM04003 and
    // returned no artifact at all.
    const result = await buildKmp(fixtureVfs(), KBD, artifacts);
    const members = Object.keys(unzipSync(result.bytes)).sort();

    expect(members).toEqual(
      [
        "kmp.inf",
        "kmp.json",
        "bambara.js",
        "bambara.kmx",
        "bambara.kvk",
        "readme.htm",
        "welcome.htm",
        "LICENSE.md",
      ].sort(),
    );
    // No directory components survive.
    expect(members.some((m) => m.includes("/") || m.includes("\\"))).toBe(false);
  }, 60_000);

  it("writes a kmp.json declaring the keyboard and its language", async () => {
    const result = await buildKmp(fixtureVfs(), KBD, artifacts);
    const entry = unzipSync(result.bytes)["kmp.json"];
    expect(entry).toBeDefined();
    const kmpJson = JSON.parse(new TextDecoder().decode(entry)) as {
      system?: { fileVersion?: string };
      keyboards?: { id?: string; name?: string; version?: string; languages?: unknown[] }[];
      files?: { name?: string }[];
    };

    expect(kmpJson.keyboards?.[0]?.id).toBe(KBD);
    // <FollowKeyboardVersion/> means the version is read out of the .kmx, not
    // taken from the descriptor — so a real version, never a blank.
    expect(kmpJson.keyboards?.[0]?.version).toMatch(/^\d/);
    expect(kmpJson.keyboards?.[0]?.languages?.length ?? 0).toBeGreaterThan(0);
    // Members are recorded by basename in kmp.json too.
    expect(kmpJson.files?.some((f) => f.name === "bambara.kmx")).toBe(true);
  }, 60_000);

  it("CORE INVARIANT: does not mutate the caller's VirtualFS", async () => {
    const vfs = fixtureVfs();
    const before = vfs.list().sort();

    await buildKmp(vfs, KBD, artifacts);

    expect(vfs.list().sort()).toEqual(before);
    // Staging happened on a clone — build/ must not leak into the VFS the zip
    // and the GitHub PR path also read from.
    expect(vfs.get(`build/${KBD}.kmx`)).toBeUndefined();
    expect(vfs.get(`build/${KBD}.kvk`)).toBeUndefined();
    expect(vfs.get(`build/${KBD}.js`)).toBeUndefined();
  }, 60_000);

  it("reports a listed-but-absent member instead of throwing", async () => {
    // The descriptor lists ..\build\bambara.kvk; withhold it.
    const withoutKvk: KmpBuildArtifacts = { kmx: artifacts.kmx };
    if (artifacts.js !== undefined) withoutKvk.js = artifacts.js;

    const result = await buildKmp(fixtureVfs(), KBD, withoutKvk);

    expect(result.success).toBe(false);
    expect(result.bytes.byteLength).toBe(0);
    const blocking = result.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "fatal",
    );
    expect(blocking.length).toBeGreaterThan(0);
    // Names the actual missing member, not just "build failed".
    expect(JSON.stringify(result.diagnostics)).toContain("bambara.kvk");
  }, 60_000);

  it("reports a missing descriptor instead of throwing", async () => {
    const vfs = fixtureVfs();
    vfs.delete(`source/${KBD}.kps`);

    const result = await buildKmp(vfs, KBD, artifacts);

    expect(result.success).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain("KM_ERROR_KMP_NO_DESCRIPTOR");
  });

  it("never throws across every failure shape", async () => {
    const empty = createVirtualFS([]);
    await expect(buildKmp(empty, KBD, artifacts)).resolves.toMatchObject({ success: false });
    await expect(
      buildKmp(fixtureVfs(), "nonexistent-id", artifacts),
    ).resolves.toMatchObject({ success: false });
  }, 60_000);

  it("runs two concurrent builds without cross-contamination", async () => {
    const [a, b] = await Promise.all([
      buildKmp(fixtureVfs(), KBD, artifacts),
      buildKmp(fixtureVfs(), KBD, artifacts),
    ]);

    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    expect(a.bytes.byteLength).toBeGreaterThan(0);
    expect(b.bytes.byteLength).toBeGreaterThan(0);
  }, 60_000);
});

describe("diagnostic mapping — severity is bit-packed in `code`, not a field", () => {
  it("formats codes the way kmc's own CLI prints them", () => {
    // Real kmc-package codes, computed from CompilerErrorNamespace.PackageCompiler
    // (0x4000) | severity | base:  ERROR_FileDoesNotExist, WARN_AbsolutePath.
    expect(formatKmCode(0x00504003)).toBe("KM04003");
    expect(formatKmCode(0x00404002)).toBe("KM04002");
    expect(formatKmCode(Number.NaN)).toBe("KM_UNKNOWN");
  });

  it("decodes each severity band", () => {
    const cases: [number, string, string][] = [
      [0x00604000, "fatal", "KM_FATAL_KMP_KM04000"],
      [0x00504003, "error", "KM_ERROR_KMP_KM04003"],
      [0x00404002, "warning", "KM_WARN_KMP_KM04002"],
      [0x00304000, "hint", "KM_HINT_KMP_KM04000"],
      [0x00204000, "info", "KM_INFO_KMP_KM04000"],
    ];
    for (const [code, severity, expectedCode] of cases) {
      const d = mapKmpEvent({ code, message: "m" }, "source/x.kps", "");
      expect(d.severity).toBe(severity);
      expect(d.code).toBe(expectedCode);
      expect(d.layer).toBe("A");
    }
  });

  it("does NOT trust a `severity` field (CompilerEvent has none)", () => {
    // Guards against re-importing the kmn bridge's defect, where a non-existent
    // `severity` field made every diagnostic a warning — including fatals.
    const d = mapKmpEvent(
      { code: 0x00504003, message: "m", severity: "warning" },
      "source/x.kps",
      "",
    );
    expect(d.severity).toBe("error");
  });

  it("carries detail into hint and expands offset into line/column", () => {
    const text = "line1\nline2\nline3";
    const d = mapKmpEvent(
      { code: 0x00404002, message: "m", detail: "extra", offset: 8 },
      "source/x.kps",
      text,
    );
    expect(d.hint).toBe("extra");
    expect(d.location?.line).toBe(2);
    expect(d.location?.column).toBe(3);
  });

  it("falls back to the descriptor path and survives a shapeless event", () => {
    const d = mapKmpEvent({ code: 0x00404002, message: "m" }, "source/x.kps", "");
    expect(d.location).toBeUndefined(); // no line -> no location at all

    // A shapeless event yields code -1, whose severity band matches nothing —
    // it degrades to `warning` rather than silently claiming to be `info`.
    const junk = mapKmpEvent({}, "source/x.kps", "");
    expect(junk.severity).toBe("warning");
    expect(junk.code).toBe("KM_WARN_KMP_KMFFFFF");
    expect(junk.message).toContain("no message");
  });
});
