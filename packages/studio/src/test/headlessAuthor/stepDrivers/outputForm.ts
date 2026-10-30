// Case choices for the marks series' treatment, output-form and backspace
// stations, and the walk policy's pick for each.
//
// The product proposes each answer from the one before it: the output form
// from the input order, the backspace from the output form. The lift
// (marksStationDefaults) takes the case's choices as overrides and re-resolves
// every later station from them, so each answer here is read from the
// proposals the product makes given the choices already taken, never
// re-derived. Used by marks.ts; not a step of its own.

import type { BackspaceBehaviour, MarkInputOrder } from "@keyboard-studio/contracts";
import type { OutputForm } from "@keyboard-studio/engine";
import { marksStationDefaults, type MarksStationDefaultsInput } from "../../../survey/marks/marksSeriesValue.ts";
import type { Case } from "../caseTypes.ts";
import { chooseByPolicy } from "../walkPolicy.ts";
import type { DriverContext, StepDrivers } from "./types.ts";

export type MarksAnswerOverrides = NonNullable<MarksStationDefaultsInput["overrides"]>;

const SOURCE = "marksStationDefaults";

const INPUT_ORDERS: readonly MarkInputOrder[] = ["prefix", "postfix"];
const OUTPUT_FORMS: readonly OutputForm[] = ["ready-made", "base-plus-mark"];
const BACKSPACES: readonly BackspaceBehaviour[] = ["peel", "whole-stack"];
/** The harness writes the backspace choice in its own words; these are the product's. */
const BACKSPACE_FROM_CASE: Readonly<Record<string, BackspaceBehaviour>> = {
  whole: "whole-stack",
  unwrap: "peel",
};

function fromCase<T extends string>(field: string, value: string, allowed: readonly T[], aliases: Readonly<Record<string, T>> = {}): T {
  const mapped = aliases[value] ?? value;
  const hit = allowed.find((a) => a === mapped);
  if (hit === undefined) throw new Error(`case field "${field}": "${value}" is not one of ${allowed.join(", ")}`);
  return hit;
}

/**
 * Walk the three answers in the product's order. A case choice is an override;
 * otherwise the product's own proposal for that station, given the choices
 * already taken, is what the author accepts. Returns the overrides to hand the
 * lift (only the case's own choices) after reporting each pick.
 */
export function chooseMarksAnswers(
  ctx: DriverContext,
  base: Omit<MarksStationDefaultsInput, "overrides" | "showToleranceStation">,
  show: Pick<MarksStationDefaultsInput, "showToleranceStation">,
): MarksAnswerOverrides {
  const c: Case = ctx.case;
  const overrides: MarksAnswerOverrides = {};
  const proposed = (o: MarksAnswerOverrides) => marksStationDefaults({ ...base, ...show, overrides: o }).state;

  const order = chooseByPolicy<MarkInputOrder>({
    decisionId: "marks.input_order",
    override: fromCase("inputOrder", c.inputOrder, INPUT_ORDERS),
    suggestions: [],
    defaultValue: proposed(overrides).inputOrder,
    proposalSource: SOURCE,
  });
  ctx.report.addStep(order);
  if (order.rule === "override") overrides.inputOrder = order.value;

  const form = chooseByPolicy<OutputForm>({
    decisionId: "marks.output_form",
    override: fromCase("outputForm", c.outputForm, OUTPUT_FORMS),
    suggestions: [proposed(overrides).outputForm],
    proposalSource: SOURCE,
  });
  ctx.report.addStep(form);
  if (form.rule === "override") overrides.outputForm = form.value;

  const backspace = chooseByPolicy<BackspaceBehaviour>({
    decisionId: "marks.backspace",
    override: fromCase("backspace", c.backspace, BACKSPACES, BACKSPACE_FROM_CASE),
    suggestions: [proposed(overrides).backspace],
    proposalSource: SOURCE,
  });
  ctx.report.addStep(backspace);
  if (backspace.rule === "override") overrides.backspace = backspace.value;

  return overrides;
}

export const outputFormDrivers: StepDrivers = {};
