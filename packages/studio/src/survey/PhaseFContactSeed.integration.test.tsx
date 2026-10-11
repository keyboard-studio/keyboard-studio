// Integration test: PhaseFStepFactoryComponent with the REAL SurveyRunner.
//
// Verifies the pf_contact_info pre-fill END TO END (spec 064 FR-016) rather than
// at the options-record boundary: the seed must travel
//   surveyContext.author_contact
//     -> phaseFOptions.seeds.getSeedValue
//     -> makeFlowStepComponent
//     -> FlowStepHost
//     -> SurveyRunner
//     -> the rendered input's value
//
// Before this feature phaseFOptions declared no `seeds`, so no getSeedValue was
// passed to SurveyRunner at all. The "no author_contact" case below pins that
// today's behaviour is unchanged until the attribution producer exists.
//
// Walks the real DEFAULT Phase F path (gate answered No), using the real
// the real derived phase_f_helpdocs flow. No mocks.

import { describe, it, expect, afterEach } from "vitest";
import { screen, fireEvent, act, cleanup } from "@testing-library/react";
// Swap only `render` (../test/renderWithI18n.tsx): the flow-step chrome calls
// useLingui(), which throws without an <I18nProvider> ancestor.
import { render } from "../test/renderWithI18n.tsx";
import { PhaseFStepFactoryComponent } from "../editors/adapters/flowStepOptions.tsx";
import { useDecisionStore } from "../stores/decisionStore.ts";

afterEach(() => {
  cleanup();
});

const CONTACT = "info@bafutliteracy.org";

function next(): void {
  const btn = screen.getByRole("button", { name: /next|continue|finish|done/i });
  act(() => {
    fireEvent.click(btn);
  });
}

function typeInto(value: string): void {
  const box = screen.getAllByRole("textbox")[0]!;
  act(() => {
    fireEvent.change(box, { target: { value } });
  });
}

/**
 * Walk the default path to pf_contact_info and return its rendered value.
 *
 * Default path (6 screens): pf_welcome_paragraph -> pf_usage_tip_1 ->
 * pf_history_entry (spec 080 US5, left undecided) -> pf_more_detail_gate
 * (No) -> pf_credits -> pf_contact_info.
 */
function walkToContactField(ctx: Record<string, string | undefined>): string {
  // Spec 089: the factory derives its context from the decision store —
  // author_contact comes from the recorded author-email decision, and the
  // context exists only once the identity decisions are recorded (Phase F
  // is never reached before identity completes in the real flow either).
  {
    const record = useDecisionStore.getState().record;
    record({ id: "language-name", value: "Bafut", provenance: "asked" });
    record({ id: "language-autonym", value: "Bafut", provenance: "asked" });
    record({ id: "language-code", value: "bfd", provenance: "asked" });
    record({ id: "target-script", value: "Latn", provenance: "asked" });
    record({ id: "author-name", value: "Bafut Literacy", provenance: "asked" });
    if (ctx.author_contact !== undefined) {
      record({ id: "author-email", value: ctx.author_contact, provenance: "asked" });
    }
  }
  render(<PhaseFStepFactoryComponent onComplete={() => {}} />, { withStepNav: true });

  // 1. pf_welcome_paragraph — required, so it must be filled to advance.
  typeInto("A keyboard for typing Bafut.");
  next();

  // 2. pf_usage_tip_1 — optional, leave blank.
  next();

  // 3. pf_history_entry — optional, leave undecided (stays "proposed").
  next();

  // 4. pf_more_detail_gate — answer No to take the minimum path.
  const no = screen.getByRole("radio", { name: /^no$/i });
  act(() => {
    fireEvent.click(no);
  });
  next();

  // 5. pf_credits — optional, leave blank.
  next();

  // 6. pf_contact_info — the field under test.
  const contactBox = screen.getAllByRole("textbox")[0]!;
  return (contactBox as HTMLInputElement | HTMLTextAreaElement).value;
}

describe("Phase F — pf_contact_info pre-fill (end to end)", () => {
  it("pre-fills the contact field from surveyContext.author_contact", () => {
    expect(walkToContactField({ author_contact: CONTACT })).toBe(CONTACT);
  });

  // Inert-today guarantee: nothing writes author_contact until spec 064 lands,
  // so the field must render empty exactly as it does now.
  it("renders an empty contact field when author_contact is absent", () => {
    expect(walkToContactField({})).toBe("");
  });

  it("renders an empty contact field rather than seeding a blank string", () => {
    expect(walkToContactField({ author_contact: "" })).toBe("");
  });

  // Pre-filled is not required: the author can clear the seeded value and still
  // finish, which is the whole point of keeping the question optional.
  it("lets the author clear the pre-filled value and still complete the flow", () => {
    let completed = false;
    {
      const record = useDecisionStore.getState().record;
      record({ id: "language-name", value: "Bafut", provenance: "asked" });
      record({ id: "language-autonym", value: "Bafut", provenance: "asked" });
      record({ id: "language-code", value: "bfd", provenance: "asked" });
      record({ id: "target-script", value: "Latn", provenance: "asked" });
      record({ id: "author-name", value: "Bafut Literacy", provenance: "asked" });
      record({ id: "author-email", value: CONTACT, provenance: "asked" });
    }
    render(
      <PhaseFStepFactoryComponent
        onComplete={() => {
          completed = true;
        }}
      />, { withStepNav: true },
    );

    typeInto("A keyboard for typing Bafut.");
    next(); // pf_welcome_paragraph
    next(); // pf_usage_tip_1
    next(); // pf_history_entry (spec 080 US5, left undecided)
    const no = screen.getByRole("radio", { name: /^no$/i });
    act(() => {
      fireEvent.click(no);
    });
    next(); // pf_more_detail_gate
    next(); // pf_credits

    // Seeded, then cleared by the author.
    expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toBe(CONTACT);
    typeInto("");
    next();

    expect(completed, "clearing an optional pre-filled field must not block completion").toBe(true);
  });
});
