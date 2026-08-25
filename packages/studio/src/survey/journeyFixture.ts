// Journey fixture schema — spec 032 (journey corpus).
//
// A "journey" is a hand-authored, replayable trace of a whole user workflow
// (persona metadata + an ordered list of survey answers / editor-action
// summaries + the outcomes a replay must reach). Stored as YAML under
// content/journeys/, parsed here into the JourneyFixture shape journey-runner.ts
// consumes.
//
// FR-001/FR-002 (spec 032): journey_id is deliberately NOT flow_id — a journey
// spans the whole manifest spine, not one flow template. Two event shapes:
//   (a) survey-answer   {stepId, questionId, value}
//   (b) editor-action    {stepId, action_type, summary} — carve/mechanisms/touch
//       gallery loops, recorded VERBATIM (FR-015 — no per-key decomposition).
//
// The parser fails loudly on a malformed fixture, mirroring loadModularFlow.ts's
// parseThinYaml error-message style (descriptive `Error`, no silent coercion).

import { parse } from "yaml";
import type { KeyboardIR } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------

export interface JourneyPersona {
  language: string;
  script: string;
  /** May be inferred rather than author-declared (e.g. derived from identity). */
  routing_group?: string;
  /** Real keyboard id — Track 2 (adapt) fixtures only. */
  source_keyboard?: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const EDITOR_ACTION_TYPES = new Set(["gallery_edit", "mechanism_edit", "touch_edit"]);
export type EditorActionType = "gallery_edit" | "mechanism_edit" | "touch_edit";

/** FR-002(a) — a survey-answer event: apply one answer to one question. */
export interface JourneySurveyAnswerEvent {
  stepId: string;
  questionId: string;
  value: string | string[];
}

/**
 * FR-002(b) — an editor-action summary event: a carve/mechanisms/touch gallery
 * loop, recorded verbatim (no per-key decomposition — FR-015 hard non-goal).
 */
export interface JourneyEditorActionEvent {
  stepId: string;
  action_type: EditorActionType;
  summary: string;
}

export type JourneyEvent = JourneySurveyAnswerEvent | JourneyEditorActionEvent;

export function isEditorActionEvent(e: JourneyEvent): e is JourneyEditorActionEvent {
  return "action_type" in e;
}

export function isSurveyAnswerEvent(e: JourneyEvent): e is JourneySurveyAnswerEvent {
  return "questionId" in e;
}

// ---------------------------------------------------------------------------
// Backtrack events (FR-005 / T007)
// ---------------------------------------------------------------------------

export interface JourneyBacktrackEvent {
  /** The manifest step id being revisited (must already appear in `events`). */
  revisit_step: string;
  new_answer: { questionId: string; value: string | string[] };
  /** Step ids the fixture author expects to go stale and re-derive. Advisory —
   *  the harness always reports what it actually observed; this is asserted
   *  against when present, not required. */
  expected_staleness?: string[];
}

// ---------------------------------------------------------------------------
// JourneyFixture
// ---------------------------------------------------------------------------

export interface JourneyFixture {
  journey_id: string;
  persona: JourneyPersona;
  events: JourneyEvent[];
  expected_outcomes: {
    routing_group?: string;
    strategy?: string;
    [key: string]: unknown;
  };
  backtrack_events?: JourneyBacktrackEvent[];
}

// ---------------------------------------------------------------------------
// ReplayResult (T004) — produced by journey-runner.ts's replayJourney().
// Declared here (colocated with the fixture types) per tasks.md T004.
// ---------------------------------------------------------------------------

export interface ReplayResult {
  journeyId: string;
  /** Manifest step ids visited, in visit order (duplicates possible after a backtrack). */
  exercisedStepIds: string[];
  /** `"${from}->${to}"` manifest step-graph edges traversed, in traversal order. */
  exercisedEdges: string[];
  finalIR: KeyboardIR | null;
  assertionsPassed: boolean;
  errors?: string[];
}

// ---------------------------------------------------------------------------
// Parser / validator
// ---------------------------------------------------------------------------

function fail(message: string): never {
  throw new Error(`journeyFixture: ${message}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parsePersona(v: unknown): JourneyPersona {
  if (!isRecord(v)) fail("persona must be an object");
  if (typeof v["language"] !== "string" || v["language"].length === 0) {
    fail("persona.language must be a non-empty string");
  }
  if (typeof v["script"] !== "string" || v["script"].length === 0) {
    fail("persona.script must be a non-empty string");
  }
  const persona: JourneyPersona = {
    language: v["language"] as string,
    script: v["script"] as string,
  };
  if (v["routing_group"] !== undefined) {
    if (typeof v["routing_group"] !== "string") fail("persona.routing_group must be a string if present");
    persona.routing_group = v["routing_group"] as string;
  }
  if (v["source_keyboard"] !== undefined) {
    if (typeof v["source_keyboard"] !== "string") fail("persona.source_keyboard must be a string if present");
    persona.source_keyboard = v["source_keyboard"] as string;
  }
  return persona;
}

function parseValue(v: unknown, where: string): string | string[] {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v as string[];
  fail(`${where}: value must be a string or string[] (got ${JSON.stringify(v)})`);
}

function parseEvent(v: unknown, index: number): JourneyEvent {
  const where = `events[${index}]`;
  if (!isRecord(v)) fail(`${where} must be an object`);
  if (typeof v["stepId"] !== "string" || v["stepId"].length === 0) {
    fail(`${where}.stepId must be a non-empty string`);
  }
  const stepId = v["stepId"] as string;

  if (v["action_type"] !== undefined) {
    if (typeof v["action_type"] !== "string" || !EDITOR_ACTION_TYPES.has(v["action_type"])) {
      fail(`${where}.action_type must be one of gallery_edit | mechanism_edit | touch_edit`);
    }
    if (typeof v["summary"] !== "string" || v["summary"].length === 0) {
      fail(`${where}.summary must be a non-empty string`);
    }
    return {
      stepId,
      action_type: v["action_type"] as EditorActionType,
      summary: v["summary"] as string,
    };
  }

  if (typeof v["questionId"] !== "string" || v["questionId"].length === 0) {
    fail(`${where} must carry either action_type+summary or a non-empty questionId`);
  }
  const value = parseValue(v["value"], `${where}.value`);
  return { stepId, questionId: v["questionId"] as string, value };
}

function parseBacktrackEvent(v: unknown, index: number): JourneyBacktrackEvent {
  const where = `backtrack_events[${index}]`;
  if (!isRecord(v)) fail(`${where} must be an object`);
  if (typeof v["revisit_step"] !== "string" || v["revisit_step"].length === 0) {
    fail(`${where}.revisit_step must be a non-empty string`);
  }
  const rawNewAnswer = v["new_answer"];
  if (!isRecord(rawNewAnswer)) fail(`${where}.new_answer must be an object`);
  if (typeof rawNewAnswer["questionId"] !== "string" || rawNewAnswer["questionId"].length === 0) {
    fail(`${where}.new_answer.questionId must be a non-empty string`);
  }
  const value = parseValue(rawNewAnswer["value"], `${where}.new_answer.value`);
  const bt: JourneyBacktrackEvent = {
    revisit_step: v["revisit_step"] as string,
    new_answer: { questionId: rawNewAnswer["questionId"] as string, value },
  };
  if (v["expected_staleness"] !== undefined) {
    if (
      !Array.isArray(v["expected_staleness"]) ||
      !v["expected_staleness"].every((x) => typeof x === "string")
    ) {
      fail(`${where}.expected_staleness must be a string[] if present`);
    }
    bt.expected_staleness = v["expected_staleness"] as string[];
  }
  return bt;
}

/**
 * Parse a journey fixture YAML string into a validated JourneyFixture. Throws
 * descriptively on any structural violation (mirrors loadModularFlow.ts's
 * parseThinYaml error style) — a malformed fixture must fail loudly, not
 * silently coerce or drop fields.
 */
export function parseJourneyFixture(raw: string): JourneyFixture {
  const parsed = parse(raw) as unknown;
  if (!isRecord(parsed)) fail("YAML root must be an object");

  if (typeof parsed["journey_id"] !== "string" || parsed["journey_id"].length === 0) {
    fail("missing or empty journey_id");
  }

  const persona = parsePersona(parsed["persona"]);

  if (!Array.isArray(parsed["events"])) fail("events must be an array");
  const events = (parsed["events"] as unknown[]).map((e, i) => parseEvent(e, i));

  const rawOutcomes = parsed["expected_outcomes"];
  if (!isRecord(rawOutcomes)) fail("expected_outcomes must be an object");
  const expected_outcomes: JourneyFixture["expected_outcomes"] = { ...rawOutcomes };
  if (rawOutcomes["routing_group"] !== undefined && typeof rawOutcomes["routing_group"] !== "string") {
    fail("expected_outcomes.routing_group must be a string if present");
  }
  if (rawOutcomes["strategy"] !== undefined && typeof rawOutcomes["strategy"] !== "string") {
    fail("expected_outcomes.strategy must be a string if present");
  }

  const fixture: JourneyFixture = {
    journey_id: parsed["journey_id"] as string,
    persona,
    events,
    expected_outcomes,
  };

  if (parsed["backtrack_events"] !== undefined) {
    if (!Array.isArray(parsed["backtrack_events"])) fail("backtrack_events must be an array if present");
    fixture.backtrack_events = (parsed["backtrack_events"] as unknown[]).map((e, i) =>
      parseBacktrackEvent(e, i),
    );
    // Fixture-authoring rule (contracts/journey-fixture-schema.md): a
    // backtrack MUST name a stepId already visited earlier in `events`.
    const visitedStepIds = new Set(events.map((e) => e.stepId));
    for (const bt of fixture.backtrack_events) {
      if (!visitedStepIds.has(bt.revisit_step)) {
        fail(
          `backtrack_events revisit_step "${bt.revisit_step}" is not among the stepIds visited in events[]`,
        );
      }
    }
  }

  return fixture;
}
