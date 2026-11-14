// The LDML download path of buildOutputBundle (spec 108 FR-002, FR-006, FR-007, FR-030).
// Node environment: the zip writers reject the Uint8Arrays the jsdom realm hands them.
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
import { i18n } from "@lingui/core";
import type { VirtualFS, StartKeyboard } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { messages as enMessages } from "../locales/en/messages.json?lingui";
import { messages as frMessages } from "../locales/fr/messages.json?lingui";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";

const spies = vi.hoisted(() => ({
  compile: vi.fn(),
  compileCall: vi.fn(),
  buildKmp: vi.fn(),
  validateWithOracle: vi.fn(),
  projected: { current: null as VirtualFS | null },
  compileLdml: vi.fn(),
  compileOverride: { current: null as null | ((xml: string) => Promise<unknown>) },
}));

vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@keyboard-studio/engine")>();
  return { ...actual, validateWithOracle: spies.validateWithOracle };
});

vi.mock("./services.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./services.ts")>();
  return {
    ...actual,
    getCompile: async () => {
      spies.compile();
      return async (...args: unknown[]) => {
        spies.compileCall(...args);
        return {
          success: true,
          diagnostics: [],
          artifacts: [{ filename: "ldml_fixture.kmx", data: new Uint8Array([1, 2, 3]) }],
        };
      };
    },
    getCompileLdml: async () => {
      spies.compileLdml();
      const override = spies.compileOverride.current;
      return override ?? (await actual.getCompileLdml());
    },
    getBuildKmp: async () => async (vfs: VirtualFS) => {
      spies.buildKmp([...vfs.list()]);
      return { success: true, bytes: new Uint8Array([80, 75]), filename: "ldml_fixture.kmp", diagnostics: [] };
    },
  };
});

vi.mock("./serializeWorkingCopy.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./serializeWorkingCopy.ts")>();
  return {
    ...actual,
    projectWorkingCopyForOutput: async (...args: Parameters<typeof actual.projectWorkingCopyForOutput>) => {
      const result = await actual.projectWorkingCopyForOutput(...args);
      spies.projected.current = result === null ? null : result.vfs;
      return result;
    },
  };
});

import {
  buildKmpForDownload,
  buildLdmlExportForDownload,
  buildLdmlKmpForDownload,
  buildSourceZipForDownload,
  targetsIncludeTouch,
  OutputBundleError,
} from "./buildOutputBundle.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";

i18n.load({ en: enMessages, fr: frMessages });

const KMN = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'Ldml Fixture'",
  "store(&TARGETS) 'any'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ 'a' > 'b'",
  "",
].join("\n");

const TOUCH_JSON = JSON.stringify({ phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A" }] }] }] } });

function instantiate(kmn: string = KMN, touchLayoutJson: string | null = null): void {
  const vfs = createVirtualFS([{ path: "source/ldml_fixture.kmn", content: kmn, isBinary: false }]);
  const { ir } = parseKmn(kmn, "ldml_fixture");
  useWorkingCopyStore.setState({
    instantiationMode: "new-from-base",
    startKeyboard: { id: "ldml_fixture", displayName: "Ldml Fixture", languages: ["en"] } as StartKeyboard,
    startVfs: vfs,
    startIr: ir,
    ir,
    touchLayoutJson,
    identity: { keyboardId: "ldml_fixture", bcp47: "en", displayName: "Ldml Fixture" },
    attribution: { authorName: "Test Author", copyrightHolder: "Test Author" },
  });
}

function snapshot(vfs: VirtualFS): string {
  return JSON.stringify(
    vfs.list().map((path) => {
      const e = vfs.get(path);
      return [path, e === undefined ? null : typeof e.content === "string" ? e.content : Array.from(e.content)];
    }),
  );
}

const KEYBOARD_XML = /\.xml$/i;

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useDecisionStore.getState().reset();
  spies.compile.mockClear();
  spies.buildKmp.mockClear();
  spies.validateWithOracle.mockClear();
  spies.projected.current = null;
  spies.compileLdml.mockClear();
  spies.compileOverride.current = null;
  i18n.activate("en");
});

describe("targetsIncludeTouch", () => {
  it.each([
    [[], true],
    [["any"], true],
    [["windows macosx linux"], false],
    [["windows", "web"], true],
    [["androidphone"], true],
    [["desktop"], false],
  ] as const)("%j -> %s", (targets, expected) => {
    expect(targetsIncludeTouch(targets)).toBe(expected);
  });
});

