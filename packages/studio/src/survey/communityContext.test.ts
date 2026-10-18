// Unit tests for communityContext (issue #331) — derivation of the
// placement-proposal community context from the Phase B placement-habit
// answers. The contract under test: the author's own words, conservatively
// read — a layout family is reported ONLY when the text names it.

import { describe, it, expect } from "vitest";
import {
  deriveCommunityContext,
  communityContextFromAnswers,
} from "./communityContext.ts";
import type { SavedAnswer, StepAnswers } from "../steps/answerTypes.ts";

describe("deriveCommunityContext", () => {
  it("returns null when both answers are missing", () => {
    expect(deriveCommunityContext(undefined, undefined)).toBeNull();
  });

  it("returns null when both answers are blank or whitespace", () => {
    expect(deriveCommunityContext("", "   ")).toBeNull();
    expect(deriveCommunityContext(undefined, "")).toBeNull();
  });

  it("carries the author's verbatim answers, trimmed", () => {
    const ctx = deriveCommunityContext("  French AZERTY keyboard  ", "English US");
    expect(ctx).not.toBeNull();
    expect(ctx?.existingKeyboards).toBe("French AZERTY keyboard");
    expect(ctx?.coInstalledKeyboards).toBe("English US");
    expect(ctx?.facetId).toBe("community.muscle-memory");
  });

  it("detects the AZERTY family named in the existing-keyboards answer", () => {
    expect(deriveCommunityContext("French AZERTY keyboard", undefined)?.layoutFamily).toBe(
      "azerty",
    );
  });

  it("detects qwertz and qwerty, case-insensitively", () => {
    expect(deriveCommunityContext("a QWERTZ board", undefined)?.layoutFamily).toBe("qwertz");
    expect(deriveCommunityContext("standard qwerty", undefined)?.layoutFamily).toBe("qwerty");
  });

  it("falls back to the co-installed answer for the family when Q1 names none", () => {
    const ctx = deriveCommunityContext("an older Keyman keyboard", "French AZERTY, English US");
    expect(ctx?.layoutFamily).toBe("azerty");
  });

  it("prefers the family named in Q1 over one named in Q2", () => {
    const ctx = deriveCommunityContext("German QWERTZ", "French AZERTY");
    expect(ctx?.layoutFamily).toBe("qwertz");
  });

  it("reports the FIRST family named when one answer names two", () => {
    const ctx = deriveCommunityContext("moved from AZERTY to QWERTY", undefined);
    expect(ctx?.layoutFamily).toBe("azerty");
  });

  it("infers NOTHING from language or country names alone", () => {
    // "French" without "AZERTY" is not evidence of a layout family —
    // the derivation must not guess on the author's behalf.
    const ctx = deriveCommunityContext("French keyboard", "Arabic, Devanagari");
    expect(ctx).not.toBeNull();
    expect(ctx?.layoutFamily).toBeUndefined();
  });
});

function savedAnswer(value: unknown): SavedAnswer {
  return {
    value: value as SavedAnswer["value"],
    answerType: "text",
    origin: "confirmed",
    stage: "confirmed",
    evidenceKey: null,
    screenId: "characters",
    savedAt: 0,
  };
}

function stepAnswers(answers: Record<string, SavedAnswer>): StepAnswers {
  return { answers, position: null, status: { kind: "in-progress" }, lastRecorded: {} };
}

describe("communityContextFromAnswers", () => {
  it("returns null for a missing step", () => {
    expect(communityContextFromAnswers(undefined)).toBeNull();
  });

  it("reads the two pb_* answers out of the step's saved answers", () => {
    const ctx = communityContextFromAnswers(
      stepAnswers({
        pb_existing_keyboards: savedAnswer("French AZERTY keyboard"),
        pb_co_installed_keyboards: savedAnswer("English US"),
        pb_char_count: savedAnswer("42"),
      }),
    );
    expect(ctx?.existingKeyboards).toBe("French AZERTY keyboard");
    expect(ctx?.coInstalledKeyboards).toBe("English US");
    expect(ctx?.layoutFamily).toBe("azerty");
  });

  it("ignores non-textual answer values rather than coercing them", () => {
    const ctx = communityContextFromAnswers(
      stepAnswers({ pb_existing_keyboards: savedAnswer(42) }),
    );
    expect(ctx).toBeNull();
  });
});
