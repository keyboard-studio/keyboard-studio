// fetchBaseHistoryMd (criterion 3.4's base-commit lookup): UTF-8 decoding,
// 404 as "absent", and every other failure as "failed" (never a pass).

import { afterEach, describe, expect, it, vi } from "vitest";

import { decodeBase64Utf8, fetchBaseHistoryMd } from "./useReviewIndex.ts";

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  // GitHub wraps base64 at 60 columns with newlines.
  return btoa(bin).replace(/(.{60})/g, "$1\n");
}

function stubFetch(contents: { status: number; body?: unknown } | "throw") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/pulls/") && url.includes("/files")) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url.includes("/pulls/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ body: "", base: { sha: "basesha" } }),
        };
      }
      if (contents === "throw") throw new Error("network");
      return {
        ok: contents.status >= 200 && contents.status < 300,
        status: contents.status,
        json: async () => contents.body,
      };
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("decodeBase64Utf8", () => {
  it("decodes multi-byte UTF-8 that atob alone would mangle", () => {
    const text = "1.0 (2026-01-01)\n* Ibibio ọ́ éè – done\n";
    expect(decodeBase64Utf8(b64(text))).toBe(text);
    expect(atob(b64(text))).not.toBe(text);
  });
});

describe("fetchBaseHistoryMd", () => {
  it("returns the decoded text on success", async () => {
    stubFetch({
      status: 200,
      body: { encoding: "base64", content: b64("## 1.0 (2026-01-01)\n* café\n") },
    });
    const r = await fetchBaseHistoryMd("o", "r", 9001, "release/a/b/HISTORY.md");
    expect(r).toEqual({ kind: "text", text: "## 1.0 (2026-01-01)\n* café\n" });
  });

  it("a 404 is absent: the base had no HISTORY.md", async () => {
    stubFetch({ status: 404 });
    expect(await fetchBaseHistoryMd("o", "r", 9002, "release/a/b/HISTORY.md")).toEqual({
      kind: "absent",
    });
  });

  it("an API error, a thrown fetch, or an unexpected body is failed, never absent or text", async () => {
    stubFetch({ status: 500 });
    expect(await fetchBaseHistoryMd("o", "r", 9003, "release/a/b/HISTORY.md")).toEqual({
      kind: "failed",
    });
    stubFetch("throw");
    expect(await fetchBaseHistoryMd("o", "r", 9004, "release/a/b/HISTORY.md")).toEqual({
      kind: "failed",
    });
    stubFetch({ status: 200, body: { encoding: "none", content: "x" } });
    expect(await fetchBaseHistoryMd("o", "r", 9005, "release/a/b/HISTORY.md")).toEqual({
      kind: "failed",
    });
  });
});