describe("buildLdmlExportForDownload", () => {
  it("returns the LDML zip named <id>_ldml-<version>.zip with the report and the keyboard", async () => {
    instantiate();
    const result = await buildLdmlExportForDownload("46");
    expect(result.filename).toMatch(/^ldml_fixture_ldml-.+\.zip$/);
    const names = Object.keys(unzipSync(result.bytes));
    expect(names).toContain("LDML-EXPORT-REPORT.md");
    expect(names).toContain("source/ldml_fixture_ldml.xml");
  });

  it("leaves the projected VFS unchanged (FR-007)", async () => {
    instantiate();
    const before = await projectWorkingCopyForOutput();
    const beforeSnapshot = snapshot(before!.vfs);
    await buildLdmlExportForDownload("46");
    const used = spies.projected.current;
    expect(used).not.toBeNull();
    // The vfs the export read is byte-identical to a fresh projection: nothing was written back.
    expect(snapshot(used!)).toBe(beforeSnapshot);
  });

  it("calls no compile and no validator (FR-006)", async () => {
    instantiate();
    await buildLdmlExportForDownload("46");
    expect(spies.compile).not.toHaveBeenCalled();
    expect(spies.buildKmp).not.toHaveBeenCalled();
    expect(spies.validateWithOracle).not.toHaveBeenCalled();
  });

  it("is byte-identical with the Lingui locale activated as en and then as fr (FR-030, SC-009)", async () => {
    instantiate();
    i18n.activate("en");
    const en = await buildLdmlExportForDownload("46");
    i18n.activate("fr");
    const fr = await buildLdmlExportForDownload("46");
    expect(Array.from(fr.bytes)).toEqual(Array.from(en.bytes));
    expect(fr.filename).toBe(en.filename);
  });

  it("names the selected profile in the report", async () => {
    instantiate();
    const result = await buildLdmlExportForDownload("49");
    const report = strFromU8(unzipSync(result.bytes)["LDML-EXPORT-REPORT.md"]!);
    expect(report).toContain("- Profile: 49 (namespace");
  });

  it("refuses with the FR-027 reason when no base keyboard can be chosen", async () => {
    instantiate();
    useDecisionStore.setState({
      decisions: { "windows-layout": { id: "windows-layout", value: { layoutIds: ["basic_kbdru"] } } as never },
    });
    await expect(buildLdmlExportForDownload("46")).rejects.toThrow(OutputBundleError);
    await expect(buildLdmlExportForDownload("46")).rejects.toThrow(/no reference data/);
    useWorkingCopyStore.getState().setLdmlBaseLayout("uk");
    await expect(buildLdmlExportForDownload("46")).resolves.toBeDefined();
  });

  // Row 4.6's rule itself (touch form only for a touch or web target) is pinned on
  // the function's direct input in the targetsIncludeTouch table above. Through the
  // projection it can no longer be reached: the projection always writes
  // store(&TARGETS) 'any' (product owner ruling 2026-11-07), so the exporter
  // reads 'any' whatever the starting point declared.
  it("always exports the touch form, because the projected .kmn says 'any' whatever the start declared (row 4.6)", async () => {
    for (const declared of ["'any'", "'windows macosx linux'", "'windows web'"]) {
      instantiate(KMN.replace("'any'", declared), TOUCH_JSON);
      const r = await buildLdmlExportForDownload("46");
      expect(strFromU8(unzipSync(r.bytes)["source/ldml_fixture_ldml.xml"]!), `declared ${declared}`).toContain('formId="touch"');
      const projectedKmn = spies.projected.current!.get("source/ldml_fixture.kmn")?.content as string;
      expect(projectedKmn, `declared ${declared}`).toContain("store(&TARGETS) 'any'");
      expect(projectedKmn, `declared ${declared}`).not.toMatch(/store\(&TARGETS\) '(?!any')/);
    }
  });

  it("throws an OutputBundleError with the ANSI-only reason for a begin ANSI keyboard", async () => {
    instantiate(KMN.replace("begin Unicode", "begin ANSI"));
    await expect(buildLdmlExportForDownload("46")).rejects.toThrow(/ANSI-only/);
  });
});

describe("the shipped binaries are a release build", () => {
  // kmc-kmn defaults saveDebug to true; a package must match what Keyman
  // Developer builds from the same source, so the output compile turns it off.
  it.each([
    ["the .kmp", () => buildKmpForDownload()],
    ["the source .zip", () => buildSourceZipForDownload()],
  ])("%s compiles with saveDebug: false", async (_label, download) => {
    instantiate();
    spies.compileCall.mockClear();
    await download();
    expect(spies.compileCall).toHaveBeenCalledTimes(1);
    expect(spies.compileCall.mock.calls[0]![2]).toEqual({ saveDebug: false });
  });
});

