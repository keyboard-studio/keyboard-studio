import { describe, it, expect, vi } from "vitest";
import { createScaffolderService } from "./index.js";
import { runAllChecks } from "../validator/index.js";
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
      const vfs = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");

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
      const vfs = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");

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
      const vfs = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");

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
      const vfs = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard");

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

      const vfs = await service.scaffold(baseKeyboard, "new_keyboard", "New Keyboard");

      expect(vfs.get("source/new_keyboard.kmn")).toBeDefined();
      expect(vfs.get("LICENSE.md")).toBeDefined();
    });

    it("uses azerty CasedKeys for azerty group", async () => {
      const kmnWithCaps = `store(&KEYBOARDVERSION) '1.0'\nNCAPStest [CAPS K_A] > 'x'\n+ [K_A] > 'a'\n`;
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(".kmn")) return Promise.resolve(makeTextResponse(kmnWithCaps));
        return Promise.resolve(makeNotFoundResponse());
      });

      const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
      const vfs = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard", {
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
      const vfs = await service.scaffold(baseKeyboard, "my_keyboard", "My Keyboard", {
        group: "non-roman",
      });

      const kmnEntry = vfs.get("source/my_keyboard.kmn");
      const content = kmnEntry!.content as string;
      expect(content).not.toContain("store(&CasedKeys)");
    });
  });
});
