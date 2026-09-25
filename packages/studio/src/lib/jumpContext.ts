// jumpContext — lets a step (or anything it renders, e.g. `FlaggedAnswersList`)
// trigger a jump WITHOUT importing `jumpToLocation.ts` itself (spec 079 US3).
//
// Why this exists: `jumpToLocation.ts` imports `steps/manifest.ts` (to resolve
// a jump target), and every step component is imported BY `steps/manifest.ts`
// (`manifest.ts` builds its step list from them). A step statically importing
// `jumpToLocation.ts` — directly, or via a component it renders — closes that
// into a genuine runtime circular dependency (`no-circular`,
// .dependency-cruiser.cjs), which is not merely a lint nit: it means the two
// modules would need each other fully initialized to load at all.
//
// The fix mirrors `lib/questionRecorder.ts`'s existing pattern exactly: a
// context with a no-op default (safe for a step rendered outside StepHost, in
// a unit test), provided by `StepHost.tsx` — which imports `manifest.ts` but
// is never imported BY it, so its own `jumpToLocation` import is cycle-free.

import { createContext, useContext } from "react";

/** Jump to `screenId` inside `stepId`'s own walk. */
export type JumpToScreen = (stepId: string, screenId: string) => void;

const NOOP: JumpToScreen = () => {};

export const JumpContext = createContext<JumpToScreen>(NOOP);

export function useJumpToScreen(): JumpToScreen {
  return useContext(JumpContext);
}