describe("the other outputs never carry LDML (FR-002, Art VII)", () => {
  it("the source .zip has no keyboard .xml and no report", async () => {
    instantiate();
    const zip = await buildSourceZipForDownload();
    const names = Object.keys(unzipSync(zip!.bytes));
    expect(names.filter((n) => KEYBOARD_XML.test(n))).toEqual([]);
    expect(names).not.toContain("LDML-EXPORT-REPORT.md");
  });

  it("the .kmp is built from a tree with no keyboard .xml and no report", async () => {
    instantiate();
    await buildKmpForDownload();
    expect(spies.buildKmp).toHaveBeenCalledTimes(1);
    const paths = spies.buildKmp.mock.calls[0]![0] as string[];
    expect(paths.filter((n) => KEYBOARD_XML.test(n))).toEqual([]);
    expect(paths).not.toContain("LDML-EXPORT-REPORT.md");
  });

  it("the pull-request projection has no LDML file", async () => {
    instantiate();
    await buildLdmlExportForDownload("46");
    const projected = await projectWorkingCopyForOutput();
    const paths = projected!.vfs.list();
    expect(paths.filter((n) => KEYBOARD_XML.test(n))).toEqual([]);
    expect(paths).not.toContain("LDML-EXPORT-REPORT.md");
    expect(paths.some((n) => n.includes("_ldml"))).toBe(false);
  });
});

describe("buildLdmlKmpForDownload (spec 108 Story 5, FR-072, FR-074, FR-076)", () => {
  it("compiles a clean export and returns <id>_ldml.kmp with the versions", async () => {
    instantiate();
    const result = await buildLdmlKmpForDownload("46");
    expect(spies.compileLdml).toHaveBeenCalledTimes(1);
    expect(result.compile.unexpected).toEqual([]);
    expect(result.compile.expected).toEqual([]);
    expect(result.compile.versions.compiler).not.toBe("");
    expect(result.compile.versions.kmxPlus).toBeGreaterThan(0);
    expect(result.kmp?.filename).toBe("ldml_fixture_ldml.kmp");
    const members = Object.keys(unzipSync(result.kmp!.bytes));
    expect(members).toEqual(expect.arrayContaining(["ldml_fixture_ldml.kmx", "kmp.json", "LDML-COMPILE-REPORT.md"]));
  });

  it("stages nothing into the projection the source .zip and the PR path read", async () => {
    instantiate();
    const zipBefore = Object.keys(unzipSync((await buildSourceZipForDownload())!.bytes)).sort();
    await buildLdmlKmpForDownload("46");
    const during = spies.projected.current!;
    const before = snapshot(during);
    const projected = await projectWorkingCopyForOutput();
    const paths = projected!.vfs.list();
    expect(paths.some((p) => p.startsWith("build/") || p.endsWith(".kmp") || p.endsWith(".kmx"))).toBe(false);
    expect(paths.some((p) => p.includes("_ldml"))).toBe(false);
    expect(snapshot(during)).toBe(before);
    const zipAfter = Object.keys(unzipSync((await buildSourceZipForDownload())!.bytes)).sort();
    expect(zipAfter).toEqual(zipBefore);
  });

  it("returns no package and keeps the messages when the compile has an error", async () => {
    instantiate();
    spies.compileOverride.current = async () => ({
      ok: false,
      messages: [{ code: "ERROR_Surprise", severity: "error", text: "bad thing", line: 3 }],
      compilerVersion: "x",
      kmxPlusVersion: 0,
    });
    const result = await buildLdmlKmpForDownload("46");
    expect(result.kmp).toBeUndefined();
    expect(result.compile.unexpected.map((m) => m.code)).toEqual(["ERROR_Surprise"]);
    expect(result.compile.unexpected[0]?.text).toBe("bad thing");
  });

  it("refuses a profile Keyman's schema does not accept, before compiling", async () => {
    instantiate();
    await expect(buildLdmlKmpForDownload("49")).rejects.toThrow(OutputBundleError);
    await expect(buildLdmlKmpForDownload("49")).rejects.toThrow(/TR35-only/);
    expect(spies.compileLdml).not.toHaveBeenCalled();
  });

  it("throws for the same preconditions as the source export", async () => {
    await expect(buildLdmlKmpForDownload("46")).rejects.toThrow(OutputBundleError);
    useWorkingCopyStore.getState().reset();
    instantiate(KMN.replace("begin Unicode", "begin ANSI"));
    await expect(buildLdmlKmpForDownload("46")).rejects.toThrow(/ANSI-only/);
  });

  it("creates no timer: the compiled path is event-driven (D3)", () => {
    const src = readFileSync(fileURLToPath(new URL("./buildOutputBundle.ts", import.meta.url)), "utf8");
    const at = src.indexOf("export async function buildLdmlKmpForDownload");
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at)).not.toMatch(/setTimeout|setInterval/);
  });
});
