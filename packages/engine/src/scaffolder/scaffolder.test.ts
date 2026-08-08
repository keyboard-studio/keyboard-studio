import { describe, it, expect, vi } from "vitest";
import { createScaffolderService, renameFilesInVfs } from "./index.js";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { runAllChecks } from "../validator/index.js";
import type { BaseKeyboard } from "@keyboard-studio/contracts";

const BASE_KMN = `store(&NAME) 'Base Keyboard'
store(&COPYRIGHT) 'Copyright © 2020 Base Author'
store(&VERSION) '5.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'
begin Unicode > use(main)
group(main) using keys
+ [CAPS K_A] > 'a'
+ [K_A] > 'A'
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

/** Binary (non-UTF8-decodable) response, for the icon / font siblings. */
function makeBytesResponse(bytes: Uint8Array): Response {
  return {
    ok: true,
    status: 200,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
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
      // spec 059 SC-001: was `Copyright © <year> My Keyboard`, which named the
      // keyboard as rights holder and discarded the base's real notice.
      expect(content).toContain("store(&COPYRIGHT) 'Copyright © 2020 Base Author'");
      // Scope the negative to the COPYRIGHT store — store(&NAME) legitimately
      // contains the display name.
      const copyrightStore = /store\(&COPYRIGHT\) '([^']*)'/.exec(content)?.[1] ?? "";
      expect(copyrightStore).not.toContain("My Keyboard");
      // &VERSION is the KMN file-format version — always 14.0 (minimum for &CasedKeys).
      expect(content).toContain("store(&VERSION) '14.0'");
      // &KEYBOARDVERSION is the human-visible release version — defaults to "1.0".
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

    // `source/<id>.ico` is in the spec §12 layout, but only a real icon belongs
    // there. A zero-byte placeholder is indistinguishable from a missing icon to
    // kmcmplib — it warns "Cannot open the bitmap or icon file for reading" and
    // then emits ZERO artifacts — so an empty stub turned "this base has no icon"
    // into a keyboard that silently compiles to nothing.
    it("fabricates no icon when the base has none, and drops the &BITMAP reference", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(BASE_KMN));
        return Promise.resolve(makeNotFoundResponse());
      });

      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
      const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");

      expect(vfs.get("source/my_keyboard.ico")).toBeUndefined();
      expect(vfs.get("source/my_keyboard.kmn")!.content as string).not.toMatch(/&BITMAP/i);
    });

    it("carries the base's icon over as binary bytes and keeps its &BITMAP reference", async () => {
      // A recognizable non-UTF8 byte run: a lone 0x80..0x8F sequence is invalid
      // UTF-8, so a text round-trip would replace it with U+FFFD and the assertion
      // on exact bytes would fail.
      const iconBytes = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x80, 0x81, 0xff, 0xfe]);
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("base_keyboard.ico")) return Promise.resolve(makeBytesResponse(iconBytes));
        if (url.includes(".kmn")) {
          return Promise.resolve(
            makeTextResponse(`store(&BITMAP) 'base_keyboard.ico'\n${BASE_KMN}`),
          );
        }
        return Promise.resolve(makeNotFoundResponse());
      });

      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
      const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");

      // Renamed to the new id (the base's icon basename matched the base id), so
      // the &BITMAP reference must follow it.
      const ico = vfs.get("source/my_keyboard.ico");
      expect(ico).toBeDefined();
      expect(ico!.content).toBeInstanceOf(Uint8Array);
      expect(Array.from(ico!.content as Uint8Array)).toEqual(Array.from(iconBytes));
      // isBinary must be set, not left at VirtualFS.set's false default: the draft
      // snapshot and the zip both read this flag.
      expect(ico!.isBinary).toBe(true);
      expect(vfs.get("source/my_keyboard.kmn")!.content as string).toContain(
        "store(&BITMAP) 'my_keyboard.ico'",
      );
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

      expect(vfs.get("source/new_keyboard.kmn")?.content).toContain("begin Unicode > use(main)");
      expect(vfs.get("LICENSE.md")?.content).toContain("MIT License");
    });

    it("surfaces a warning when base source is unreachable", async () => {
      const mockFetch = vi.fn().mockResolvedValue(makeNotFoundResponse());
      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });

      const { vfs, warnings } = await service.scaffold(baseKeyboard, "new_keyboard", "New Keyboard");

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/base keyboard source unavailable/);
      expect(vfs.get("source/new_keyboard.kmn")?.content).toContain("begin Unicode > use(main)");
    });

    it("returns no scaffolder-level warnings on successful .kmn fetch (loader optional-file warnings are forwarded)", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(BASE_KMN));
        return Promise.resolve(makeNotFoundResponse());
      });
      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });

      const { warnings } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");

      // The scaffolder itself adds no warnings; loader optional-file misses (.kps, .kpj)
      // are forwarded and are non-fatal.
      expect(warnings.every((w) => w.includes("not found"))).toBe(true);
    });

    it("uses azerty CasedKeys for azerty group", async () => {
      const kmnWithCaps = `store(&KEYBOARDVERSION) '1.0'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [CAPS K_A] > 'x'\n+ [K_A] > 'a'\n`;
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

    it("structurally detects an AZERTY base whose id lacks an azerty/fr token (regression: #384)", async () => {
      // base_keyboard's id has no "azerty"/"fr*" token, so the id-string
      // heuristic alone would route it to qwerty-qwertz. The NCAPS base row is
      // structurally AZERTY (K_Q->a, K_A->q, K_Z->w) and must win.
      const azertyKmn = `store(&KEYBOARDVERSION) '1.0'
