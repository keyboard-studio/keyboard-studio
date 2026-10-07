// deriveScreens — the wizard's screens, derived from the decision modules
// (spec 091). Pure: no store access, no component imports, no I/O. The one
// sort (orderDecisions) orders the modules; this module only partitions
// that order into screens, derives each screen's gate from its members,
// and re-derives the trail structure over screens.
//
// Screen formation (research.md):
//   - a custom (component-renderer) module forms a singleton screen keyed
//     by its declared `screen`;
//   - a maximal run of consecutive question-renderer modules sharing a
//     `group` forms one screen keyed by the group; a group change or an
//     intervening singleton splits the run (a split run repeats the label);
//   - a question module whose `group` names a singleton screen is
//     intra-step to that screen (the two-level treatment): it forms no
//     top-level screen, wherever the sort places it, and its decisions are
//     members of the enclosing screen.
//
// Gates (FR-003): a member's gate is its routing-derived gate
// (effectiveGatedBy — the one source; spec 087 FR-005: no module-level
// gatedBy override exists). A screen's gate is present iff EVERY member
// decision's provider is gated; it passes when at least one member gate
// passes (a partially gated screen is walked; the runner's own per-question
// gating still applies inside it). A screen whose gate is NOT
// routing-expressible (a manifest-level fork, an asked-while-unrecorded
// custom screen) declares it at the composition layer instead: the caller
// passes `declaredScreenGates` (the registry's map, keyed by screen id),
// and a declared gate wins over the member-derived one (Delta P6).

import type { QuestionModule } from "../survey/types.ts";
import type { DecisionId, DecisionSet } from "./decisionTypes.ts";
import {
  deriveStepStructure,
  effectiveGatedBy,
  orderDecisions,
} from "./orderDecisions.ts";

/** One wizard screen, derived from the module list. Never stored. */
export interface DerivedScreen {
  /** Display/addressing id: the `group` for a question screen, the
   *  module's declared screen key for a singleton. */
  readonly id: string;
  readonly kind: "question" | "custom";
  /** The label key for question screens; repeats when a run is split. */
  readonly group?: string;
  /** Member decisions, in derived order. */
  readonly decisionIds: readonly DecisionId[];
  /** Member modules, in derived order. */
  readonly moduleIds: readonly string[];
  /**
   * Derived gate: present iff every member decision is gated. Absent =
   * always walked. Present = a side trail (see `spine` / `joinTarget`).
   */
  readonly gatedBy?: (decisions: DecisionSet) => boolean;
  /** Trail structure, from the existing deriveStepStructure logic. */
  readonly spine: boolean;
  readonly joinTarget?: string;
}

type Gate = (decisions: DecisionSet) => boolean;

const isCustom = (m: QuestionModule): boolean => typeof m.renderer === "function";

interface ScreenRecord {
  readonly id: string;
  readonly kind: "question" | "custom";
  readonly group?: string;
  readonly members: QuestionModule[];
}

/**
 * Derive the wizard's screens from a declaration-ordered module list (the
 * registry's `decisionModules`). Fail-fast named errors, in the style of
 * orderByDependencies: a custom module with no screen key, two custom
 * modules claiming one screen key, or a question module with no group.
 * Duplicate providers, unresolved requirements and cycles are the sort's
 * errors, inherited unchanged.
 */
