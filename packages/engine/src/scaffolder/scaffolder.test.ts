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

describe("renameFilesInVfs — CSS selector rewriting", () => {
  it("rewrites .kmw-keyboard-<baseId> selectors in .css files", () => {
    const vfs = createVirtualFS();
    // One matching selector; one near-miss that shares the base prefix but has
    // extra alphanumerics (word-boundary anchor must prevent rewriting it).
    const css = `.kmw-keyboard-sil_cameroon_qwerty { color: red; }\n.kmw-keyboard-sil_cameroon_qwerty_extra { color: blue; }\n`;
    vfs.set("source/sil_cameroon_qwerty.css", css);

    renameFilesInVfs(vfs, "sil_cameroon_qwerty", "my_new_keyboard");

    const entry = vfs.get("source/sil_cameroon_qwerty.css");
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
});
