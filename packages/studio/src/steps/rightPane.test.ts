// Per-step preview-pane decision: steps before the base choice declare
// rightPane:"none" so the shell hides the preview pane (desktop and
// mobile); choose_base and later steps keep the preview.

import { describe, it, expect } from "vitest";
import { manifest } from "./manifest.ts";
import {
  resolveRightPane,
  shouldShowPreviewPane,
  type RightPaneKind,
} from "./types.ts";

describe("resolveRightPane", () => {
  it("defaults to preview when the step is missing or declares no rightPane", () => {
    expect(resolveRightPane(undefined)).toBe("preview");
    expect(resolveRightPane(null)).toBe("preview");
    expect(resolveRightPane({})).toBe("preview");
    expect(resolveRightPane({ rightPane: undefined })).toBe("preview");
  });

  it("returns the declared value for each allowed kind", () => {
    const kinds: RightPaneKind[] = ["preview", "character-map", "none"];
    for (const kind of kinds) {
      expect(resolveRightPane({ rightPane: kind })).toBe(kind);
    }
  });
});

describe("shouldShowPreviewPane", () => {
  it("is false only for rightPane none", () => {
    expect(shouldShowPreviewPane({ rightPane: "none" })).toBe(false);
    expect(shouldShowPreviewPane({ rightPane: "preview" })).toBe(true);
    expect(shouldShowPreviewPane({ rightPane: "character-map" })).toBe(true);
    expect(shouldShowPreviewPane(undefined)).toBe(true);
    expect(shouldShowPreviewPane({})).toBe(true);
  });
});

describe("manifest per-step preview-pane decision", () => {
  const byId = (id: string) => manifest.find((s) => s.id === id);

  it("identity hides the preview pane", () => {
    const step = byId("identity");
    expect(step).toBeDefined();
    expect(resolveRightPane(step)).toBe("none");
    expect(shouldShowPreviewPane(step)).toBe(false);
  });

  it("layout hides the preview pane", () => {
    const step = byId("layout");
    expect(step).toBeDefined();
    expect(resolveRightPane(step)).toBe("none");
    expect(shouldShowPreviewPane(step)).toBe(false);
  });

  it("choose_base keeps the preview pane", () => {
    const step = byId("choose_base");
    expect(step).toBeDefined();
    expect(resolveRightPane(step)).toBe("preview");
    expect(shouldShowPreviewPane(step)).toBe(true);
  });

  it("later pane steps keep a preview pane", () => {
    for (const id of ["track", "attribution", "project_name", "help"]) {
      const step = byId(id);
      expect(step, id).toBeDefined();
      expect(shouldShowPreviewPane(step), id).toBe(true);
    }
  });

  it("character-map steps still show a right pane", () => {
    for (const id of ["characters", "punctuation"]) {
      const step = byId(id);
      expect(step, id).toBeDefined();
      expect(resolveRightPane(step), id).toBe("character-map");
      expect(shouldShowPreviewPane(step), id).toBe(true);
    }
  });

  it("exactly identity and layout declare rightPane none", () => {
    const noneIds = manifest
      .filter((s) => s.rightPane === "none")
      .map((s) => s.id)
      .sort();
    expect(noneIds).toEqual(["identity", "layout"]);
  });
});
