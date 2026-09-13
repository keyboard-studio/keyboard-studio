// Tests for pf_welcome_paragraph's adaptive description proposal
// (spec 076 FR-009, US4, contracts/studio-surfaces.md §2).
//
// Covers T037: prefill + waived required on an adaptation whose base has a
// usable description (adapt-full); required + empty (today's behavior,
// unchanged) on net-new, copy (Track 1), and an adaptation whose base is
// classified none.

import { describe, it, expect } from "vitest";
import type { BaseDocumentationProfile } from "@keyboard-studio/contracts";
import mod, {
  definition,
  validate,
  prefill,
  requiredWhen,
  type AdaptiveDescriptionContext,
} from "./pf_welcome_paragraph.ts";

const FULL_PROFILE: BaseDocumentationProfile = {
  level: "full",
  members: ["welcome-htm", "help-php"],
  welcomeConvention: "folder",
  hasUsableDescription: true,
  welcomeImages: [],
};

const NONE_PROFILE: BaseDocumentationProfile = {
  level: "none",
  members: [],
  welcomeConvention: "absent",
  hasUsableDescription: false,
  welcomeImages: [],
};

const WELCOME_HTML = `<html><body><h1>My Keyboard</h1><p>This keyboard lets you type Bafut on any computer.</p></body></html>`;

function ctx(overrides: Partial<AdaptiveDescriptionContext>): AdaptiveDescriptionContext {
  return {
    instantiationMode: null,
    baseDocProfile: null,
    baseWelcomeHtmText: null,
    baseHelpPhpText: null,
    ...overrides,
  };
}

describe("pf_welcome_paragraph — module shape", () => {
  it("still declares required:true as the static default (unchanged base case)", () => {
    expect(definition.required).toBe(true);
  });

  it("exposes inputs/writes as empty arrays (no IR reads/writes)", () => {
    expect(mod.inputs).toEqual([]);
    expect(mod.writes).toEqual([]);
  });
});

describe("pf_welcome_paragraph — prefill (spec 076 FR-009)", () => {
  it("adapt-full: prefills from the base's usable welcome-page description", () => {
    const value = prefill(
      ctx({
        instantiationMode: "adapt-existing",
        baseDocProfile: FULL_PROFILE,
        baseWelcomeHtmText: WELCOME_HTML,
      }),
    );
    expect(value).toBe("This keyboard lets you type Bafut on any computer.");
  });

  it("adapt-full: falls back to the help page when the welcome page has nothing usable", () => {
    const value = prefill(
      ctx({
        instantiationMode: "adapt-existing",
        baseDocProfile: FULL_PROFILE,
        baseWelcomeHtmText: null,
        baseHelpPhpText: WELCOME_HTML,
      }),
    );
    expect(value).toBe("This keyboard lets you type Bafut on any computer.");
  });

  it("net-new (new-from-base): never prefills, regardless of profile", () => {
    const value = prefill(
      ctx({
        instantiationMode: "new-from-base",
        baseDocProfile: FULL_PROFILE,
        baseWelcomeHtmText: WELCOME_HTML,
      }),
    );
    expect(value).toBeUndefined();
  });

  it("no instantiation recorded yet (null): never prefills", () => {
    const value = prefill(
      ctx({
        instantiationMode: null,
        baseDocProfile: FULL_PROFILE,
        baseWelcomeHtmText: WELCOME_HTML,
      }),
    );
    expect(value).toBeUndefined();
  });

  it("adapt track, base classified none: never prefills", () => {
    const value = prefill(
      ctx({
        instantiationMode: "adapt-existing",
        baseDocProfile: NONE_PROFILE,
        baseWelcomeHtmText: null,
      }),
    );
    expect(value).toBeUndefined();
  });

  it("adapt track, no profile computed yet (null): never prefills", () => {
    const value = prefill(
      ctx({
        instantiationMode: "adapt-existing",
        baseDocProfile: null,
        baseWelcomeHtmText: WELCOME_HTML,
      }),
    );
    expect(value).toBeUndefined();
  });
});

describe("pf_welcome_paragraph — requiredWhen (spec 076 FR-009)", () => {
  it("adapt-full: required is WAIVED (a usable description was proposed)", () => {
    expect(
      requiredWhen(
        ctx({
          instantiationMode: "adapt-existing",
          baseDocProfile: FULL_PROFILE,
          baseWelcomeHtmText: WELCOME_HTML,
        }),
      ),
    ).toBe(false);
  });

  it("net-new (new-from-base): stays required — exactly today's behavior", () => {
    expect(
      requiredWhen(
        ctx({
          instantiationMode: "new-from-base",
          baseDocProfile: FULL_PROFILE,
          baseWelcomeHtmText: WELCOME_HTML,
        }),
      ),
    ).toBe(true);
  });

  it("copy track (Track 1, no instantiation mode recorded): stays required", () => {
    expect(requiredWhen(ctx({ instantiationMode: null }))).toBe(true);
  });

  it("adapt track, base classified none: stays required", () => {
    expect(
      requiredWhen(
        ctx({
          instantiationMode: "adapt-existing",
          baseDocProfile: NONE_PROFILE,
        }),
      ),
    ).toBe(true);
  });
});

describe("pf_welcome_paragraph — validate() fixtures (unchanged)", () => {
  for (const fixture of mod.fixtures.valid) {
    it(`accepts: ${fixture.note ?? String(fixture.value)}`, () => {
      expect(validate(fixture.value)).toEqual({ ok: true });
    });
  }

  for (const fixture of mod.fixtures.invalid) {
    it(`rejects: ${fixture.note ?? String(fixture.value)}`, () => {
      const result = validate(fixture.value);
      expect(result.ok).toBe(false);
      if (!result.ok && fixture.expectedCode !== undefined) {
        expect(result.code).toBe(fixture.expectedCode);
      }
    });
  }
});