export function deriveScreens(
  modules: readonly QuestionModule[],
  declaredScreenGates?: ReadonlyMap<string, Gate>,
): DerivedScreen[] {
  // Screen-order requirements (types.ts `screenRequires`) fold into the
  // full-list sort as ordinary requires: across the whole registry every
  // screenRequires decision has its provider present, so the sort's
  // unresolved diagnosis still fires for a genuinely missing provider.
  const sortInput = modules.map((m) =>
    m.screenRequires === undefined
      ? m
      : { ...m, requires: [...(m.requires ?? []), ...m.screenRequires] },
  );
  const originalById = new Map(modules.map((m) => [m.definition.id, m] as const));
  const ordered = orderDecisions(sortInput).map(
    (m) => originalById.get(m.definition.id) ?? m,
  );

  // Classification pass: singleton screen keys are known from the whole
  // set before partitioning, so an intra-step module is recognised
  // wherever the sort places it relative to its enclosing singleton.
  const singletonOwner = new Map<string, QuestionModule>();
  for (const m of modules) {
    if (!isCustom(m)) continue;
    if (m.screen === undefined) {
      throw new Error(
        `deriveScreens: custom module "${m.definition.id}" declares no screen key`,
      );
    }
    const existing = singletonOwner.get(m.screen);
    if (existing !== undefined) {
      throw new Error(
        `deriveScreens: screen "${m.screen}" is claimed by two custom modules: ` +
          `"${existing.definition.id}" and "${m.definition.id}"`,
      );
    }
    singletonOwner.set(m.screen, m);
  }

  // Member gates, computed once: routing-derived only (087 FR-005 — no
  // module declares a gate; see the header note).
  const gateOf = new Map<string, Gate | undefined>();
  for (const m of modules) {
    gateOf.set(m.definition.id, effectiveGatedBy(m, modules));
  }

  // Partition pass.
  const records: ScreenRecord[] = [];
  const singletonRecord = new Map<string, ScreenRecord>();
  const intraPending = new Map<string, QuestionModule[]>();
  let openRun: ScreenRecord | null = null;

  for (const m of ordered) {
    if (isCustom(m)) {
      openRun = null;
      const rec: ScreenRecord = {
        id: m.screen!,
        kind: "custom",
        members: [...(intraPending.get(m.screen!) ?? []), m],
      };
      intraPending.delete(m.screen!);
      records.push(rec);
      singletonRecord.set(m.screen!, rec);
      continue;
    }
    if (m.group === undefined) {
      throw new Error(
        `deriveScreens: question module "${m.definition.id}" declares no group`,
      );
    }
    if (singletonOwner.has(m.group)) {
      // Intra-step: a member of the enclosing custom screen, transparent
      // to the top-level partition (it neither joins nor splits a run).
      const rec = singletonRecord.get(m.group);
      if (rec !== undefined) rec.members.push(m);
      else {
        const pending = intraPending.get(m.group);
        if (pending !== undefined) pending.push(m);
        else intraPending.set(m.group, [m]);
      }
      continue;
    }
    if (openRun !== null && openRun.group === m.group) {
      openRun.members.push(m);
    } else {
      openRun = { id: m.group, kind: "question", group: m.group, members: [m] };
      records.push(openRun);
    }
  }
  if (intraPending.size > 0) {
    // Unreachable by construction (every key in singletonOwner is created
    // by its custom module in the loop above); kept as a named failure
    // rather than a silent drop if the classification ever changes.
    throw new Error(
      `deriveScreens: intra-step modules for unclaimed screen(s): ` +
        [...intraPending.keys()].join(", "),
    );
  }

  // Finalize: membership in derived order, derived gates.
  const finalized = records.map((rec) => {
    const providers = rec.members.filter((m) => (m.provides ?? []).length > 0);
    const allGated =
      providers.length > 0 &&
      providers.every((m) => gateOf.get(m.definition.id) !== undefined);
    const gatedBy: Gate | undefined =
      declaredScreenGates?.get(rec.id) ??
      (allGated
        ? (decisions: DecisionSet) =>
            providers.some((m) => gateOf.get(m.definition.id)!(decisions))
        : undefined);
    return {
      id: rec.id,
      kind: rec.kind,
      ...(rec.group !== undefined && { group: rec.group }),
      decisionIds: rec.members.flatMap((m) => m.provides ?? []),
      moduleIds: rec.members.map((m) => m.definition.id),
      ...(gatedBy !== undefined && { gatedBy }),
    };
  });

  const trails = deriveStepStructure(finalized);
  return finalized.map((s) => {
    const trail = trails.get(s.id)!;
    return {
      ...s,
      spine: trail.spine,
      ...(trail.joinTarget !== undefined && { joinTarget: trail.joinTarget }),
    };
  });
}

/**
 * The decisions each screen SETTLES that no question module asks for: the
 * provides of its custom (non-question) members — the gallery modules
 * (spec 090). A screen whose members include such a module is a
 * gallery/editor screen; its settled decisions' saved answers are not
 * survey-question answers (the distinction the spec-088 draft migration
 * and the spec-090 decision recorder both read). Pure, like the rest of
 * this module; the live, memoised binding is decisions/screenSettles.ts.
 */
export function settlesByScreen(
  modules: readonly QuestionModule[],
  declaredScreenGates?: ReadonlyMap<string, Gate>,
): ReadonlyMap<string, readonly DecisionId[]> {
  const byModuleId = new Map(modules.map((m) => [m.definition.id, m] as const));
  const result = new Map<string, readonly DecisionId[]>();
  for (const screen of deriveScreens(modules, declaredScreenGates)) {
    const settles: DecisionId[] = [];
    for (const moduleId of screen.moduleIds) {
      const mod = byModuleId.get(moduleId);
      if (mod === undefined || !isCustom(mod)) continue;
      for (const id of mod.provides ?? []) {
        if (screen.decisionIds.includes(id)) settles.push(id);
      }
    }
    result.set(screen.id, settles);
  }
  return result;
}
