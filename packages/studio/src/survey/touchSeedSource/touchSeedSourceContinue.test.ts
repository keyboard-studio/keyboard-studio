// FR-040 unit tests for the rules lifted out of TouchSeedSourcePanel into
// touchSeedSourceContinue.ts (spec 107). The panel calls these functions; the
// panel's own tests (TouchSeedSourcePanel.test.tsx) cover the rendered wiring,
// these cover each rule's branches directly.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { KeyboardIR, VirtualFS } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import {
  clearTouchDraftOnSeedChange,
  defaultTouchSeedSource,
  deriveSeedPreview,
  parseBaseTouchPreview,
  startShipsUsableTouch,
} from "./touchSeedSourceContinue.ts";

const PHONE_ONLY_JSON = JSON.stringify({
  phone: {
    layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_Q", text: "q" }, { id: "K_W", text: "w" }] }] }],
  },
});

const PHONE_AND_TABLET_JSON = JSON.stringify({
  phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_Q", text: "q" }] }] }] },
  tablet: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_Q", text: "q" }] }] }] },
});

const TABLET_AND_DESKTOP_JSON = JSON.stringify({
  desktop: { layer: [] },
  tablet: { layer: [] },
});

const DESKTOP_ONLY_JSON = JSON.stringify({ desktop: { layer: [] } });

// A key id the derived default layout never produces, to tell shipped from derived.
const SHIPPED_ONLY_JSON = JSON.stringify({
  phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_SHIPPED_MARKER", text: "z" }] }] }] },
});

const NO_MODS = { removals: [], placements: [] };

/** A VFS shaped like the copied keyboard, optionally shipping a touch layout. */
function startVfsWith(touchLayoutJson?: string): VirtualFS {
  const files = [{ path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false }];
  if (touchLayoutJson !== undefined) {
    files.push({
      path: "source/basic_kbdus.keyman-touch-layout",
      content: touchLayoutJson,
      isBinary: false,
    });
  }
  return createVirtualFS(files);
}

const TOUCH_DRAFT = { charTouchEntries: [], suggestionResolvedChars: [] };

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseBaseTouchPreview", () => {
  it("returns null for absent input", () => {
    expect(parseBaseTouchPreview(undefined)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseBaseTouchPreview("{not valid json")).toBeNull();
  });

  it.each([
    ["a JSON array", "[]"],
    ["a JSON null", "null"],
    ["a JSON string", '"phone"'],
    ["an object with no platform carrying a layer array", JSON.stringify({ phone: { layer: "x" }, tablet: {} })],
    ["an empty object", "{}"],
  ])("returns null for %s", (_label, json) => {
    expect(parseBaseTouchPreview(json)).toBeNull();
  });

  it("lists the platforms and previews phone when only phone ships", () => {
    expect(parseBaseTouchPreview(PHONE_ONLY_JSON)).toEqual({
      platformIds: ["phone"],
      previewPlatformId: "phone",
    });
  });

  it("prefers phone over tablet when both ship", () => {
    const summary = parseBaseTouchPreview(PHONE_AND_TABLET_JSON);
    expect(summary?.platformIds).toEqual(["phone", "tablet"]);
    expect(summary?.previewPlatformId).toBe("phone");
  });

  it("prefers tablet over desktop when phone is absent", () => {
    expect(parseBaseTouchPreview(TABLET_AND_DESKTOP_JSON)?.previewPlatformId).toBe("tablet");
  });

  it("previews desktop when it is the only platform", () => {
    expect(parseBaseTouchPreview(DESKTOP_ONLY_JSON)?.previewPlatformId).toBe("desktop");
  });

  it("falls back to the first platform id when none is in the preference order", () => {
    const json = JSON.stringify({ watch: { layer: [] } });
    expect(parseBaseTouchPreview(json)?.previewPlatformId).toBe("watch");
  });
});

describe("startShipsUsableTouch", () => {
  it("is true for a layout with a platform that has layers", () => {
    expect(startShipsUsableTouch(startVfsWith(PHONE_ONLY_JSON))).toBe(true);
  });

  it("is false with no touch layout, a null vfs, malformed JSON, or no platforms", () => {
    expect(startShipsUsableTouch(startVfsWith())).toBe(false);
    expect(startShipsUsableTouch(null)).toBe(false);
    expect(startShipsUsableTouch(startVfsWith("{not json"))).toBe(false);
    expect(startShipsUsableTouch(startVfsWith("{}"))).toBe(false);
    expect(startShipsUsableTouch(startVfsWith(JSON.stringify({ phone: {} })))).toBe(false);
  });
});

