// Spec 102 SC-004: the Layer C documentation checks report nothing against
// the documentation the forms produce. Each fixture keyboard is projected for
// output, with no answers and with every answer given, and the shipped
// package is linted exactly as a foreign package would be.

import { describe, expect, it, vi } from "vitest";
import { runDocChecks } from "@keymanapp/keyboard-lint";
import { createVirtualFS, type HelpDocsAnswers } from "@keyboard-studio/contracts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { collectDocLintInputFromVfs } from "./collectDocLintInputFromVfs.ts";
import { DOC_FIXTURES, type DocFixture } from "./docContent.fixtures.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const FULL_ANSWERS: HelpDocsAnswers = {
  description: "A keyboard for the fixture language.",
  usageTips: ["Use the right Alt key for extra letters."],
  credits: "Fixture authors.",
  contactInfo: "fixtures@example.org",
  projectHomeUrl: "https://example.org/fixture",
  projectHelpUrl: "https://example.org/fixture/help",
  docLanguageTags: ["en"],
  designRationale: "Mnemonic placement.",
  fontGuidance: "Any Unicode font.",
  knownLimitations: "None known.",
};

async function lintProjected(fixture: DocFixture, answers: HelpDocsAnswers | null) {
  const vfs = createVirtualFS([{ path: `source/${basicKbdus.id}.kmn`, content: fixture.kmn, isBinary: false }]);
  const wc = useWorkingCopyStore.getState();
  wc.instantiateFromStart(basicKbdus, { vfs, ir: fixture.ir });
  wc.setAttribution({ authorName: "Fixture Authors", copyrightHolder: "Fixture Authors" });
  wc.setTouchLayoutJson(fixture.touchLayoutJson);
  wc.setHelpDocs(answers);
  const projected = await projectWorkingCopyForOutput();
  expect(projected).not.toBeNull();
  const input = collectDocLintInputFromVfs(projected!.vfs, basicKbdus.id, basicKbdus.displayName);
  // All six members are present, so a clean result is a real pass, not an empty input.
  expect(Object.keys(input.members).sort()).toEqual(["help-php", "history-md", "license-md", "readme-htm", "readme-md", "welcome-htm"]);
  return runDocChecks(input);
}

describe.each(DOC_FIXTURES.map((f) => [f.id, f] as const))("Layer C docs checks on %s", (_id, fixture) => {
  it("report no findings with no answers", async () => {
    expect((await lintProjected(fixture, null)).findings.map((f) => `${f.code}: ${f.message}`)).toEqual([]);
  });

  it("report no findings with every answer given", async () => {
    expect((await lintProjected(fixture, FULL_ANSWERS)).findings.map((f) => `${f.code}: ${f.message}`)).toEqual([]);
  });
});
