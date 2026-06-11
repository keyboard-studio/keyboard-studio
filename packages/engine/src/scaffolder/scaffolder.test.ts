import { describe, it, expect, vi } from "vitest";
import { createScaffolderService, scaffoldIR } from "./index.js";
import { runAllChecks } from "../validator/index.js";
import { parse, emit } from "../codec/index.js";
import type { BaseKeyboard } from "@keyboard-studio/contracts";

const BASE_KMN = `store(&NAME) 'Base Keyboard'
store(&COPYRIGHT) 'Copyright © 2020 Base Author'
store(&VERSION) '5.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'
NCAPS + [CAPS K_A] > 'a'
+ [K_A] > 'A'
begin Unicode > use(main)
group(main) using keys
+ [K_B] > 'b'
`;

const baseKeyboard: BaseKeyboard = {
  id: "base_keyboard",
  path: "release/b/base_keyboard",
  script: "Latn",
  targets: ["web"],
  displayName: "Base Keyboard",
  version: "5.0",
};

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
    type: "basic",
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

describe("createScaffolderService", () => {
  describe("validateKeyboardId", () => {
    const service = createScaffolderService();

    it("returns null for valid ids", () => {
      expect(service.validateKeyboardId("my_keyboard")).toBeNull();
      expect(service.validateKeyboardId("abc")).toBeNull();
      expect(service.validateKeyboardId("k_123")).toBeNull();
    });

    it("rejects empty id", () => {
      expect(service.validateKeyboardId("")).toBe("keyboard id cannot be empty");
    });

    it("rejects id over 255 chars", () => {
      expect(service.validateKeyboardId("a".repeat(256))).toBe(
        "keyboard id is longer than 255 characters"
      );
    });

    it("rejects id with space", () => {
      const result = service.validateKeyboardId("my keyboard");
      expect(result).toMatch(/disallowed character/);
    });

    it("rejects id with parens", () => {
      const result = service.validateKeyboardId("my(keyboard)");
      expect(result).toMatch(/disallowed character/);
    });

    it("rejects id with brackets", () => {
      const result = service.validateKeyboardId("my[keyboard]");
      expect(result).toMatch(/disallowed character/);
    });

    it("rejects id with comma", () => {
      const result = service.validateKeyboardId("my,keyboard");
      expect(result).toMatch(/disallowed character/);
    });
  });

  describe("listTemplates", () => {
    it("returns the three routing groups", async () => {
      const service = createScaffolderService();
      const templates = await service.listTemplates();
      expect(templates).toEqual(["qwerty-qwertz", "azerty", "non-roman"]);
    });
  });

  describe("scaffold with mocked fetch", () => {
    it("strips NCAPS, removes [CAPS lines, inserts &CasedKeys for qwerty group", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(BASE_KMN));
        return Promise.resolve(makeNotFoundResponse());
      });

      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
      const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");

      const kmnEntry = vfs.get("source/my_keyboard.kmn");
      expect(kmnEntry).toBeDefined();
      const content = kmnEntry!.content as string;

      expect(content).not.toContain("NCAPS ");
      expect(content).not.toContain("[CAPS");
      expect(content).toContain("store(&CasedKeys) [K_A]..[K_Z]");
    });

    it("rewrites metadata stores", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(BASE_KMN));
        return Promise.resolve(makeNotFoundResponse());
      });

      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
      const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");

      const kmnEntry = vfs.get("source/my_keyboard.kmn");
      const content = kmnEntry!.content as string;

      expect(content).toContain("store(&NAME) 'My Keyboard'");
      expect(content).toMatch(/store\(&COPYRIGHT\) 'Copyright © \d{4} My Keyboard'/);
      expect(content).toContain("store(&VERSION) '1.0'");
      expect(content).toContain("store(&KEYBOARDVERSION) '1.0'");
    });

    it("generates all required §12 paths", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(BASE_KMN));
        return Promise.resolve(makeNotFoundResponse());
      });

      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
      const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");

      const requiredPaths = [
        "source/my_keyboard.kmn",
        "source/my_keyboard.kps",
        "source/my_keyboard.kvks",
        "source/my_keyboard.keyman-touch-layout",
        "source/my_keyboard.ico",
        "source/welcome.htm",
        "source/readme.htm",
        "source/help/my_keyboard.php",
        "LICENSE.md",
        "HISTORY.md",
        "README.md",
        "tests/my_keyboard_tests.kmn",
      ];

      for (const path of requiredPaths) {
        expect(vfs.get(path), `missing: ${path}`).toBeDefined();
      }
    });

    it("runAllChecks returns no findings on scaffolded KMN", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(BASE_KMN));
        return Promise.resolve(makeNotFoundResponse());
      });

      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
      const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");

      const kmnEntry = vfs.get("source/my_keyboard.kmn");
      const content = kmnEntry!.content as string;
      const findings = runAllChecks(content);
      expect(findings).toEqual([]);
    });

    it("rejects scaffold with invalid keyboardId", async () => {
      const service = createScaffolderService();
      await expect(
        service.scaffold(baseKeyboard, "bad id", "Bad Keyboard")
      ).rejects.toThrow(/invalid keyboardId/);
    });

    it("falls through gracefully when fetch fails (stub generation)", async () => {
      const mockFetch = vi.fn().mockResolvedValue(makeNotFoundResponse());
      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });

      const { vfs } = await service.scaffold(baseKeyboard, "new_keyboard", "New Keyboard");

      expect(vfs.get("source/new_keyboard.kmn")).toBeDefined();
      expect(vfs.get("LICENSE.md")).toBeDefined();
    });

    it("surfaces a warning when base source is unreachable", async () => {
      const mockFetch = vi.fn().mockResolvedValue(makeNotFoundResponse());
      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });

      const { vfs, warnings } = await service.scaffold(baseKeyboard, "new_keyboard", "New Keyboard");

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/base keyboard source unavailable/);
      expect(vfs.get("source/new_keyboard.kmn")).toBeDefined();
    });

    it("returns empty warnings on successful fetch", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(BASE_KMN));
        return Promise.resolve(makeNotFoundResponse());
      });
      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });

      const { warnings } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");

      expect(warnings).toEqual([]);
    });

    it("uses azerty CasedKeys for azerty group", async () => {
      const kmnWithCaps = `store(&KEYBOARDVERSION) '1.0'\nNCAPStest [CAPS K_A] > 'x'\n+ [K_A] > 'a'\n`;
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(kmnWithCaps));
        return Promise.resolve(makeNotFoundResponse());
      });

      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
      const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard", {
        group: "azerty",
      });

      const kmnEntry = vfs.get("source/my_keyboard.kmn");
      const content = kmnEntry!.content as string;
      expect(content).toContain("store(&CasedKeys) [K_A]..[K_Z] [K_0]..[K_9]");
    });

    it("omits CasedKeys for non-roman group", async () => {
      const kmnWithCaps = `store(&KEYBOARDVERSION) '1.0'\nNCAPStest [CAPS K_A] > 'x'\n+ [K_A] > 'a'\n`;
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(kmnWithCaps));
        return Promise.resolve(makeNotFoundResponse());
      });

      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
      const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard", {
        group: "non-roman",
      });

      const kmnEntry = vfs.get("source/my_keyboard.kmn");
      const content = kmnEntry!.content as string;
      expect(content).not.toContain("store(&CasedKeys)");
    });
  });
});

