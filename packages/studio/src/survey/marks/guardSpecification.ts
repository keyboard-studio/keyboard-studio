// guardSpecification — the spec 104 FR-013 guard specification's studio
// helpers: the Track 2 seed detector, the specification's record minting,
// its registry read/write seam, and the completion-report re-evaluation
// scan (US1 scenario 6).
//
// The specification itself is a contracts spine record
// (`GuardSpecification`) carried in the marks-treatment decision value —
// the decision-registry entry (Constitution Art. IX), recorded through
// the same decide path as every other marks decision. This module never
// invents a second store for it.
//
// Detection reuses contracts signals only (the spec 063 rule join's role
// classification + produced sets) — no hand-rolled rule parsing: a T_
// mark key is GUARDED when one of its bindings is a `guard` rule
// (`any(diablock) + [T_0300] > context`) or a context-carrying producing
// rule, and UNGUARDED when it produces its mark with neither.

import type {
  GuardSpecification,
  KeyboardIR,
  TouchKeyIR,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  bindingsForKeyId,
  buildTouchKeyRuleIndex,
  decodeUnicodeKeyId,
  producedByKeyId,
} from "@keyboard-studio/contracts";

import {
  EMPTY_MARKS_VALUE,
  getMarksTreatmentValue,
  recordMarksTreatmentValue,
  type GuardReevaluationItem,
} from "./marksValue.ts";

/** The survey-answer id the guard station's answer rides (spec 079 R-04 shape). */
export const GUARD_BEHAVIOUR_QUESTION_ID = "marks.marks_guard.behaviour";

export type GuardBehaviour = GuardSpecification["behaviour"];

/** Every char is one combining mark (Mn/Mc/Me) — the keyIdMinting test, restated locally. */
const COMBINING_MARK_RE = /^\p{M}$/u;

function isMarkChar(ch: string): boolean {
  return COMBINING_MARK_RE.test(ch);
}

/** Visit every key occurrence in a layout, subkeys (sk / multitap / flick) included. */
function walkKeys(
  layout: TouchLayoutIR,
  visit: (key: TouchKeyIR, platformId: string, layerId: string) => void,
): void {
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      const walk = (key: TouchKeyIR): void => {
        visit(key, platform.id, layer.id);
        for (const sub of key.sk ?? []) walk(sub);
        for (const sub of key.multitap ?? []) walk(sub);
        if (key.flick) {
          for (const sub of Object.values(key.flick)) {
            if (sub) walk(sub);
          }
        }
      };
      for (const row of layer.rows) {
        for (const key of row.keys) walk(key);
      }
    }
  }
}

interface MarkKeyClass {
  guarded: number;
  unguarded: number;
}

/**
 * Classify an IR's T_ mark keys by whether their production is guarded.
 * A key counts once per distinct id — the same T_ id on three layers is
 * one key identity with one behaviour.
 */
function classifyImportedMarkKeys(ir: KeyboardIR): MarkKeyClass {
  const index = buildTouchKeyRuleIndex(ir);
  const seen = new Set<string>();
  let guarded = 0;
  let unguarded = 0;
  if (ir.touchLayout == null) return { guarded, unguarded };
  walkKeys(ir.touchLayout, (key) => {
    if (!key.id.startsWith("T_") || seen.has(key.id)) return;
    const produced = producedByKeyId(index, key.id);
    if (!produced.some((ch) => isMarkChar(ch))) return;
    seen.add(key.id);
    const isGuarded = bindingsForKeyId(index, key.id).some(
      (b) => b.role === "guard" || b.contextGuarded,
    );
    if (isGuarded) guarded += 1;
    else unguarded += 1;
  });
  return { guarded, unguarded };
}

/**
 * The Track 2 seed (FR-013): the imported keyboard's own marks determine
 * the specification when they speak with one voice — guarded T_ mark keys
 * and no unguarded ones ⇒ `"swallow"`; unguarded producing T_ mark keys
 * and no guarded ones ⇒ `"emit"`. A mixed population, or no T_ mark keys
 * at all, determines nothing: `undefined`, and the station asks fresh.
 */
export function detectImportedGuardBehaviour(ir: KeyboardIR): GuardBehaviour | undefined {
  const { guarded, unguarded } = classifyImportedMarkKeys(ir);
  if (guarded > 0 && unguarded === 0) return "swallow";
  if (unguarded > 0 && guarded === 0) return "emit";
  return undefined;
}

/**
 * The behaviour the guard question opens on when there is no prior answer
 * and no import seed: a mark with no letter to sit on types nothing. A
 * default is a proposal (Art. X) — it is shown selected, and it is recorded
 * as the author's (`asked`, confirmed) only when they pass the guard station
 * or confirm the touch-editor prompt with it.
 */
