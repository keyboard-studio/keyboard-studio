// Spec 111 FR-018a: missing expected letters are grouped by the language that
// expects them, and a language can be dropped from the keyboard instead.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";

import { groupMissingByLanguage, MissingLettersByLanguage } from "./MissingLettersByLanguage.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";

const sources = { "è": ["ht"], "ā": ["to"], "ʻ": ["to", "uz"] };

describe("groupMissingByLanguage", () => {
  it("lists each missing letter under every language that expects it, in list order", () => {
    expect(groupMissingByLanguage(["ʻ", "è", "ā"], sources, ["en", "ht", "to", "uz"])).toEqual([
      { tag: "ht", chars: ["è"] },
      { tag: "to", chars: ["ʻ", "ā"] },
      { tag: "uz", chars: ["ʻ"] },
    ]);
  });
});

describe("MissingLettersByLanguage", () => {
  beforeEach(() => {
    useDecisionStore.getState().reset();
    useWorkingCopyStore.getState().setIdentity({
      languages: [{ tag: "en", name: "English" }, { tag: "ht", name: "Haitian" }, { tag: "to", name: "Tongan" }],
    });
  });
  afterEach(cleanup);

  it("names the language and removes it from the keyboard's list", () => {
    render(<MissingLettersByLanguage missing={["è", "ā"]} sourcesByChar={sources} />);
    expect(screen.getByTestId("missing-letters-to").textContent).toContain("Tongan (to)");

    fireEvent.click(screen.getByRole("button", { name: /Remove Tongan \(to\)/ }));

    const tags = (useWorkingCopyStore.getState().identity?.languages ?? []).map((l) => l.tag);
    expect(tags).toEqual(["en", "ht"]);
    const recorded = useDecisionStore.getState().decisions["language-list"]?.value as { tag: string }[];
    expect(recorded.map((l) => l.tag)).toEqual(["en", "ht"]);
  });
});