describe("defaultTouchSeedSource", () => {
  it("returns the recorded choice on re-entry, even when a usable layout ships", () => {
    expect(defaultTouchSeedSource(startVfsWith(PHONE_ONLY_JSON), "reseed-from-desktop")).toBe(
      "reseed-from-desktop",
    );
  });

  it("returns the recorded import-adapt choice even when no layout ships", () => {
    expect(defaultTouchSeedSource(startVfsWith(), "import-adapt")).toBe("import-adapt");
  });

  it("defaults to import-adapt when nothing is recorded and a usable touch layout ships", () => {
    expect(defaultTouchSeedSource(startVfsWith(PHONE_ONLY_JSON), null)).toBe("import-adapt");
  });

  it("defaults to reseed when nothing is recorded and no touch layout ships", () => {
    expect(defaultTouchSeedSource(startVfsWith(), null)).toBe("reseed-from-desktop");
  });

  it("defaults to reseed when nothing is recorded and there is no start VFS", () => {
    expect(defaultTouchSeedSource(null, null)).toBe("reseed-from-desktop");
  });

  it("defaults to reseed when the shipped touch layout is malformed", () => {
    expect(defaultTouchSeedSource(startVfsWith("{not valid json"), null)).toBe("reseed-from-desktop");
  });

  it("defaults to reseed when the shipped touch layout has no platform with layers", () => {
    expect(defaultTouchSeedSource(startVfsWith("{}"), null)).toBe("reseed-from-desktop");
  });
});

describe("deriveSeedPreview", () => {
  const startIr: KeyboardIR = makeTestIR([]);

  it("emits parseable touch-layout JSON for the reseed card", () => {
    const preview = deriveSeedPreview(startIr, undefined, "reseed-from-desktop", NO_MODS);
    expect(preview).not.toBeNull();
    expect(typeof JSON.parse(preview!.json)).toBe("object");
    expect(Array.isArray(preview!.unplacedChars)).toBe(true);
  });

  it("emits parseable touch-layout JSON for the import-adapt card with a shipped layout", () => {
    const preview = deriveSeedPreview(startIr, SHIPPED_ONLY_JSON, "import-adapt", NO_MODS);
    expect(preview).not.toBeNull();
    expect(preview!.json).toContain("K_SHIPPED_MARKER");
  });

  it("ignores the shipped layout on the reseed card", () => {
    const reseed = deriveSeedPreview(startIr, SHIPPED_ONLY_JSON, "reseed-from-desktop", NO_MODS);
    expect(reseed).not.toBeNull();
    expect(reseed!.json).not.toContain("K_SHIPPED_MARKER");
  });

  it("returns null and logs when the derivation throws", () => {
    const errorSpy = vi.spyOn(devLog, "error").mockImplementation(() => undefined);
    // A null IR is not a KeyboardIR; deriveSeedLayout throws reading it.
    const preview = deriveSeedPreview(null as unknown as KeyboardIR, undefined, "reseed-from-desktop", NO_MODS);
    expect(preview).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("seed preview derivation failed");
  });
});

describe("clearTouchDraftOnSeedChange", () => {
  it("clears the touch draft when the selection differs from the recorded choice", () => {
    useWorkingCopyStore.getState().setTouchDraft(TOUCH_DRAFT);
    clearTouchDraftOnSeedChange("reseed-from-desktop", "import-adapt");
    expect(useWorkingCopyStore.getState().touchDraft).toBeNull();
  });

  it("clears the touch draft on a first confirm (nothing recorded yet)", () => {
    useWorkingCopyStore.getState().setTouchDraft(TOUCH_DRAFT);
    clearTouchDraftOnSeedChange("import-adapt", null);
    expect(useWorkingCopyStore.getState().touchDraft).toBeNull();
  });

  it("leaves the touch draft untouched when the same value is re-confirmed", () => {
    useWorkingCopyStore.getState().setTouchDraft(TOUCH_DRAFT);
    clearTouchDraftOnSeedChange("import-adapt", "import-adapt");
    expect(useWorkingCopyStore.getState().touchDraft).toEqual(TOUCH_DRAFT);
  });
});

// Keeps the shared fixture import honest: the copied keyboard the panel tests
// instantiate from is the same one these VFS shapes mirror.
describe("fixture sanity", () => {
  it("instantiates a working copy whose start VFS yields the shipped layout default", () => {
    const vfs = startVfsWith(PHONE_ONLY_JSON);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir: makeTestIR([]) });
    expect(defaultTouchSeedSource(useWorkingCopyStore.getState().startVfs, null)).toBe("import-adapt");
  });
});
