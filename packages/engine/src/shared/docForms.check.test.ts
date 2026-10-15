// The forms check (spec 095 FR-026, FR-028, FR-029). The forms are
// content-owned data in @keyboard-studio/contracts, but the parser and the slot
// vocabulary live in the engine, so the check runs here. Every failure names
// the form it came from.

import { DOC_FORMS, type DocFormId } from "@keyboard-studio/contracts";
import { describe, expect, it } from "vitest";
import { DOC_SLOT_IDS } from "./docSlots.js";
import { parseDocForm } from "./renderDocForm.js";

const FORM_IDS = Object.keys(DOC_FORMS.forms) as DocFormId[];
const KNOWN_SLOTS = new Set<string>(DOC_SLOT_IDS);

/** The slot ids a form references; parse errors carry the form id. */
function slotsOf(formId: DocFormId): string[] {
  return parseDocForm(DOC_FORMS.forms[formId], formId);
}

/** The forms that reference `slot`. */
function formsUsing(slot: string): DocFormId[] {
  return FORM_IDS.filter((id) => slotsOf(id).includes(slot));
}

describe("DOC_FORMS check", () => {
  it("covers all seven forms", () => {
    expect([...FORM_IDS].sort()).toEqual(["body", "help", "history", "license", "readmeHtm", "readmeMd", "welcome"]);
  });

  it.each(FORM_IDS)("form %s parses", (formId) => {
    expect(() => slotsOf(formId), `form "${formId}" does not parse`).not.toThrow();
  });

  it.each(FORM_IDS)("form %s references only known slots", (formId) => {
    const unknown = slotsOf(formId).filter((slot) => !KNOWN_SLOTS.has(slot));
    expect(unknown, `form "${formId}" references unknown slots: ${unknown.join(", ")}`).toEqual([]);
  });

  it("places {{version}} only in the history form", () => {
    const using = formsUsing("version");
    expect(using, `{{version}} appears in forms: ${using.join(", ")}`).toEqual(["history"]);
  });

  it("places {{year}} only in the license form", () => {
    const using = formsUsing("year");
    expect(using, `{{year}} appears in forms: ${using.join(", ")}`).toEqual(["license"]);
  });

  it("keeps typingGuide out of the readmeMd form", () => {
    expect(slotsOf("readmeMd"), `form "readmeMd" references typingGuide`).not.toContain("typingGuide");
  });
});