begin Unicode > use(main)
group(main) using keys
+ [NCAPS K_Q] > 'a'
+ [CAPS K_Q] > 'A'
+ [NCAPS K_A] > 'q'
+ [CAPS K_A] > 'Q'
+ [NCAPS K_Z] > 'w'
+ [CAPS K_Z] > 'W'
`;
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(azertyKmn));
        return Promise.resolve(makeNotFoundResponse());
      });

      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
      // No explicit group passed — relies on structural detection.
      const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");

      const content = vfs.get("source/my_keyboard.kmn")!.content as string;
      // Extended AZERTY CasedKeys range (includes [K_0]..[K_9]) proves group=azerty.
      expect(content).toContain("store(&CasedKeys) [K_A]..[K_Z] [K_0]..[K_9]");
    });

    it("explicit scaffoldOpts.group overrides structural detection", async () => {
      // Same AZERTY base, but caller forces qwerty-qwertz — the override wins.
      const azertyKmn = `store(&KEYBOARDVERSION) '1.0'
begin Unicode > use(main)
group(main) using keys
+ [NCAPS K_Q] > 'a'
+ [NCAPS K_A] > 'q'
+ [NCAPS K_Z] > 'w'
`;
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(azertyKmn));
        return Promise.resolve(makeNotFoundResponse());
      });

      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
      const { vfs } = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard", {
        group: "qwerty-qwertz",
      });

      const content = vfs.get("source/my_keyboard.kmn")!.content as string;
      expect(content).toContain("store(&CasedKeys) [K_A]..[K_Z]");
      expect(content).not.toContain("[K_0]..[K_9]");
    });

    it("omits CasedKeys for non-roman group", async () => {
      const kmnWithCaps = `store(&KEYBOARDVERSION) '1.0'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [CAPS K_A] > 'x'\n+ [K_A] > 'a'\n`;
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
    // spec 059 SC-001: the display name is no longer used as the holder, so the
    // base's notice survives. Display-name ESCAPING is still covered by the
    // &NAME assertion in this same test.
    expect(content).toContain("store(&COPYRIGHT) 'Copyright © 2020 Base Author'");
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

describe("renameFilesInVfs — CSS selector rewriting", () => {
  it("rewrites .kmw-keyboard-<baseId> selectors in .css files and renames the file", () => {
    const vfs = createVirtualFS();
    // One matching selector; one near-miss that shares the base prefix but has
    // extra alphanumerics (word-boundary anchor must prevent rewriting it).
    const css = `.kmw-keyboard-sil_cameroon_qwerty { color: red; }\n.kmw-keyboard-sil_cameroon_qwerty_extra { color: blue; }\n`;
    vfs.set("source/sil_cameroon_qwerty.css", css);

    renameFilesInVfs(vfs, "sil_cameroon_qwerty", "my_new_keyboard");

    // The id-named .css file is now at the new path; the old path is gone.
    expect(vfs.get("source/sil_cameroon_qwerty.css")).toBeUndefined();
    const entry = vfs.get("source/my_new_keyboard.css");
    expect(entry).toBeDefined();
    const out = entry!.content as string;
    // Exact match replaced.
    expect(out).toContain(".kmw-keyboard-my_new_keyboard {");
    // Near-miss NOT replaced (word boundary prevents it).
    expect(out).toContain(".kmw-keyboard-sil_cameroon_qwerty_extra {");
    // Old exact selector must be gone.
    expect(out).not.toContain(".kmw-keyboard-sil_cameroon_qwerty {");
  });

  it("does not modify non-.css entries", () => {
    const vfs = createVirtualFS();
    const kmnContent = `c contains kmw-keyboard-base_id text\n`;
    vfs.set("source/base_id.kmn", kmnContent);

    renameFilesInVfs(vfs, "base_id", "new_id");

    // The .kmn file path was renamed but its CSS-selector content is untouched
    // by the CSS-rewriting step (only *.css entries are rewritten).
    const entry = vfs.get("source/new_id.kmn");
    expect(entry).toBeDefined();
    expect(entry!.content as string).toContain("kmw-keyboard-base_id");
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
    const count = (content.match(/store\(&CasedKeys\)/gi) ?? []).length;
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

  // #416 — the scaffolded .kps must be a package KD can compile to a .kmp, not
  // the empty `<Package><Info/><Files/></Package>` stub (which fails kmc with
  // KM04021 / KM09010). The <Files> list is derived from the keyboard's actual
  // build outputs so kmc neither errors on a missing file (KM04003) nor warns
  // on a web target lacking its .js (KM0401A).
  describe("buildable .kps package (#416)", () => {
    const VK_KMN = BASE_KMN.replace(
      "begin Unicode",
      "store(&VISUALKEYBOARD) 'base_keyboard.kvks'\nbegin Unicode",
    );
    const DESKTOP_KMN = BASE_KMN.replace("store(&TARGETS) 'any'", "store(&TARGETS) 'windows'");

    const fetchKmn = (kmn: string) =>
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(url.includes(".kmn") ? makeTextResponse(kmn) : makeNotFoundResponse()),
      ) as unknown as typeof fetch;

    const scaffoldKps = async (kmn: string, base: BaseKeyboard, id: string): Promise<string> => {
      const service = createScaffolderService({ fetchImpl: fetchKmn(kmn) });
      const { vfs } = await service.scaffold(base, id, "My Keyboard");
      return vfs.get(`source/${id}.kps`)!.content as string;
    };

    it("emits a buildable .kps, not the empty stub (FollowKeyboardVersion + Description + populated Files)", async () => {
      const kps = await scaffoldKps(BASE_KMN, baseKeyboard, "my_keyboard");
      expect(kps).not.toBe("<Package><Info/><Files/></Package>");
      expect(kps).toContain("<FollowKeyboardVersion/>");
      expect(kps).toMatch(/<Description[^>]*>.+<\/Description>/);
      expect(kps).toContain("..\\build\\my_keyboard.kmx");
      expect(kps).toContain("<ID>my_keyboard</ID>");
    });

    it("lists the .js for web/touch targets and omits .kvk when there is no visual keyboard", async () => {
      // BASE_KMN: &TARGETS 'any' (web) and no &VISUALKEYBOARD.
      const kps = await scaffoldKps(BASE_KMN, baseKeyboard, "my_keyboard");
      expect(kps).toContain("..\\build\\my_keyboard.js");
      expect(kps).not.toContain("my_keyboard.kvk");
    });

    it("omits the .js for desktop-only targets (referencing an unproduced .js would fail kmc KM04003)", async () => {
      const kps = await scaffoldKps(DESKTOP_KMN, baseKeyboard, "my_keyboard");
      expect(kps).not.toContain("my_keyboard.js");
      expect(kps).toContain("..\\build\\my_keyboard.kmx");
    });

    it("lists the .kvk when the keyboard declares a visual keyboard", async () => {
      const kps = await scaffoldKps(VK_KMN, baseKeyboard, "my_keyboard");
      expect(kps).toContain("..\\build\\my_keyboard.kvk");
    });

    // spec 059: the descriptor declares exactly ONE language, so the scaffolder's
    // placeholder threads `base.languages[0]` rather than the whole list. Emitting
    // every base tag is what let a Bambara keyboard on a French base ship declaring
    // `fr` — and the base's language is a placeholder here in any case: the output
    // projection's step 3.6 replaces this block with the AUTHOR's tag before
    // anything ships (FR-001). The `und` fallback is unchanged.
    it("threads base.languages[0] into <Languages>, falling back to 'und' when absent", async () => {
      const withLang: BaseKeyboard = { ...baseKeyboard, languages: ["ak", "en"] };
      const kpsLang = await scaffoldKps(BASE_KMN, withLang, "kb_lang");
      expect(kpsLang).toContain('<Language ID="ak">');
      expect(kpsLang.match(/<Language\b/g)).toHaveLength(1);
      expect(kpsLang).not.toContain('<Language ID="en">');

      const kpsUnd = await scaffoldKps(BASE_KMN, baseKeyboard, "kb_und");
      expect(kpsUnd).toContain('<Language ID="und">');
    });

    it("propagates base.version into <Keyboard><Version> instead of hardcoding 1.0", async () => {
      const v2Base: BaseKeyboard = { ...baseKeyboard, version: "2.0" };
      const kps = await scaffoldKps(BASE_KMN, v2Base, "my_keyboard");
      // Version must appear inside <Keyboards><Keyboard>, not as the hardcoded "1.0".
      expect(kps).toContain("<Version>2.0</Version>");
      expect(kps).not.toContain("<Version>1.0</Version>");
    });
  });
});

// ---------------------------------------------------------------------------
// Attribution emission (spec 059 US1)
//
// Before this feature LICENSE.md read `Copyright © <year> <displayName>` — naming
// the KEYBOARD as its own rights holder — and resetIdentity independently
// fabricated the same string into store(&COPYRIGHT), overwriting whatever the
// base declared. These assertions pin the success criteria.
// ---------------------------------------------------------------------------

describe("attribution emission (spec 059)", () => {
  const ATTRIBUTION = {
    authorName: "Alice Example",
    authorEmail: "alice@example.org",
    copyrightHolder: "Bafut Language Committee",
  };
  const YEAR = 2026;

  function serviceWithBase() {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(BASE_KMN));
      return Promise.resolve(makeNotFoundResponse());
    });
    return createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
  }

  async function scaffoldWith(opts: Record<string, unknown>) {
    return serviceWithBase().scaffold(baseKeyboard, "my_keyboard", "My Keyboard", opts);
  }

  function texts(vfs: import("@keyboard-studio/contracts").VirtualFS) {
    return {
      license: vfs.get("LICENSE.md")!.content as string,
      kmn: vfs.get("source/my_keyboard.kmn")!.content as string,
      kps: vfs.get("source/my_keyboard.kps")!.content as string,
    };
  }

  // SC-003: one source of truth. 22 shipped keyboards disagree between their
  // LICENSE.md and .kmn because those strings were built independently.
  it("SC-003: LICENSE.md, store(&COPYRIGHT) and .kps <Copyright> all agree on the holder", async () => {
    const { vfs } = await scaffoldWith({ attribution: ATTRIBUTION, emitYear: YEAR });
    const { license, kmn, kps } = texts(vfs);
    const expected = `Copyright © ${YEAR} Bafut Language Committee`;
    expect(license).toContain(expected);
    expect(kmn).toContain(`store(&COPYRIGHT) '${expected}'`);
    expect(kps).toContain(`<Copyright URL="">${expected}</Copyright>`);
  });

  // SC-001: the bug this feature exists to fix.
  it("SC-001: the keyboard's display name is NEVER emitted as the copyright holder", async () => {
    const { vfs } = await scaffoldWith({ attribution: ATTRIBUTION, emitYear: YEAR });
    const { license, kmn, kps } = texts(vfs);
    for (const [name, text] of Object.entries({ license, kmn, kps })) {
      expect(text, `${name} names the keyboard as rights holder`).not.toContain(
        `Copyright © ${YEAR} My Keyboard`,
      );
    }
    expect(license).not.toContain("My Keyboard");
  });

  // SC-006: the license body is a constant (all 920 shipped files are MIT with
  // one canonical body).
  it("SC-006: the MIT body is byte-identical across differently-named keyboards", async () => {
    const a = await serviceWithBase().scaffold(baseKeyboard, "kb_one", "Keyboard One", {
      attribution: ATTRIBUTION,
      emitYear: YEAR,
    });
    const b = await serviceWithBase().scaffold(baseKeyboard, "kb_two", "Keyboard Two", {
      attribution: { ...ATTRIBUTION, copyrightHolder: "Someone Else" },
      emitYear: 2019,
    });
    const body = (s: string) => s.split("\n\n").slice(1).join("\n\n");
    const la = a.vfs.get("LICENSE.md")!.content as string;
    const lb = b.vfs.get("LICENSE.md")!.content as string;
    expect(body(la)).toBe(body(lb));
    expect(la).not.toBe(lb); // the holder lines DO differ
  });

  // T010's finding: resetIdentity used to overwrite the base's copyright with a
  // fabricated string, stripping the original author from the emitted .kmn.
  it("stops resetIdentity fabricating a holder — the base's line is replaced by the CONFIRMED one", async () => {
    const { vfs } = await scaffoldWith({ attribution: ATTRIBUTION, emitYear: YEAR });
    const { kmn } = texts(vfs);
    expect(kmn).toContain("store(&COPYRIGHT) 'Copyright © 2026 Bafut Language Committee'");
    expect(kmn).not.toContain("Copyright © 2026 My Keyboard");
  });

  it("holder defaults to the author when no explicit copyright holder is given", async () => {
    const { vfs } = await scaffoldWith({
      attribution: { authorName: "Alice Example", copyrightHolder: "" },
      emitYear: YEAR,
    });
    expect(texts(vfs).license).toContain(`Copyright © ${YEAR} Alice Example`);
  });

  it("writes the author into .kps <Author> with a mailto URL when an email is known", async () => {
    const { vfs } = await scaffoldWith({ attribution: ATTRIBUTION, emitYear: YEAR });
    expect(texts(vfs).kps).toContain(
      '<Author URL="mailto:alice@example.org">Alice Example</Author>',
    );
  });

  it("omits the mailto URL when the email is private, without dropping the author", async () => {
    const { vfs } = await scaffoldWith({
      attribution: { authorName: "Alice Example", copyrightHolder: "Alice Example" },
      emitYear: YEAR,
    });
    const { kps } = texts(vfs);
    expect(kps).toContain('<Author URL="">Alice Example</Author>');
    expect(kps).not.toContain("mailto:");
  });

  it("uses the injected emitYear rather than the clock (D2)", async () => {
    const { vfs } = await scaffoldWith({ attribution: ATTRIBUTION, emitYear: 1999 });
    expect(texts(vfs).license).toContain("Copyright © 1999 Bafut Language Committee");
    expect(vfs.get("LICENSE.md")!.content as string).not.toContain(
      String(new Date().getFullYear()),
    );
  });

  // Fail loud rather than fabricate: no attribution means NO notice, flagged via
  // a dedicated result field so callers can gate publish/download on it.
  describe("with no attribution supplied", () => {
    it("invents no holder — LICENSE.md and .kps carry no notice", async () => {
      const { vfs } = await scaffoldWith({ emitYear: YEAR });
      const { license, kps } = texts(vfs);
      expect(license).not.toMatch(/^Copyright/m);
      expect(kps).not.toContain("<Copyright");
    });

    // The .kmn is the one artifact that CAN know a holder without attribution:
    // parse() read one from the base. Preserving it is what MIT requires of a
    // derivative, and is strictly better than the pre-059 behaviour of
    // overwriting it with the keyboard's own display name.
    it("PRESERVES the base's copyright in the .kmn rather than overwriting it", async () => {
      const { vfs } = await scaffoldWith({ emitYear: YEAR });
      const { kmn } = texts(vfs);
      expect(kmn).toContain("store(&COPYRIGHT) 'Copyright © 2020 Base Author'");
      const held = /store\(&COPYRIGHT\) '([^']*)'/.exec(kmn)?.[1] ?? "";
      expect(held).not.toContain("My Keyboard");
    });

    it("still emits a complete MIT body", async () => {
      const { vfs } = await scaffoldWith({ emitYear: YEAR });
      expect(texts(vfs).license).toContain("Permission is hereby granted, free of charge");
    });

    it("reports attributionMissing so callers can gate", async () => {
      const missing = await scaffoldWith({ emitYear: YEAR });
      expect(missing.attributionMissing).toBe(true);
      const present = await scaffoldWith({ attribution: ATTRIBUTION, emitYear: YEAR });
      expect(present.attributionMissing).toBe(false);
    });

    // `warnings` means "fell back to stub-only output"; a missing attribution is
    // a different condition and must not masquerade as a fetch failure.
    it("does NOT add a warning — that channel means stub-only fallback", async () => {
      const { warnings } = await scaffoldWith({ emitYear: YEAR });
      expect(warnings.filter((w) => /attribut/i.test(w))).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// US2 — a DERIVED keyboard accumulates the base author's notice (spec 059)
//
// MIT requires the original copyright notice be retained in a derivative. So the
// base's holders are carried VERBATIM and the new author is APPENDED, never
// substituted. Before this, resetIdentity overwrote the base's copyright with a
// fabricated `Copyright © <year> <displayName>`.
// ---------------------------------------------------------------------------

describe("derived keyboard accumulates the base's copyright (spec 059 US2)", () => {
  const NEW_AUTHOR = {
    authorName: "Second Author",
    copyrightHolder: "Second Author",
  };

  /** Base .kmn plus a LICENSE.md served from the keyboard root. */
  function serviceWithLicense(licenseText: string | null) {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(BASE_KMN));
      if (url.endsWith("/LICENSE.md")) {
        return licenseText === null
          ? Promise.resolve(makeNotFoundResponse())
          : Promise.resolve(makeTextResponse(licenseText));
      }
      return Promise.resolve(makeNotFoundResponse());
    });
    return createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
  }

  function license(...lines: string[]): string {
    return `The MIT License (MIT)\n\n${lines.join("\n")}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\n`;
  }

  async function derive(licenseText: string | null) {
    return serviceWithLicense(licenseText).scaffold(
      baseKeyboard,
      "my_keyboard",
      "My Keyboard",
      { attribution: NEW_AUTHOR, emitYear: 2026 },
    );
  }

  it("RETAINS the base author's line and APPENDS the new author", async () => {
    const { vfs } = await derive(license("Copyright (c) 2016-2021 Original Author"));
    const out = vfs.get("LICENSE.md")!.content as string;
    expect(out).toContain("Copyright (c) 2016-2021 Original Author");
    expect(out).toContain("Copyright © 2026 Second Author");
  });

  it("keeps the inherited line BYTE-IDENTICAL (FR-007)", async () => {
    const original = "Copyright (c) 2016-2021 Original Author";
    const { vfs } = await derive(license(original));
    const lines = (vfs.get("LICENSE.md")!.content as string).split("\n");
    expect(lines[0]).toBe(original);
  });

  it("orders the chain chronologically, oldest first (D3)", async () => {
    const { vfs } = await derive(
      license("Copyright (c) 2016-2021 Original Author", "Copyright (c) 2024 Middle Author"),
    );
    const out = vfs.get("LICENSE.md")!.content as string;
    const idx = (s: string) => out.indexOf(s);
    expect(idx("Original Author")).toBeLessThan(idx("Middle Author"));
    expect(idx("Middle Author")).toBeLessThan(idx("Second Author"));
  });

  it("accumulates a THIRD generation (fork of a fork)", async () => {
    const { vfs } = await derive(
      license("Copyright (c) 2016-2021 Original Author", "Copyright © 2024 Second Gen"),
    );
    const out = vfs.get("LICENSE.md")!.content as string;
    const holders = out.split("\n").filter((l) => l.startsWith("Copyright"));
    expect(holders).toHaveLength(3);
  });

  it("does NOT rewrite SIL International to SIL Global (D4)", async () => {
    const { vfs } = await derive(license("Copyright © 2019 SIL International"));
    const out = vfs.get("LICENSE.md")!.content as string;
    expect(out).toContain("Copyright © 2019 SIL International");
    expect(out).not.toContain("SIL Global");
  });

  it("EXTENDS the year range when the same holder derives again, without duplicating", async () => {
    const { vfs } = await serviceWithLicense(license("Copyright © 2016 Second Author")).scaffold(
      baseKeyboard,
      "my_keyboard",
      "My Keyboard",
      { attribution: NEW_AUTHOR, emitYear: 2026 },
    );
    const out = vfs.get("LICENSE.md")!.content as string;
    expect(out.split("\n").filter((l) => l.includes("Second Author"))).toHaveLength(1);
    expect(out).toContain("2016-2026 Second Author");
  });

  it("reports how many holders were inherited", async () => {
    const two = await derive(
      license("Copyright (c) 2016 A Author", "Copyright (c) 2020 B Author"),
    );
    expect(two.inheritedHolderCount).toBe(2);
    const none = await derive(null);
    expect(none.inheritedHolderCount).toBe(0);
  });

  it("the .kmn store carries the whole chain, not just the new author", async () => {
    const { vfs } = await derive(license("Copyright (c) 2016-2021 Original Author"));
    const kmn = vfs.get("source/my_keyboard.kmn")!.content as string;
    expect(kmn).toContain("Original Author");
    expect(kmn).toContain("Second Author");
  });

  // D5: a notice we cannot read must BLOCK, never be silently dropped.
  describe("unparseable base notice (D5)", () => {
    it("flags an unfilled template rather than dropping the notice", async () => {
      const r = await derive(license("Copyright (c) YYYY _____________________"));
      expect(r.licenseUnparseable?.reason).toBe("template_placeholder");
    });

    it("flags a year with no holder", async () => {
      const r = await derive(license("Copyright © 2015"));
      expect(r.licenseUnparseable?.reason).toBe("no_holder");
    });

    it("does not flag a base with no license file at all", async () => {
      const r = await derive(null);
      expect(r.licenseUnparseable).toBeUndefined();
    });

    it("does not flag a license with no copyright line — nothing was retained", async () => {
      const r = await derive("The MIT License (MIT)\n\nPermission is hereby granted\n");
      expect(r.licenseUnparseable).toBeUndefined();
      expect(r.inheritedHolderCount).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// D5 escape hatch (spec 059 T037) — the author supplies the original holder
//
// A hard block is only acceptable because the author is never stuck, and because
// the remedy PRESERVES the notice rather than dropping it.
// ---------------------------------------------------------------------------

describe("D5 escape hatch — baseHolderOverride (spec 059)", () => {
  const NEW_AUTHOR = { authorName: "Second Author", copyrightHolder: "Second Author" };
  const UNREADABLE = "The MIT License (MIT)\n\nCopyright (c) YYYY _____________________\n";

  function svc(licenseText: string) {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(BASE_KMN));
      if (url.endsWith("/LICENSE.md")) return Promise.resolve(makeTextResponse(licenseText));
      return Promise.resolve(makeNotFoundResponse());
    });
    return createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
  }

  async function run(override?: string) {
    return svc(UNREADABLE).scaffold(baseKeyboard, "my_keyboard", "My Keyboard", {
      attribution: NEW_AUTHOR,
      emitYear: 2026,
      ...(override !== undefined ? { baseHolderOverride: override } : {}),
    });
  }

  it("without an override, the unreadable notice is reported", async () => {
    const r = await run();
    expect(r.licenseUnparseable?.reason).toBe("template_placeholder");
    expect(r.inheritedHolderCount).toBe(0);
  });

  it("with an override, the block clears", async () => {
    const r = await run("Original Author");
    expect(r.licenseUnparseable).toBeUndefined();
    expect(r.inheritedHolderCount).toBe(1);
  });

  it("the supplied holder is RETAINED in the emitted LICENSE.md", async () => {
    const { vfs } = await run("Original Author");
    const out = vfs.get("LICENSE.md")!.content as string;
    expect(out).toContain("Copyright © Original Author");
    expect(out).toContain("Copyright © 2026 Second Author");
  });

  it("emits NO year for the supplied holder — the unreadable line never stated one", async () => {
    const { vfs } = await run("Original Author");
    const line = (vfs.get("LICENSE.md")!.content as string)
      .split("\n")
      .find((l) => l.includes("Original Author"))!;
    expect(line).not.toMatch(/\d{4}/);
  });

  it("orders the supplied holder BEFORE the new author (it predates by definition)", async () => {
    const { vfs } = await run("Original Author");
    const out = vfs.get("LICENSE.md")!.content as string;
    expect(out.indexOf("Original Author")).toBeLessThan(out.indexOf("Second Author"));
  });

  it("ignores a blank or whitespace-only override", async () => {
    for (const v of ["", "   "]) {
      const r = await run(v);
      expect(r.licenseUnparseable?.reason, `override ${JSON.stringify(v)}`).toBe(
        "template_placeholder",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// T038 — the single-valued metadata fields use the corpus "Portions" convention
//
// store(&COPYRIGHT) and .kps <Copyright> hold ONE value, so a multi-holder chain
// has to be collapsed. 33 shipped keyboards already establish how, identically in
// both files — release/fv/fv_dakelh:
//
//   (c) 2008-2024 FirstVoices, SIL International. Portions (c) 2006 Chris Harvey
//
// This asserts the studio emits that same shape rather than an invented one.
// ---------------------------------------------------------------------------

describe("single-line copyright metadata uses the Portions convention (spec 059 T038)", () => {
  const NEW_AUTHOR = { authorName: "New Author", copyrightHolder: "New Author" };

  function svc(licenseText: string | null) {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(BASE_KMN));
      if (url.endsWith("/LICENSE.md")) {
        return licenseText === null
          ? Promise.resolve(makeNotFoundResponse())
          : Promise.resolve(makeTextResponse(licenseText));
      }
      return Promise.resolve(makeNotFoundResponse());
    });
    return createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
  }

  async function fields(licenseText: string | null) {
    const { vfs } = await svc(licenseText).scaffold(
      baseKeyboard,
      "my_keyboard",
      "My Keyboard",
      { attribution: NEW_AUTHOR, emitYear: 2026 },
    );
    const kmn = vfs.get("source/my_keyboard.kmn")!.content as string;
    const kps = vfs.get("source/my_keyboard.kps")!.content as string;
    return {
      kmnStore: /store\(&COPYRIGHT\) '([^']*)'/.exec(kmn)?.[1] ?? "",
      kpsCopyright: /<Copyright URL="">([^<]*)<\/Copyright>/.exec(kps)?.[1] ?? "",
      license: vfs.get("LICENSE.md")!.content as string,
    };
  }

  const ONE = "The MIT License (MIT)\n\nCopyright (c) 2016-2021 Original Author\n";
  const TWO =
    "The MIT License (MIT)\n\nCopyright (c) 2016-2021 Original Author\nCopyright © 2024 Second Gen\n";

  it("a single holder needs no Portions clause", async () => {
    const f = await fields(null);
    expect(f.kmnStore).toBe("Copyright © 2026 New Author");
    expect(f.kmnStore).not.toContain("Portions");
  });

  it("two holders collapse to <primary>. Portions <earlier>", async () => {
    const f = await fields(ONE);
    expect(f.kmnStore).toBe(
      "Copyright © 2026 New Author. Portions (c) 2016-2021 Original Author",
    );
  });

  // The DERIVING author is primary; the base author becomes Portions. That is the
  // derivation relationship: this work is the new author's, incorporating parts
  // of the base — and it matches how fv_dakelh reads.
  it("the deriving author is PRIMARY and the base author is the portion", async () => {
    const f = await fields(ONE);
    expect(f.kmnStore.indexOf("New Author")).toBeLessThan(f.kmnStore.indexOf("Portions"));
    expect(f.kmnStore.indexOf("Portions")).toBeLessThan(f.kmnStore.indexOf("Original Author"));
  });

  it("three holders list the earlier ones comma-separated inside Portions", async () => {
    const f = await fields(TWO);
    expect(f.kmnStore).toBe(
      "Copyright © 2026 New Author. Portions (c) 2016-2021 Original Author, © 2024 Second Gen",
    );
  });

  it("inherited markers are preserved inside the Portions clause", async () => {
    const f = await fields(TWO);
    // (c) from the first inherited line, © from the second — neither normalised.
    expect(f.kmnStore).toContain("(c) 2016-2021 Original Author");
    expect(f.kmnStore).toContain("© 2024 Second Gen");
  });

  it("the .kps carries the identical string — the two files cannot disagree (SC-003)", async () => {
    const f = await fields(TWO);
    expect(f.kpsCopyright).toBe(f.kmnStore);
  });

  it("LICENSE.md still keeps ONE HOLDER PER LINE — it is the lossless source (D4)", async () => {
    const f = await fields(TWO);
    const lines = f.license.split("\n").filter((l) => l.startsWith("Copyright"));
    expect(lines).toHaveLength(3);
    expect(f.license).not.toContain("Portions");
  });

  it("matches the shape of the 33 shipped keyboards that already do this", async () => {
    const f = await fields(ONE);
    // release/fv/fv_dakelh: "<holder>. Portions <holder>"
    expect(f.kmnStore).toMatch(/^Copyright .+\. Portions .+$/);
  });
});