describe("scaffold — displayName sanitization", () => {
  function makeFetch(kmnContent: string) {
    return vi.fn().mockImplementation((url: string) => {
      if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(kmnContent));
      return Promise.resolve(makeNotFoundResponse());
    });
  }

  it("escapes single quote in KMN store(&NAME) with typographic apostrophe", async () => {
    const service = createScaffolderService({ fetchImpl: makeFetch(BASE_KMN) as typeof fetch });
    const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "O'Brien's Keyboard");
    const content = vfs.get("source/my_keyboard.kmn")!.content as string;
    expect(content).toContain("store(&NAME) 'O’Brien’s Keyboard'");
    expect(content).not.toContain("store(&NAME) 'O'Brien");
  });

  it("escapes single quote in store(&COPYRIGHT)", async () => {
    const service = createScaffolderService({ fetchImpl: makeFetch(BASE_KMN) as typeof fetch });
    const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "O'Brien's Keyboard");
    const content = vfs.get("source/my_keyboard.kmn")!.content as string;
    expect(content).toMatch(/store\(&COPYRIGHT\) 'Copyright © \d{4} O’Brien’s Keyboard'/);
  });

  it("escapes single quote in stub .kmn store(&NAME)", async () => {
    // All fetches return 404 → stub generation path is exercised.
    const notFoundFetch = vi.fn().mockResolvedValue(makeNotFoundResponse());
    const service = createScaffolderService({ fetchImpl: notFoundFetch as typeof fetch });
    // U+0027 straight apostrophe in input; expect U+2019 right single quotation mark in output.
    const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "O'Brien's Keyboard");
    const content = vfs.get("source/my_keyboard.kmn")!.content as string;
    expect(content).toContain("store(&NAME) 'O’Brien’s Keyboard'");
  });

  it("HTML-escapes < > & in welcome.htm", async () => {
    const service = createScaffolderService({ fetchImpl: makeFetch(BASE_KMN) as typeof fetch });
    const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "<script>alert('xss')</script>");
    const content = vfs.get("source/welcome.htm")!.content as string;
    expect(content).not.toContain("<script>");
    expect(content).toContain("&lt;script&gt;");
  });

  it("HTML-escapes & in readme.htm", async () => {
    const service = createScaffolderService({ fetchImpl: makeFetch(BASE_KMN) as typeof fetch });
    const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "Foo & Bar");
    const content = vfs.get("source/readme.htm")!.content as string;
    expect(content).toContain("Foo &amp; Bar keyboard");
  });

  it("defuses */ in PHP block comment", async () => {
    const service = createScaffolderService({ fetchImpl: makeFetch(BASE_KMN) as typeof fetch });
    const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard */ eval('bad')");
    const content = vfs.get("source/help/my_keyboard.php")!.content as string;
    // The injected '*/' must be defused; the template's own closing '*/' is still present.
    expect(content).toContain("My Keyboard * / eval");
    expect(content).not.toContain("My Keyboard */");
  });

  it("strips newlines from displayName (prevents KMN line injection)", async () => {
    const service = createScaffolderService({ fetchImpl: makeFetch(BASE_KMN) as typeof fetch });
    const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My\nKeyboard\nInjected");
    const kmnContent = vfs.get("source/my_keyboard.kmn")!.content as string;
    const nameLines = kmnContent.split("\n").filter((l) => l.startsWith("store(&NAME)"));
    expect(nameLines).toHaveLength(1);
    expect(nameLines[0]).toContain("My Keyboard Injected");
  });

  it("strips null bytes and control characters", async () => {
    const service = createScaffolderService({ fetchImpl: makeFetch(BASE_KMN) as typeof fetch });
    const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My\x00Keyboard\x01Name");
    const content = vfs.get("source/my_keyboard.kmn")!.content as string;
    expect(content).not.toContain("\x00");
    expect(content).not.toContain("\x01");
    expect(content).toContain("My Keyboard Name");
  });
});

