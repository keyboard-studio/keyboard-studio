// CLDR branch of fetchKeyboardSourceToVfs (issue #2599): a `origin: "cldr"`
// start fetches the pinned 43.1 XML files, imports them, and writes an
// emitted .kmn + .keyman-touch-layout into the VFS. No network — all fetches
// use the injected mockFetch.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { fetchKeyboardSourceToVfs } from "./fetchKeyboardSourceToVfs.js";
import type { FetchFn } from "./fetchKeyboardSourceToVfs.js";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string): string =>
  readFileSync(
    resolve(here, "..", "cldr-import", "__fixtures__", name),
    "utf8",
  );

const PROXY = "https://raw-proxy.example";
const CLDR_BASE = `${PROXY}/unicode-org/cldr/release-43-1/keyboards`;

const cldrDeWindows: StartKeyboard = {
  id: "cldr_de",
  path: "cldr/windows/de-t-k0-windows.xml",
  script: "Latn",
  targets: ["windows", "macosx", "linux", "web", "mobile", "tablet"],
  displayName: "German (CLDR Windows)",
  version: "43.1",
  languages: ["de"],
  origin: "cldr",
  cldr: {
    locale: "de",
    variant: "",
    desktopPlatform: "windows",
    desktopFile: "de-t-k0-windows.xml",
    androidFile: "de-t-k0-android.xml",
    tabletFile: "de-t-k0-android-600dpi.xml",
  },
};

function makeMockFetch(
  responses: Record<string, string>,
): { fetchImpl: FetchFn; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: FetchFn = async (url: string) => {
    calls.push(url);
    const body = responses[url];
    if (body === undefined) {
      return {
        ok: false,
        status: 404,
        text: () => Promise.resolve(""),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      };
    }
    return {
      ok: true,
      status: 200,
      text: () => Promise.resolve(body),
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer),
    };
  };
  return { fetchImpl, calls };
}

describe("fetchKeyboardSourceToVfs — CLDR start (#2599)", () => {
  it("writes an emitted .kmn + touch layout for the German start", async () => {
    const { fetchImpl, calls } = makeMockFetch({
      [`${CLDR_BASE}/windows/de-t-k0-windows.xml`]: readFixture("de-t-k0-windows.xml"),
      [`${CLDR_BASE}/android/de-t-k0-android.xml`]: readFixture("de-t-k0-android.xml"),
      // The 600dpi tablet file is not in the fixtures; serve the phone file
      // for it — the loader only needs well-formed Android XML here.
      [`${CLDR_BASE}/android/de-t-k0-android-600dpi.xml`]: readFixture("de-t-k0-android.xml"),
    });
    const vfs = createVirtualFS([]);
    const result = await fetchKeyboardSourceToVfs(cldrDeWindows, vfs, {
      proxyBase: PROXY,
      fetchImpl,
    });
    expect(calls).toContain(`${CLDR_BASE}/windows/de-t-k0-windows.xml`);
    expect(result.filesLoaded).toContain("source/cldr_de.kmn");
    expect(result.filesLoaded).toContain(
      "source/cldr_de.keyman-touch-layout",
    );
    expect(result.fonts).toEqual([]);
    expect(result.stylesheets).toEqual([]);

    const kmn = vfs.get("source/cldr_de.kmn")?.content;
    expect(typeof kmn).toBe("string");
    // The emitted KMN parses back to the imported rules.
    const parsed = parse(kmn as string, "cldr_de");
    const main = parsed.ir.groups.find((g) => g.name === "main");
    expect(main).toBeDefined();
    expect(main?.rules.length).toBeGreaterThan(100);
    const touchJson = vfs.get(
      "source/cldr_de.keyman-touch-layout",
    )?.content as string;
    const touch = JSON.parse(touchJson) as Record<string, unknown>;
    expect(Object.keys(touch).sort()).toEqual(["phone", "tablet"]);
  });

  it("throws when a required CLDR file 404s", async () => {
    const { fetchImpl } = makeMockFetch({});
    const vfs = createVirtualFS([]);
    await expect(
      fetchKeyboardSourceToVfs(cldrDeWindows, vfs, {
        proxyBase: PROXY,
        fetchImpl,
      }),
    ).rejects.toThrow(/required CLDR file not found/);
  });

  it("derives the desktop half from the Android file for Android-only locales", async () => {
    const af: StartKeyboard = {
      id: "cldr_af",
      path: "cldr/android/af-t-k0-android.xml",
      script: "Latn",
      targets: ["web", "mobile", "tablet"],
      displayName: "Afrikaans (CLDR Android)",
      version: "43.1",
      languages: ["af"],
      origin: "cldr",
      cldr: {
        locale: "af",
        variant: "",
        androidFile: "af-t-k0-android.xml",
      },
    };
    const { fetchImpl } = makeMockFetch({
      [`${CLDR_BASE}/android/af-t-k0-android.xml`]: readFixture("af-t-k0-android.xml"),
    });
    const vfs = createVirtualFS([]);
    const result = await fetchKeyboardSourceToVfs(af, vfs, {
      proxyBase: PROXY,
      fetchImpl,
    });
    expect(result.filesLoaded).toContain("source/cldr_af.kmn");
    expect(result.filesLoaded).toContain("source/cldr_af.keyman-touch-layout");
    const kmn = vfs.get("source/cldr_af.kmn")?.content as string;
    // No RALT rules: the Android opt layers stayed touch-only.
    expect(kmn).not.toContain("RALT");
    expect(kmn).toContain("[NCAPS K_Q]");
  });
});
