// Shared per-question validators.
//
// Every validator a survey question module used to hand-write fell into one
// of these shapes: a bool Yes/No check, a required free-text check, a
// required-or-optional option-membership check. The only differences were
// the message strings and, for a few select questions, whether an array
// answer contributes its first element. Those differences are parameters
// here, so a module's validate() is one line that names its shape instead
// of a 10–15 line body duplicating it.
//
// Deliberately NOT here: project_keyboard_id (validateKeyboardId is real
// domain logic), track_choice (any non-option answer reports `required`,
// not `invalid_option`), and project_display_name (its array handling
// differs from the shared text check). Those three keep their own bodies.
//
// A validator is only exercised by the question-module contract suite;
// SurveyRunner gates on `required` + `format` directly, so these functions
// must keep the same codes (`required` / `invalid_option`) the contract
// pins, even though their messages are never surfaced in production.

import type { ValidationResult } from "../types.ts";

type AnswerValue = string | string[] | undefined;

type Validator = (value: AnswerValue) => ValidationResult;

/** Free text as a single trimmed string (array answers joined first). */
function asText(value: AnswerValue): string {
  return typeof value === "string"
    ? value.trim()
    : Array.isArray(value)
      ? value.join("").trim()
      : "";
}

/** A single answer, or the first element of an array answer. */
function asFirst(value: AnswerValue): string {
  return typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value[0] ?? ""
      : "";
}

/** A single answer, or "" for anything that is not a string. */
function asSingle(value: AnswerValue): string {
  return typeof value === "string" ? value : "";
}

/** Bool questions: only the strings "true" / "false" pass. */
export function makeBoolValidator(message: string): Validator {
  return (value: AnswerValue): ValidationResult => {
    const v = asSingle(value);
    if (v !== "true" && v !== "false") {
      return { ok: false, code: "required", message };
    }
    return { ok: true };
  };
}

/** Required free text: a blank (or whitespace-only) answer fails. */
export function makeRequiredTextValidator(message: string): Validator {
  return (value: AnswerValue): ValidationResult => {
    if (asText(value).length === 0) {
      return { ok: false, code: "required", message };
    }
    return { ok: true };
  };
}

/**
 * Required option question: blank fails with `required`, a value outside
 * `values` fails with `invalid_option`. `values` is normally the question's
 * own `definition.options` values, so the offered list is declared once.
 */
export function makeRequiredOptionValidator(
  values: readonly string[],
  requiredMessage: string,
  invalidMessage: (value: string) => string,
): Validator {
  const allowed = new Set(values);
  return (value: AnswerValue): ValidationResult => {
    const v = asSingle(value);
    if (!v) {
      return { ok: false, code: "required", message: requiredMessage };
    }
    if (!allowed.has(v)) {
      return { ok: false, code: "invalid_option", message: invalidMessage(v) };
    }
    return { ok: true };
  };
}

/** Like makeRequiredOptionValidator, but an array answer counts by its first element. */
export function makeRequiredFirstOptionValidator(
  values: readonly string[],
  requiredMessage: string,
  invalidMessage: (value: string) => string,
): Validator {
  const allowed = new Set(values);
  return (value: AnswerValue): ValidationResult => {
    const v = asFirst(value);
    if (v.length === 0) {
      return { ok: false, code: "required", message: requiredMessage };
    }
    if (!allowed.has(v)) {
      return { ok: false, code: "invalid_option", message: invalidMessage(v) };
    }
    return { ok: true };
  };
}

/**
 * Optional option question: blank passes, a value outside `values` fails
 * with `invalid_option` and a fixed message.
 */
export function makeOptionalOptionValidator(
  values: readonly string[],
  invalidMessage: string,
): Validator {
  const allowed = new Set(values);
  return (value: AnswerValue): ValidationResult => {
    const v = asSingle(value);
    if (v.length === 0) {
      return { ok: true };
    }
    if (!allowed.has(v)) {
      return { ok: false, code: "invalid_option", message: invalidMessage };
    }
    return { ok: true };
  };
}