describe("scaffold — additional coverage", () => {
  it("accepts id of exactly 255 characters", () => {
    const service = createScaffolderService();
    expect(service.validateKeyboardId("a".repeat(255))).toBeNull();
  });

  it("removes the base id path after renaming to keyboardId", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(BASE_KMN));
      return Promise.resolve(makeNotFoundResponse());
    });
    const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
    const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");
    expect(vfs.get("source/base_keyboard.kmn")).toBeUndefined();
    expect(vfs.get("source/my_keyboard.kmn")).toBeDefined();
  });

  it("does not insert a second store(&CasedKeys) when base already has one", async () => {
    const kmnWithExisting = BASE_KMN + "store(&CasedKeys) [K_A]..[K_Z]\n";
    const mockFetch = vi.fn().mockResolvedValue(makeTextResponse(kmnWithExisting));
    const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
    const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");
    const content = vfs.get("source/my_keyboard.kmn")!.content as string;
    // emit() normalizes system-store names to uppercase (parseStoreLine uppercases them),
    // so &CasedKeys from the base .kmn appears as &CASEDKEYS in canonical emit; use
    // case-insensitive match to check idempotency (exactly one store, not two).
    const count = (content.match(/store\(&casedkeys\)/gi) ?? []).length;
    expect(count).toBe(1);
  });

  it("auto-detects non-roman for non-Latn script", async () => {
    const nonLatnBase = { ...baseKeyboard, script: "Deva" };
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(BASE_KMN));
      return Promise.resolve(makeNotFoundResponse());
    });
    const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
    const { vfs } = await service.scaffold(nonLatnBase, "my_keyboard", "My Keyboard");
    const content = vfs.get("source/my_keyboard.kmn")!.content as string;
    expect(content).not.toContain("store(&CasedKeys)");
  });

  it("removes phone layer, duplicates shift as caps, defaults nextlayer on regular keys", async () => {
    const touchLayout = JSON.stringify({
      phone: { layer: [{ id: "default", row: [] }] },
      tablet: {
        layer: [
          { id: "default", row: [{ key: [{ id: "K_A", text: "a" }] }] },
          { id: "shift", row: [{ key: [{ id: "K_A", text: "A" }] }] },
        ],
      },
    });
    const kmnWithLayout = `store(&NAME) 'Base Keyboard'
store(&KEYBOARDVERSION) '1.0'
store(&LAYOUTFILE) 'base_keyboard.keyman-touch-layout'
NCAPS + [CAPS K_A] > 'a'
+ [K_A] > 'A'
begin Unicode > use(main)
group(main) using keys
+ [K_B] > 'b'
`;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(".keyman-touch-layout")) return Promise.resolve(makeTextResponse(touchLayout));
      if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(kmnWithLayout));
      return Promise.resolve(makeNotFoundResponse());
    });
    const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
    const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");

    const entry = vfs.get("source/my_keyboard.keyman-touch-layout");
    expect(entry).toBeDefined();
    const data = JSON.parse(entry!.content as string) as {
      phone?: unknown;
      tablet: { layer: Array<{ id: string; row: Array<{ key: Array<{ id?: string; nextlayer?: string }> }> }> };
    };

    expect(data.phone).toBeUndefined();

    const capsLayer = data.tablet.layer.find((l) => l.id === "caps");
    expect(capsLayer).toBeDefined();

    const shiftLayer = data.tablet.layer.find((l) => l.id === "shift");
    const shiftKey = shiftLayer!.row[0].key[0];
    expect(shiftKey.nextlayer).toBe("default");
  });
});

