// bodyParity — issue #2530: the 11.9 question's liveness, snippets, and
// vocabulary mappings, plus the parity pin: the helper's liveness must
// agree with the real 11.9 check over the same inputs, so a future change
// to the check's comparison cannot silently strand (or wrongly ask) the
// question.

import { describe, it, expect } from "vitest";
import type { DocLintInput } from "@keyboard-studio/contracts";
import { checkBodyParity } from "@keymanapp/keyboard-lint";
import {
  bodyParityAnswerToBodySync,
  bodyParitySnippets,
  bodyWindowToPlainText,
  firstBodyDifference,
  isBodyParityLive,
  legacyBodyParityAnswer,
  type BodyParityInputs,
} from "./bodyParity.ts";

const WELCOME = "<html><body><p>Welcome to Test Keyboard</p></body></html>";
const HELP_SAME =
  "<?php\n  $pagename = 'Test Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<p>Welcome to Test Keyboard</p>";
const HELP_DIFFERENT =
  "<?php\n  $pagename = 'Test Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<html><body><p>Something totally different.</p></body></html>";
// The US Basic shape from the issue: a welcome-only title plus an inline
// style attribute on the help page's first paragraph.
const WELCOME_TITLED =
  "<html><head><title>Start Using US Basic</title></head><body><h1>Start Using US Basic</h1><p>This keyboard is designed for the English language.</p></body></html>";
const HELP_STYLED =
  "<?php\n  $pagename = 'US Basic Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<p style='margin: 16px 0 0 0'>This keyboard is designed for the English language.</p>";

function inputs(overrides: Partial<BodyParityInputs> = {}): BodyParityInputs {
  return {
    instantiationMode: "adapt-existing",
    startWelcomeHtmText: WELCOME,
    startHelpPhpText: HELP_DIFFERENT,
    docFixProposals: null,
    ...overrides,
  };
}

describe("isBodyParityLive", () => {
  it("is live when the inherited pages differ on the adapt track", () => {
    expect(isBodyParityLive(inputs())).toBe(true);
  });

  it("is not live when the inherited pages match", () => {
    expect(isBodyParityLive(inputs({ startHelpPhpText: HELP_SAME }))).toBe(false);
  });

  it("is not live on the copy track even when the slices differ", () => {
    expect(isBodyParityLive(inputs({ instantiationMode: "new-from-base" }))).toBe(false);
    expect(isBodyParityLive(inputs({ instantiationMode: null }))).toBe(false);
  });

  it("is not live when either page is absent", () => {
    expect(isBodyParityLive(inputs({ startWelcomeHtmText: null }))).toBe(false);
    expect(isBodyParityLive(inputs({ startHelpPhpText: null }))).toBe(false);
  });

  it("stays live for a recorded legacy answer even when the pages now match", () => {
    expect(
      isBodyParityLive(
        inputs({
          startHelpPhpText: HELP_SAME,
          docFixProposals: { bodySync: "declined" },
        }),
      ),
    ).toBe(true);
  });

  it("stays live for a recorded decision even when the pages now match", () => {
    expect(
      isBodyParityLive(
        inputs({ startHelpPhpText: HELP_SAME, bodyParityDecision: "keep-different" }),
      ),
    ).toBe(true);
  });
});

describe("legacyBodyParityAnswer / bodyParityAnswerToBodySync", () => {
  it("maps the legacy slice onto the new answer vocabulary", () => {
    expect(legacyBodyParityAnswer({ bodySync: "welcome" })).toBe("welcome");
    expect(legacyBodyParityAnswer({ bodySync: "help" })).toBe("help");
    expect(legacyBodyParityAnswer({ bodySync: "declined" })).toBe("keep-different");
    expect(legacyBodyParityAnswer({ pagename: "accepted" })).toBeUndefined();
    expect(legacyBodyParityAnswer(null)).toBeUndefined();
  });

  it("maps the new answers back onto the slice vocabulary", () => {
    expect(bodyParityAnswerToBodySync("welcome")).toBe("welcome");
    expect(bodyParityAnswerToBodySync("help")).toBe("help");
    expect(bodyParityAnswerToBodySync("keep-different")).toBe("declined");
    expect(bodyParityAnswerToBodySync("declined")).toBeUndefined();
    expect(bodyParityAnswerToBodySync(undefined)).toBeUndefined();
  });
});

describe("bodyParitySnippets", () => {
  it("shows the first difference as plain text, never raw HTML", () => {
    const snippets = bodyParitySnippets(inputs());
    expect(snippets.welcome).toContain("Welcome to Test Keyboard");
    expect(snippets.help).toContain("Something totally different");
    expect(snippets.welcome).not.toContain("<");
    expect(snippets.help).not.toContain("<");
  });

  it("keeps the welcome-only title visible in the welcome snippet (US Basic shape)", () => {
    const snippets = bodyParitySnippets(
      inputs({ startWelcomeHtmText: WELCOME_TITLED, startHelpPhpText: HELP_STYLED }),
    );
    expect(snippets.welcome).toContain("Start Using US Basic");
    expect(snippets.help).toContain("This keyboard is designed for the English language");
    expect(snippets.welcome).not.toContain("<");
    expect(snippets.help).not.toContain("<");
  });

  it("is empty when the question is not live", () => {
    expect(bodyParitySnippets(inputs({ startHelpPhpText: HELP_SAME }))).toEqual({
      welcome: "",
      help: "",
    });
    expect(bodyParitySnippets(inputs({ instantiationMode: "new-from-base" }))).toEqual({
      welcome: "",
      help: "",
    });
  });
});

describe("bodyWindowToPlainText / firstBodyDifference", () => {
  it("strips tags and collapses whitespace", () => {
    expect(bodyWindowToPlainText("<p style='margin: 0'>  Hello   <b>world</b></p>")).toBe(
      "Hello world",
    );
  });

  it("windows the first divergence with leading context", () => {
    const difference = firstBodyDifference("aaaXXXbbb", "aaaYYYbbb");
    expect(difference.welcome).toContain("XXX");
    expect(difference.help).toContain("YYY");
  });
});

describe("liveness agrees with the real 11.9 check", () => {
  function lintInput(welcome: string, help: string): DocLintInput {
    return {
      keyboardId: "test_kbd",
      keyboardVersion: "1.2",
      targets: ["windows"],
      layerIds: ["default"],
      displayName: "Test Keyboard",
      copyrightHolders: {},
      members: { "welcome-htm": welcome, "help-php": help },
      deletedFilenames: [],
    };
  }

  it.each([
    ["differing bodies", WELCOME, HELP_DIFFERENT, true],
    ["matching bodies", WELCOME, HELP_SAME, false],
    ["US Basic shape (title + style attr)", WELCOME_TITLED, HELP_STYLED, true],
  ])("%s: helper live === check fails", (_name, welcome, help, live) => {
    expect(isBodyParityLive(inputs({ startWelcomeHtmText: welcome, startHelpPhpText: help }))).toBe(
      live,
    );
    const check = checkBodyParity(lintInput(welcome, help));
    expect(check.findings.some((f) => f.code === "KM_LINT_PHP_HTM_BODY_MISMATCH")).toBe(live);
  });
});
