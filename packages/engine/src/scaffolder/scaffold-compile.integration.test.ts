/**
 * Integration: scaffold → compile pipeline (issue #32, P1 gap).
 *
 * Closes the previously-untested path where createScaffolderService().scaffold()
 * produces a VirtualFS that is then fed directly into compile(). Two cases:
 *
 *   Case A — real base (fetch OK): scaffolder receives a valid KMN response and
 *     transforms it; the resulting VFS must compile with no fatal/error diagnostics.
 *
 *   Case B — 404 stub path: scaffolder receives 404 for all fetch URLs and falls
 *     back to generating a header-only stub .kmn; that stub must also compile
 *     cleanly (no fatal/error diagnostics) and produce at least one artifact.
 *
 * Both cases use the same fetch-mock/fixture approach as scaffolder.test.ts.
 */

import { describe, it, expect, vi } from "vitest";
import { createScaffolderService } from "./index.js";
import { compile } from "../compiler/index.js";
import type { BaseKeyboard } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Minimal compilable KMN — mirrors the minimal.kmn fixture used in
// compile.test.ts but inlined so this file is self-contained.
// ---------------------------------------------------------------------------

const COMPILABLE_KMN = `store(&NAME) 'Integration Base'
store(&VERSION) '14.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'a'
+ [K_B] > 'b'
`;

const BASE_KEYBOARD: BaseKeyboard = {
  id: "integration_base",
  path: "release/i/integration_base",
  script: "Latn",
  targets: ["web"],
  displayName: "Integration Base",
  version: "14.0",
};

// ---------------------------------------------------------------------------
// fetch-mock helpers (same pattern as scaffolder.test.ts)
// ---------------------------------------------------------------------------

function makeTextResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () => text,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
    json: async () => JSON.parse(text),
    headers: new Headers(),
    redirected: false,
    statusText: "OK",
    type: "basic" as ResponseType,
    url: "",
    clone: function () { return this as unknown as Response; },
    body: null,
    bodyUsed: false,
    blob: async () => new Blob([text]),
    formData: async () => new FormData(),
    bytes: async () => new TextEncoder().encode(text),
  } as unknown as Response;
}

function makeNotFoundResponse(): Response {
  return {
    ok: false,
    status: 404,
    text: async () => "Not Found",
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Case A — scaffold from a base that fetches OK → compile
// ---------------------------------------------------------------------------

describe("scaffold→compile integration: fetch-OK base (Case A)", () => {
  it("scaffold produces a VirtualFS with a compilable .kmn", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(COMPILABLE_KMN));
      return Promise.resolve(makeNotFoundResponse());
    });

    const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
    const { vfs, warnings } = await service.scaffold(
      BASE_KEYBOARD,
      "my_integration_kb",
      "My Integration Keyboard",
    );

    // Scaffolding itself must succeed with no warnings for an OK fetch.
    expect(warnings).toEqual([]);
    expect(vfs.get("source/my_integration_kb.kmn")).toBeDefined();
  }, 10_000);

  it("compiled output from a scaffolded fetch-OK VFS has no fatal or error diagnostics", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(COMPILABLE_KMN));
      return Promise.resolve(makeNotFoundResponse());
    });

    const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
    const { vfs } = await service.scaffold(
      BASE_KEYBOARD,
      "my_integration_kb",
      "My Integration Keyboard",
    );

    const result = await compile(vfs, "my_integration_kb");

    const blocking = result.diagnostics.filter(
      (d) => d.severity === "fatal" || d.severity === "error",
    );
    expect(
      blocking,
      `Fatal/error diagnostics: ${blocking.map((d) => `[${d.severity}] ${d.message}`).join("; ")}`,
    ).toEqual([]);
  }, 30_000);

  it("compile of a scaffolded fetch-OK VFS produces at least one artifact", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(COMPILABLE_KMN));
      return Promise.resolve(makeNotFoundResponse());
    });

    const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
    const { vfs } = await service.scaffold(
      BASE_KEYBOARD,
      "my_integration_kb",
      "My Integration Keyboard",
    );

    const result = await compile(vfs, "my_integration_kb");

    // When compile succeeds we expect at least a .kmx.
    expect(result.artifacts.length).toBeGreaterThan(0);
    const kmxArtifact = result.artifacts.find((a) => a.filename.endsWith(".kmx"));
    expect(kmxArtifact, "expected a .kmx artifact in compile result").toBeDefined();
    expect(kmxArtifact!.sizeBytes).toBeGreaterThan(0);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Case B — scaffold with 404 (stub-only .kmn path) → compile
//
// This is the previously-unverified path: when the base .kmn is unreachable
// the scaffolder emits a header-only stub. The stub must still pass through
// compile() without fatal/error-severity diagnostics and produce a usable
// artifact. A header-only keyboard with no rules is a valid (if trivial) KMN.
// ---------------------------------------------------------------------------

describe("scaffold→compile integration: 404 stub path (Case B)", () => {
  it("scaffold with 404 base still produces a source/stub.kmn", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeNotFoundResponse());
    const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });

    const { vfs, warnings } = await service.scaffold(
      BASE_KEYBOARD,
      "stub_kb",
      "Stub Keyboard",
    );

    expect(vfs.get("source/stub_kb.kmn")).toBeDefined();
    // The 404 path must surface exactly one warning naming the cause.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/base keyboard source unavailable/);
  }, 10_000);

  it("stub .kmn from 404 path has a valid header (NAME, TARGETS, begin Unicode)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeNotFoundResponse());
    const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });

    const { vfs } = await service.scaffold(BASE_KEYBOARD, "stub_kb", "Stub Keyboard");

    const content = vfs.get("source/stub_kb.kmn")!.content as string;
    expect(content).toContain("store(&NAME)");
    expect(content).toContain("store(&TARGETS)");
    expect(content).toContain("begin Unicode");
    expect(content).toContain("group(main) using keys");
  }, 10_000);

  it("compile of a 404-stub VFS has no fatal or error diagnostics", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeNotFoundResponse());
    const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });

    const { vfs } = await service.scaffold(BASE_KEYBOARD, "stub_kb", "Stub Keyboard");

    const result = await compile(vfs, "stub_kb");

    const blocking = result.diagnostics.filter(
      (d) => d.severity === "fatal" || d.severity === "error",
    );
    expect(
      blocking,
      `Fatal/error diagnostics on stub: ${blocking.map((d) => `[${d.severity}] ${d.message}`).join("; ")}`,
    ).toEqual([]);
  }, 30_000);

  it("compile of a 404-stub VFS produces a usable artifact (.kmx)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeNotFoundResponse());
    const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });

    const { vfs } = await service.scaffold(BASE_KEYBOARD, "stub_kb", "Stub Keyboard");

    const result = await compile(vfs, "stub_kb");

    // A header-only stub must still compile to a valid (if empty) .kmx.
    const kmxArtifact = result.artifacts.find((a) => a.filename.endsWith(".kmx"));
    expect(
      kmxArtifact,
      "expected a .kmx artifact even from a zero-rules stub keyboard",
    ).toBeDefined();
    expect(kmxArtifact!.sizeBytes).toBeGreaterThan(0);
  }, 30_000);
});