// ---------------------------------------------------------------------------
// AC integration (scaffold-over-IR)
// ---------------------------------------------------------------------------

/** A mock base .kmn that includes NCAPS + [CAPS ...] rules so the hasCaps gate fires. */
const INTEGRATION_BASE_KMN = `store(&NAME) 'Base Keyboard'
store(&COPYRIGHT) 'Copyright © 2020 Base Author'
store(&VERSION) '5.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'
begin Unicode > use(main)
group(main) using keys
NCAPS + [CAPS K_A] > 'A'
+ [K_A] > 'a'
`;

describe("scaffold — AC integration (scaffold-over-IR)", () => {
  it("(a) emitted .kmn contains store(&NAME) with the display name", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(INTEGRATION_BASE_KMN));
      return Promise.resolve(makeNotFoundResponse());
    });
    const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
    const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");
    const content = vfs.get("source/my_keyboard.kmn")!.content as string;
    // Canonical emit form: store(&NAME) '<displayName>' where chars are emitted as char-run
    expect(content).toContain("store(&NAME) 'My Keyboard'");
  });

  it("(b) no NCAPS substring remains in the emitted .kmn", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(INTEGRATION_BASE_KMN));
      return Promise.resolve(makeNotFoundResponse());
    });
    const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
    const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");
    const content = vfs.get("source/my_keyboard.kmn")!.content as string;
    expect(content).not.toContain("NCAPS");
  });

  it("(c) store(&CasedKeys) present with [K_A]..[K_Z] for qwerty group", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(INTEGRATION_BASE_KMN));
      return Promise.resolve(makeNotFoundResponse());
    });
    const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
    const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");
    const content = vfs.get("source/my_keyboard.kmn")!.content as string;
    expect(content).toContain("store(&CasedKeys) [K_A]..[K_Z]");
  });

  it("(d) header.keyboardId is reset on the output IR (via scaffoldIR directly)", () => {
    const ir = parse(INTEGRATION_BASE_KMN, "base_keyboard").ir;
    const outIr = scaffoldIR(ir, "new_id", "New Name", { group: "qwerty-qwertz" });
    expect(outIr.header.keyboardId).toBe("new_id");
  });

  it("(e) scaffoldIR is a pure function — input IR is not mutated", () => {
    const ir = parse(INTEGRATION_BASE_KMN, "base_keyboard").ir;
    const originalRuleCount = ir.groups[0]?.rules.length ?? 0;
    scaffoldIR(ir, "new_id", "New Name", { group: "qwerty-qwertz" });
    expect(ir.groups[0]?.rules.length ?? 0).toBe(originalRuleCount);
  });

  it("(f) parse -> scaffoldIR -> emit round-trip produces valid KMN (no validator findings)", () => {
    const ir = parse(INTEGRATION_BASE_KMN, "base_keyboard").ir;
    const outIr = scaffoldIR(ir, "my_keyboard", "My Keyboard", { group: "qwerty-qwertz" });
    const kmn = emit(outIr);
    const findings = runAllChecks(kmn);
    expect(findings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// scaffoldIR — raw-fragment CAPS/NCAPS cleanup (focused unit)
// ---------------------------------------------------------------------------

describe("scaffoldIR — raw-fragment CAPS/NCAPS branch", () => {
  /**
   * Build a minimal KeyboardIR with empty groups but a `raw` array containing
   * two RawKmnFragment entries: one with [CAPS (should be dropped) and one
   * with NCAPS  (should have the modifier stripped, fragment kept).
   */
  function makeIrWithRawFragments(): ReturnType<typeof parse>["ir"] {
    // Parse a minimal KMN so we get a well-formed IR to clone from.
    const base = parse(
      "store(&NAME) 'Test'\nstore(&KEYBOARDVERSION) '1.0'\nbegin Unicode > use(main)\ngroup(main) using keys\n",
      "test_raw"
    ).ir;

    const capsFragment = {
      nodeId: "raw-caps",
      origin: "imported" as const,
      sourceText: "NCAPS + [CAPS K_A] > 'x'",
      reason: "indexed context(n)",
    };
    const ncapsFragment = {
      nodeId: "raw-ncaps",
      origin: "imported" as const,
      sourceText: "NCAPS + [K_B] > 'y'",
      reason: "indexed context(n)",
    };

    return { ...base, raw: [capsFragment, ncapsFragment] };
  }

  it("(a) removes raw fragments whose sourceText contains [CAPS", () => {
    const ir = makeIrWithRawFragments();
    const out = scaffoldIR(ir, "test_id", "Test Name", { group: "qwerty-qwertz" });
    const hasCapsFragment = out.raw.some((f) => f.sourceText.includes("[CAPS"));
    expect(hasCapsFragment).toBe(false);
  });

  it("(b) strips NCAPS  prefix from surviving raw fragments", () => {
    const ir = makeIrWithRawFragments();
    const out = scaffoldIR(ir, "test_id", "Test Name", { group: "qwerty-qwertz" });
    // The [CAPS fragment is removed; the NCAPS-only fragment survives with the modifier stripped.
    const survivingFragment = out.raw.find((f) => f.nodeId === "raw-ncaps");
    expect(survivingFragment).toBeDefined();
    expect(survivingFragment!.sourceText).not.toContain("NCAPS ");
    expect(survivingFragment!.sourceText).toContain("[K_B] > 'y'");
  });

  it("(c) does not mutate the input IR in place (referential check on raw array)", () => {
    const ir = makeIrWithRawFragments();
    const originalRaw = ir.raw;
    const originalFragment0 = ir.raw[0];
    scaffoldIR(ir, "test_id", "Test Name", { group: "qwerty-qwertz" });
    // Input raw array reference must be unchanged
    expect(ir.raw).toBe(originalRaw);
    expect(ir.raw[0]).toBe(originalFragment0);
    // Original sourceText must not have been modified
    expect(ir.raw[0]!.sourceText).toBe("NCAPS + [CAPS K_A] > 'x'");
  });
});
