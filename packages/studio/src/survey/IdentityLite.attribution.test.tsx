// Attribution capture through the REAL identity-lite flow (spec 064 US1).
//
// Covers: answers -> IdentityLiteResult.attribution, the D1 blank-holder default,
// and the two negative paths that matter — a gated script is never asked who
// holds the copyright, and a profile with no name yields no pre-fill (a login
// handle must never stand in as a copyright holder).
//
// NOT covered here: pre-filling on a FRESH walk. These tests use `resume` to
// reach the attribution questions without driving the langtags autocomplete, and
// resume deliberately does not re-seed — buildResumeStack replays recorded
// answers and never calls getSeedValue. The fresh-walk seed goes through
// SurveyRunner's push-time path, the same mechanism already covered for
// il_language_code / il_language_autonym.

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
// Swap only `render` (../test/renderWithI18n.tsx): the flow-step chrome calls
// useLingui(), which throws without an <I18nProvider> ancestor.
import { render } from "../test/renderWithI18n.tsx";
import React from "react";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { IdentityLite, type IdentityLiteResult } from "./IdentityLite.tsx";

afterEach(cleanup);

/** Answers for a completed run, so `resume` mounts on the final question. */
function completedThrough(script: string): SurveyPhaseResult {
  return {
    phase: "A",
    answers: [
      { questionId: "il_language_english", answerType: "text", value: "Hausa" },
      { questionId: "il_language_autonym", answerType: "text", value: "Hausa" },
      { questionId: "il_language_code", answerType: "text", value: "ha" },
      { questionId: "il_target_script", answerType: "select", value: script },
    ],
  };
}

function finish(): void {
  fireEvent.click(screen.getByTestId("survey-advance"));
}

function type(value: string): void {
  fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value } });
}

describe("identity-lite attribution capture (spec 064 US1)", () => {
  // Resume lands on the first UNANSWERED question (il_author_name) and does NOT
  // re-seed it: buildResumeStack replays recorded answers directly and never
  // calls getSeedValue. That is the "author override is preserved" guarantee — a
  // field the author previously cleared must not silently refill on reload.
  //
  // Pre-filling on a FRESH walk goes through SurveyRunner's push-time seed, the
  // same mechanism already covered for il_language_code / il_language_autonym.
  it("resume lands on the author question WITHOUT re-seeding it", () => {
    render(
      <IdentityLite
        onComplete={vi.fn()}
        resume={completedThrough("Latn")}
        authorSeed={{ name: "Alice Example", email: "alice@example.org" }}
      />,
    );
    expect(screen.getByText("Is this the right name to credit for this keyboard?")).toBeTruthy();
    expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toBe("");
  });

  it("carries the confirmed values into IdentityLiteResult.attribution", () => {
    const onComplete = vi.fn<[SurveyPhaseResult, IdentityLiteResult], void>();
    render(
      <IdentityLite
        onComplete={onComplete}
        resume={completedThrough("Latn")}
        authorSeed={{ name: "Alice Example", email: "alice@example.org" }}
      />,
    );
    type("Alice Example");
    finish();
    type("alice@example.org");
    finish();
    finish(); // leave the copyright holder blank -> defaults to the author (D1)

    expect(onComplete).toHaveBeenCalledTimes(1);
    const [, identity] = onComplete.mock.calls[0]!;
    expect(identity.attribution).toEqual({
      authorName: "Alice Example",
      authorEmail: "alice@example.org",
      // D1: blank holder means "same as the author", not a missing answer.
      copyrightHolder: "Alice Example",
    });
  });

  it("uses an explicitly entered copyright holder over the author name", () => {
    const onComplete = vi.fn<[SurveyPhaseResult, IdentityLiteResult], void>();
    render(
      <IdentityLite
        onComplete={onComplete}
        resume={completedThrough("Latn")}
        authorSeed={{ name: "Alice Example", email: "alice@example.org" }}
      />,
    );
    type("Alice Example");
    finish();
    type("alice@example.org");
    finish();
    type("Hausa Language Committee");
    finish();

    const [, identity] = onComplete.mock.calls[0]!;
    expect(identity.attribution?.copyrightHolder).toBe("Hausa Language Committee");
    expect(identity.attribution?.authorName).toBe("Alice Example");
  });

  // A handle is not a copyright holder. With no profile name the field must be
  // empty so the author supplies one (D7).
  it("does NOT pre-fill anything when the profile has no name", () => {
    render(
      <IdentityLite
        onComplete={vi.fn()}
        resume={completedThrough("Latn")}
        authorSeed={{ name: null, email: null }}
      />,
    );
    const box = screen.getAllByRole("textbox")[0] as HTMLInputElement;
    expect(box.value).toBe("");
  });

  it("works with no authorSeed at all (guest)", () => {
    render(<IdentityLite onComplete={vi.fn()} resume={completedThrough("Latn")} />);
    const box = screen.getAllByRole("textbox")[0] as HTMLInputElement;
    expect(box.value).toBe("");
  });

  // A gated script cannot produce a keyboard, so the author is never asked who
  // owns one. il_target_script's conditional branch terminates first.
  it("never asks a gated-script author for attribution", () => {
    const onComplete = vi.fn<[SurveyPhaseResult, IdentityLiteResult], void>();
    render(
      <IdentityLite
        onComplete={onComplete}
        resume={completedThrough("Ethi")}
        authorSeed={{ name: "Alice Example", email: "alice@example.org" }}
      />,
    );
    expect(screen.queryByText("Who holds the copyright, if not you?")).toBeNull();
    expect(screen.queryByDisplayValue("Alice Example")).toBeNull();
  });

  it("reports attribution null for a gated script", () => {
    const onComplete = vi.fn<[SurveyPhaseResult, IdentityLiteResult], void>();
    render(
      <IdentityLite
        onComplete={onComplete}
        resume={completedThrough("Ethi")}
        authorSeed={{ name: "Alice Example" }}
      />,
    );
    finish();
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [, identity] = onComplete.mock.calls[0]!;
    expect(identity.supported).toBe(false);
    expect(identity.attribution).toBeNull();
  });
});
