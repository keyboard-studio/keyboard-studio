// usePublishStepNav — a step hands its Back / Skip / forward buttons to the
// footer (spec 081). See stores/stepNavStore.ts for why this is a store.
//
// Rules for callers (contracts/step-nav-contract.md §2):
// - Only the component that owns the step's walk calls it — never a wrapper.
// - Call it unconditionally, at the top level, BEFORE any early return, with
//   the spec for the current render state (loading and error states included).
// - `back.onClick` is the step's own back (the internal walk's), which falls
//   through to the `onBack` prop at the walk's start. Omit `back` when there is
//   nowhere to go.
// - Pass `ariaDescribedBy` only while the referenced hint is mounted.
//
// A component that renders ANOTHER publisher in some of its states (a gallery
// whose early returns render GalleryIntroSplash / GalleryEmptyState, PhaseB
// whose manual path renders SurveyRunner) must not call the hook at its top
// level: that would be a second live publisher for the step. It renders
// `<PublishStepNav spec={...} />` in the branches it owns instead, so exactly
// one publisher is mounted per screen.

import { createContext, useContext, useId, useLayoutEffect, useRef } from "react";
import {
  STANDALONE_STEP_ID,
  useStepNavStore,
  type NavAction,
  type StepNavSpec,
} from "../stores/stepNavStore.ts";

/**
 * The manifest step id StepHost is rendering. Publishes are tagged with it, so
 * an outgoing step's late publish can never render on the incoming step.
 */
export const StepNavContext = createContext<string | null>(null);

type Slot = keyof StepNavSpec;

export function usePublishStepNav(spec: StepNavSpec): void {
  const stepId = useContext(StepNavContext) ?? STANDALONE_STEP_ID;
  const owner = useId();

  // The latest spec, so the stable wrappers below always call the handler from
  // the most recent render without the store having to be rewritten.
  const latest = useRef(spec);
  latest.current = spec;

  const wrappers = useRef<Record<Slot, () => void> | null>(null);
  if (wrappers.current === null) {
    wrappers.current = {
      back: () => latest.current.back?.onClick(),
      secondary: () => latest.current.secondary?.onClick(),
      forward: () => latest.current.forward?.onClick(),
    };
  }
  const stable = wrappers.current;

  // Before paint, so the footer never shows a frame without this step's
  // buttons. Runs every render; the store's equality guard makes an unchanged
  // spec a no-op that notifies nobody.
  useLayoutEffect(() => {
    const wrap = (slot: Slot): NavAction | undefined => {
      const action = spec[slot];
      return action === undefined ? undefined : { ...action, onClick: stable[slot] };
    };
    const published: StepNavSpec = {};
    for (const slot of ["back", "secondary", "forward"] as const) {
      const action = wrap(slot);
      if (action !== undefined) published[slot] = action;
    }
    useStepNavStore.getState().publish(stepId, owner, published);
  });

  useLayoutEffect(() => () => useStepNavStore.getState().clear(stepId, owner), [stepId, owner]);
}

/**
 * The hook as an element, for a component that publishes from only some of its
 * render branches (see the header). Renders nothing.
 */
export function PublishStepNav({ spec }: { spec: StepNavSpec }): null {
  usePublishStepNav(spec);
  return null;
}
