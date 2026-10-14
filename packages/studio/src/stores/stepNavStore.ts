// stepNavStore — the Back / Skip / forward buttons the active step offers,
// rendered by the footer rather than the step body (spec 081).
//
// Why a store: the footer (StudioFooter) and the step (mounted by StepHost) are
// siblings in the shell, not parent and child, so the step cannot pass its
// buttons down. The step PUBLISHES a description of them through
// `usePublishStepNav`; the footer's `StepNavCluster` reads the entry for the
// active step only. Same bridge shape as stepWalkStore.
//
// Why keyed by step id: an outgoing step's effects can still commit after the
// incoming step has mounted. Reading `entries[activeStepId]` and nothing else
// means a late publish lands in a slot nobody renders, so it can never show up
// on the wrong step.
//
// Why an owner token: exactly one component per step publishes (its walk
// owner). If a wrapper also published, the second one would silently replace
// the walk's own Back with a boundary Back. First wins, and DEV says so.
//
// Ephemeral UI state: never persisted, never part of the draft envelope.

import { create } from "zustand";
import { devLog } from "@keyboard-studio/contracts/dev-log";

/** One button a step offers right now. */
export interface NavAction {
  /** Already resolved through the `t` macro. */
  label: string;
  /** The step's own handler. Not compared by the equality guard. */
  onClick: () => void;
  testId: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Id of a hint that is mounted in the step body right now. */
  ariaDescribedBy?: string;
}

/** What one mounted step offers as navigation. An absent slot renders nothing. */
export interface StepNavSpec {
  back?: NavAction;
  secondary?: NavAction;
  forward?: NavAction;
}

export interface StepNavEntry {
  owner: string;
  spec: StepNavSpec;
}

/** The step id a publisher uses when no StepHost provides one (standalone tests). */
export const STANDALONE_STEP_ID = "__standalone__";

/**
 * A revision opened from Output (spec 094 research R3). A full-page editor
 * owns its step's nav slots (one publisher per step), so StepHost cannot add
 * "Back to testing" / "Discard" there — it publishes them on this separate
 * channel instead, and StepNavCluster renders them beside the editor's own.
 * "Back to testing" reuses the editor's forward action, which completes the
 * step through its normal adapter; StepHost then returns to Output.
 */
export interface RevisionNav {
  stepId: string;
  onDiscard: () => void;
}

const SLOTS = ["back", "secondary", "forward"] as const;

function sameAction(a: NavAction | undefined, b: NavAction | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return (
    a.label === b.label &&
    (a.disabled ?? false) === (b.disabled ?? false) &&
    a.testId === b.testId &&
    a.ariaLabel === b.ariaLabel &&
    a.ariaDescribedBy === b.ariaDescribedBy
  );
}

/**
 * Field-by-field equality over the descriptive fields. Handlers are excluded:
 * the hook publishes stable wrappers, so a new closure is not a change.
 */
export function sameSpec(a: StepNavSpec, b: StepNavSpec): boolean {
  return SLOTS.every((slot) => sameAction(a[slot], b[slot]));
}

/** True when the spec has at least one button to render. */
export function hasSlots(spec: StepNavSpec | undefined): boolean {
  return spec !== undefined && SLOTS.some((slot) => spec[slot] !== undefined);
}

export interface StepNavState {
  entries: Readonly<Record<string, StepNavEntry>>;
  /** The active revision-from-Output actions, if any (spec 094). */
  revision: RevisionNav | null;
  /** Set the revision actions for `nav.stepId`. */
  publishRevision: (nav: RevisionNav) => void;
  /** Drop the revision actions, but only if they belong to `stepId`. */
  clearRevision: (stepId: string) => void;
  /** Insert or replace `stepId`'s spec. A no-op when nothing descriptive changed. */
  publish: (stepId: string, owner: string, spec: StepNavSpec) => void;
  /** Forget `stepId`'s spec, but only if `owner` published it. */
  clear: (stepId: string, owner: string) => void;
  /** Drop everything — start-over and new project. */
  reset: () => void;
}

export const useStepNavStore = create<StepNavState>((set) => ({
  entries: {},
  revision: null,

  publishRevision: (nav) =>
    set((s) =>
      s.revision?.stepId === nav.stepId && s.revision.onDiscard === nav.onDiscard ? s : { revision: nav },
    ),

  clearRevision: (stepId) => set((s) => (s.revision?.stepId === stepId ? { revision: null } : s)),

  publish: (stepId, owner, spec) =>
    set((s) => {
      const existing = s.entries[stepId];
      if (existing !== undefined && existing.owner !== owner) {
        if (import.meta.env.DEV) {
          devLog.error(
            `[ERROR] stepNavStore: a second component tried to publish nav for step "${stepId}". ` +
              "Only the step's walk owner may call usePublishStepNav; the first publisher is kept.",
          );
        }
        return s;
      }
      if (existing !== undefined && sameSpec(existing.spec, spec)) return s;
      return { entries: { ...s.entries, [stepId]: { owner, spec } } };
    }),

  clear: (stepId, owner) =>
    set((s) => {
      if (s.entries[stepId]?.owner !== owner) return s;
      const entries = { ...s.entries };
      delete entries[stepId];
      return { entries };
    }),

  reset: () => set({ entries: {}, revision: null }),
}));
