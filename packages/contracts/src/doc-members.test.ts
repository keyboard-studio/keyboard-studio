// Runtime coverage for the spec 076 documentation-completeness schemas
// (doc-members.ts ↔ schemas.ts). The compile-time drift guards pin the
// inferred types to the interfaces; these tests pin the runtime direction —
// each schema accepts a well-formed literal unchanged and rejects malformed
// input at the load boundary.

import { describe, it, expect } from "vitest";
import { DOC_MEMBER_IDS, type DocMemberId, type DocMemberState } from "./doc-members";
import { makeBaseKeyboard, type BaseKeyboard } from "./baseKeyboard";
import {
  BaseDocumentationProfileSchema,
  ChartPreferenceSchema,
  DocLintInputSchema,
  DocMemberIdSchema,
  DocMemberStateSchema,
  HistoryEntryStateSchema,
  LayoutChartFileSchema,
} from "./schemas";

const MEMBER_PATHS: Record<DocMemberId, string> = {
  "readme-md": "README.md",
  "history-md": "HISTORY.md",
  "license-md": "LICENSE.md",
  "readme-htm": "source/readme.htm",
  "welcome-htm": "source/welcome/welcome.htm",
  "help-php": "source/help/<id>.php",
};

describe("DocMemberId (spec 076 FR-001)", () => {
  it("enumerates exactly six members with their projected paths", () => {
    expect(DOC_MEMBER_IDS).toHaveLength(6);
    expect(new Set(DOC_MEMBER_IDS).size).toBe(6);
    for (const id of DOC_MEMBER_IDS) {
      expect(MEMBER_PATHS[id]).toBeDefined();
      expect(DocMemberIdSchema.safeParse(id).success).toBe(true);
    }
    expect(DocMemberIdSchema.safeParse("welcome-html").success).toBe(false);
  });
});

describe("DocMemberStateSchema", () => {
  const valid: DocMemberState = {
    member: "welcome-htm",
    path: "source/welcome/welcome.htm",
    tier: "inherited",
    placeholder: false,
    fillStepId: "help",
    warnings: ["missing image: welcome/layout.png"],
  };

  it("round-trips a valid literal", () => {
    const result = DocMemberStateSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(valid);
  });

  it("rejects an unknown tier", () => {
    expect(DocMemberStateSchema.safeParse({ ...valid, tier: "guessed" }).success).toBe(false);
  });
});

describe("BaseDocumentationProfileSchema", () => {
  it("round-trips a folder-convention full profile and rejects a bad level", () => {
    const valid = {
      level: "full",
      members: ["readme-md", "history-md", "license-md", "welcome-htm", "help-php"],
      welcomeConvention: "folder",
      welcomeImages: ["welcome/desktop_layout_default.png"],
      hasUsableDescription: true,
    };
    const ok = BaseDocumentationProfileSchema.safeParse(valid);
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual(valid);
    expect(BaseDocumentationProfileSchema.safeParse({ ...valid, level: "partial" }).success).toBe(false);
  });
});

describe("BaseKeyboard.docProfile (spec 076 T033 — additive carrier field)", () => {
  it("is absent by default and construction is unaffected", () => {
    const base = makeBaseKeyboard({
      id: "basic_kbdus",
      path: "release/b/basic_kbdus",
      script: "Latn",
      targets: ["windows"],
      displayName: "US English (Basic)",
      version: "1.0",
    });
    expect(base.docProfile).toBeUndefined();
    expect("docProfile" in base).toBe(false);
  });

  it("accepts a computed BaseDocumentationProfile, still validated by its own zod mirror", () => {
    const profile = {
      level: "minimal",
      members: ["welcome-htm", "license-md"],
      welcomeConvention: "flat",
      welcomeImages: [],
      hasUsableDescription: false,
    };
    expect(BaseDocumentationProfileSchema.safeParse(profile).success).toBe(true);

    const base: BaseKeyboard = {
      ...makeBaseKeyboard({
        id: "basic_kbdus",
        path: "release/b/basic_kbdus",
        script: "Latn",
        targets: ["windows"],
        displayName: "US English (Basic)",
        version: "1.0",
      }),
      docProfile: profile,
    };
    expect(base.docProfile?.level).toBe("minimal");
  });
});

describe("HistoryEntryStateSchema", () => {
  it("round-trips a proposed entry with null edits and rejects a bad status", () => {
    const valid = {
      status: "proposed",
      proposal: { version: "1.0", dateIso: "2026-09-10", bullets: ["Adapted from basic_kbdfr 1.0"] },
      editedBullets: null,
    };
    const ok = HistoryEntryStateSchema.safeParse(valid);
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual(valid);
    expect(HistoryEntryStateSchema.safeParse({ ...valid, status: "pending" }).success).toBe(false);
  });
});

describe("LayoutChartFileSchema / ChartPreferenceSchema", () => {
  it("accepts the three platforms and both preferences, rejects others", () => {
    const file = { filename: "ks-layout-desktop-shift.svg", platform: "desktop", layerId: "shift", svg: "<svg/>" };
    expect(LayoutChartFileSchema.safeParse(file).success).toBe(true);
    expect(LayoutChartFileSchema.safeParse({ ...file, platform: "watch" }).success).toBe(false);
    expect(ChartPreferenceSchema.safeParse("keep-base-images").success).toBe(true);
    expect(ChartPreferenceSchema.safeParse("regenerate").success).toBe(true);
    expect(ChartPreferenceSchema.safeParse("always").success).toBe(false);
  });
});

describe("DocLintInputSchema", () => {
  it("round-trips a complete input and rejects a member outside DocMemberId", () => {
    const valid = {
      keyboardId: "hausa_basic",
      keyboardVersion: "1.0",
      targets: ["windows", "macosx"],
      layerIds: ["default", "shift"],
      displayName: "Hausa Basic",
      copyrightHolders: { license: "SIL Global", kmn: "SIL Global" },
      members: { "history-md": "## 1.0 (2026-09-10)\n* Initial release.\n" },
      deletedFilenames: [],
      baseHistoryMdText: "## 0.9 (2025-01-01)\n* Base release.\n",
    };
    const ok = DocLintInputSchema.safeParse(valid);
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual(valid);
    expect(
      DocLintInputSchema.safeParse({ ...valid, members: { "changelog-md": "x" } }).success,
    ).toBe(false);
  });
});
