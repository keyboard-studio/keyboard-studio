// Per-question module: pb_discovery_intro (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_discovery_intro",
  prompt: "How would you like to tell us which characters your language uses?",
  help_text:
    "There are several ways to build your character list. You can answer the " +
    "questions below one by one, paste a paragraph of text in your language " +
    "so we harvest the characters automatically, confirm a list we suggest " +
    "based on your language, or browse a grid and tick the characters you " +
    "need. All of these feed the same final list -- you can use more than one " +
    "method. Choose your preferred starting point, or pick \"Step by step\" to " +
    "begin the guided questions.",
  type: "radio" as const,
  required: true,
  options: [
    {
      value: "manual",
      label: "Step by step -- I will answer the questions below",
    },
    {
      value: "text-sample",
      label:
        "Paste a text sample -- we will extract the characters from it",
    },
    {
      value: "linguist",
      label:
        "Show me a suggested list based on my language ({{language_name}})",
    },
    {
      value: "picker",
      label: "Browse a character grid and tick what I need",
    },
  ],
  next: [
    { condition: "value == 'text-sample'", goto: "pb_text_sample" },
    { condition: "value == 'linguist'", goto: "pb_linguist_confirm" },
    { condition: "value == 'picker'", goto: "pb_picker_confirm" },
    { default: true, goto: "pb_routing_branch" },
  ],
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["manual", "text-sample", "linguist", "picker"]);

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return { ok: false, code: "required", message: "Please choose a method." };
  }
  if (!VALID_VALUES.has(v)) {
    return {
      ok: false,
      code: "invalid_option",
      message: `"${v}" is not a valid choice.`,
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "manual", note: "step by step" },
    { value: "text-sample", note: "paste text" },
    { value: "linguist", note: "linguist list" },
    { value: "picker", note: "visual picker" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "unknown", expectedCode: "invalid_option" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;