export const DEFAULT_GUARD_BEHAVIOUR: GuardBehaviour = "swallow";

/**
 * Mint a specification record. Ids are content-derived (the codebase's
 * record convention — cf. severTouchKey's transplant ids); `supersedes`
 * chains to the record being replaced, never to the minted id itself.
 */
export function makeGuardSpecification(input: {
  behaviour: GuardBehaviour;
  origin: GuardSpecification["origin"];
  confirmed: boolean;
  supersedesRecord?: GuardSpecification | null;
}): GuardSpecification {
  const recordId = `guard-specification:${input.origin === "seeded-from-import" ? "seeded" : "asked"}:${input.behaviour}`;
  const prior = input.supersedesRecord ?? null;
  return {
    recordId,
    behaviour: input.behaviour,
    origin: input.origin,
    confirmed: input.confirmed,
    recordedAt: Date.now(),
    supersedes: prior !== null && prior.recordId !== recordId ? prior.recordId : (prior?.supersedes ?? null),
  };
}

/** The recorded specification (possibly a provisional seed), or undefined. */
export function getGuardSpecification(): GuardSpecification | undefined {
  return getMarksTreatmentValue()?.guardSpecification ?? undefined;
}

/**
 * The specification a proposer may act on: a seeded specification is
 * provisional until confirmed at the marks station (data-model.md §3),
 * and an unconfirmed seed must not mint guarded T_ keys — so only a
 * confirmed record is effective.
 */
export function effectiveGuardSpecification(
  record: GuardSpecification | null | undefined,
): GuardSpecification | undefined {
  return record != null && record.confirmed ? record : undefined;
}

/**
 * Record an author's guard answer (the touch-editor routing, FR-013's
 * tail): a confirmed `GuardSpecification` in the marks-treatment decision
 * value, through the registry's own record path. Confirming the seeded
 * behaviour keeps the `seeded-from-import` origin; any other answer is
 * the author's own (`asked`). The completion payload is cleared, per
 * D-090-11: an answer record after a completion must never re-apply a
 * stale payload.
 */
export function recordGuardAnswer(behaviour: GuardBehaviour): GuardSpecification {
  const current = getMarksTreatmentValue() ?? EMPTY_MARKS_VALUE;
  const prior = current.guardSpecification;
  const origin: GuardSpecification["origin"] =
    prior?.origin === "seeded-from-import" && behaviour === prior.behaviour
      ? "seeded-from-import"
      : "asked";
  const record = makeGuardSpecification({
    behaviour,
    origin,
    confirmed: true,
    supersedesRecord: prior,
  });
  recordMarksTreatmentValue({ ...current, completion: null, guardSpecification: record });
  return record;
}

/**
 * The completion-report re-evaluation (US1 scenario 6): every touch key
 * whose minted form contradicts the landed specification. REPORTED via
 * `MarksCompletion.guardReevaluation` — this function changes nothing.
 */
export function findGuardReevaluationItems(
  ir: KeyboardIR,
  spec: GuardSpecification,
): GuardReevaluationItem[] {
  if (ir.touchLayout == null) return [];
  const index = buildTouchKeyRuleIndex(ir);
  const items: GuardReevaluationItem[] = [];
  const seen = new Set<string>();
  walkKeys(ir.touchLayout, (key, platformId, layerId) => {
    const dedupe = `${platformId}|${layerId}|${key.id}`;
    if (seen.has(dedupe)) return;
    if (spec.behaviour === "swallow" && key.id.startsWith("U_")) {
      const decoded = decodeUnicodeKeyId(key.id);
      if (decoded !== undefined && [...decoded].length === 1 && isMarkChar(decoded)) {
        seen.add(dedupe);
        items.push({
          mark: decoded,
          keyId: key.id,
          platformId,
          layerId,
          currentForm: "unicode",
          specBehaviour: spec.behaviour,
        });
      }
      return;
    }
    if (spec.behaviour === "emit" && key.id.startsWith("T_")) {
      const produced = producedByKeyId(index, key.id);
      const mark = produced.find((ch) => isMarkChar(ch));
      if (mark === undefined) return;
      const isGuarded = bindingsForKeyId(index, key.id).some(
        (b) => b.role === "guard" || b.contextGuarded,
      );
      if (!isGuarded) return;
      seen.add(dedupe);
      items.push({
        mark,
        keyId: key.id,
        platformId,
        layerId,
        currentForm: "guarded-t",
        specBehaviour: spec.behaviour,
      });
    }
  });
  return items;
}
