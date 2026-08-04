// useSurveyBrowserHistorySync — bridges the browser's Back/Forward buttons
// into the survey wizard's own traversal store (F7: "the back button does not
// work" — docs/design-notes/switch-base-popup-behavior-log.md).
//
// This is navigation state, NOT persistence and NOT validation: it never
// touches localStorage/disk (VirtualFS contract) and it introduces no new
// debounce timer (D3 governs the validator cycle only, not this).
//
// Design (one push per manifest-step ADVANCE; ONE popstate listener; the
// popstate listener is the ONLY place the browser-triggered mutation runs):
//
//   - Mount: `replaceState`s the CURRENT browser entry with
//     `{ ksStep: <activeStepId at mount> }` — never `pushState`, so this adds
//     no extra stack entry a lone "leave naturally" Back would have to cross.
//     Reads whatever the store settled on by mount time (a fresh session ->
//     "identity"; a restored draft -> its resumed step), so the tag always
//     matches the store, in either case.
//   - Every subsequent `advance()` (lastNavigation === "advance", activeStepId
//     actually changed) pushes exactly one entry `{ ksStep: newStepId }`.
//     Pops (lastNavigation === "pop" — whether from the in-app Back button or
//     from this hook's own popstate handler) push nothing: a pop driven by
//     the browser already moved the pointer; a pop driven by the in-app
//     button deliberately does NOT move the browser pointer (see below).
//   - The in-app Back button (StepHost.handleBack) calls
//     `performManifestBack` DIRECTLY — synchronously, exactly as before this
//     fix — rather than routing through `window.history.back()`. This keeps
//     every existing in-app-Back test's synchronous assertions valid. The
//     tradeoff: an in-app Back does not itself move the browser's position,
//     so the FIRST native Back click after an in-app Back click is "absorbed"
//     (the browser moves its pointer to an entry whose `ksStep` no longer
//     matches `expectedBackTarget`, so it's treated as a foreign/stale entry
//     and silently ignored) rather than doing something surprising; the very
//     next native click re-syncs and works normally. Never state-corrupting,
//     matching the sync invariant below.
//   - The ONE popstate listener is the single place a BROWSER-triggered pop
//     mutates the store: it reads `event.state.ksStep`, and mutates ONLY when
//     it equals `expectedBackTarget(currentActiveStepId, currentHistory)` —
//     the same prediction `performManifestBack` would honor. Any other value
//     (Forward navigation, a hash-route entry with no `ksStep`, a stale tag
//     surviving a reload with a store that has since reset/restored
//     differently) degrades to a silent no-op. It NEVER trusts the event
//     alone to decide what to mutate.
//
// Sync invariant: at any point after mount, `window.history.state?.ksStep`
// (when present) equals the `activeStepId` the store held at the moment that
// entry was written (either by this hook's own push/tag, or by a popstate the
// listener actually accepted). A popstate whose `ksStep` doesn't match the
// CURRENT store's `expectedBackTarget` is provably NOT the entry this hook
// would have produced from the store's present position, so it is never
// applied — the store's `activeStepId`/`history` invariants (sanitizeHistory,
// popValidHistoryEntry) are therefore never reachable from a foreign or stale
// browser event. This holds across: in-app Back (direct call, no browser
// motion), browser Back (matches -> applied; degrades to no-op otherwise),
// browser Forward (never matches a BACK prediction -> always a no-op, an
// explicitly acceptable degrade), hash-route jumps away from #survey (this
// hook is unmounted with SurveyView; the returning hashchange remounts
// SurveyView fresh — an existing, unrelated invariant — and this hook's mount
// effect re-tags the current entry to match), and page reload (the browser
// preserves `history.state` for the current entry across reload in the same
// tab, but the store does not persist across reload — the mount effect
// retags the current entry to the FRESH (or freshly-restored) store position,
// so the two are back in lockstep from the first render onward).
//
// Not fully covered (acknowledged, out of the five required cases): resuming
// a draft in a BRAND NEW tab/window that never itself pushed the resumed
// history's entries. `window.history.back()` there has nothing of ours below
// the current (freshly tagged) entry, so it leaves the app rather than
// stepping into the resumed wizard's prior step, until the next forward
// advance re-establishes the push chain. In-app Back is unaffected (it does
// not depend on the browser stack) — only a literal physical/native Back
// click in that specific fresh-tab-plus-restored-draft combination is
// affected.

import { useEffect, useRef, type RefObject } from "react";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import {
  useSurveySessionStore,
  performManifestBack,
  expectedBackTarget,
  type ActiveStepId,
} from "../stores/surveySessionStore.ts";

function readKsStep(state: unknown): string | undefined {
  if (typeof state !== "object" || state === null) return undefined;
  const raw = (state as { ksStep?: unknown }).ksStep;
  return typeof raw === "string" ? raw : undefined;
}

/**
 * Optional ordering guard (dev-only). The caller's reset/restore effect
 * (StudioShell.tsx's SurveyView) MUST run before this hook's own mount-tag
 * effect (see the module docstring) so the entry gets tagged with the
 * SETTLED activeStepId, not a stale value left over from a prior session on
 * the module-level store singleton. Passing the ref that effect flips at its
 * end turns the "declaration order" contract into a live check: if the two
 * are ever reordered (or the sync hook's own effect somehow runs first),
 * `.current` is still `false` when this hook's mount effect runs, and DEV
 * fails loud instead of silently tagging the wrong step. Not a proxy check —
 * it inspects the actual antecedent-effect settlement, not activeStepId's
 * value (which cannot distinguish a fresh reset from a legitimate restore).
 */
export function useSurveyBrowserHistorySync(resetOrRestoreSettledRef?: RefObject<boolean>): void {
  const activeStepId = useSurveySessionStore((s) => s.activeStepId);
  const lastNavigation = useSurveySessionStore((s) => s.lastNavigation);

  // Tracks the step id the browser's CURRENT entry is believed to represent.
  // Set by the mount-tag effect (below) before the push effect's first run —
  // see the module docstring for why that ordering matters.
  const prevStepRef = useRef<ActiveStepId | null>(null);

  // Effect 1 — mount tag. `replaceState`, not `pushState`: this labels the
  // entry that already exists rather than adding a new one, so a Back click
  // at the very first (untouched) step still leaves the app naturally.
  // Reads the store's CURRENT activeStepId at the time this runs, so it
  // reflects whatever SurveyView's own reset-on-mount / draft-restore effect
  // already decided (this hook must be called AFTER that effect — see the
  // call site in StudioShell.tsx's SurveyView).
  useEffect(() => {
    if (
      import.meta.env.DEV &&
      resetOrRestoreSettledRef !== undefined &&
      resetOrRestoreSettledRef.current !== true
    ) {
      devLog.error(
        "[useSurveyBrowserHistorySync] mounted before the survey reset/restore effect " +
          "settled — this hook must be called AFTER that effect (see the call site in " +
          "StudioShell.tsx's SurveyView), or the browser history entry will get tagged " +
          "with a stale activeStepId left over from a prior session.",
      );
    }
    const current = useSurveySessionStore.getState().activeStepId;
    const prior = window.history.state as Record<string, unknown> | null;
    window.history.replaceState(
      { ...(prior !== null && typeof prior === "object" ? prior : {}), ksStep: current },
      "",
    );
    prevStepRef.current = current;
    // Mount-once: intentionally ignores later activeStepId changes — those
    // are handled by effect 2 below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect 2 — push exactly one entry per manifest-step ADVANCE (the D5
  // forward primitive). A "pop" transition (lastNavigation === "pop") never
  // pushes — see the module docstring's tradeoff note.
  useEffect(() => {
    if (lastNavigation !== "advance") {
      prevStepRef.current = activeStepId;
      return;
    }
    if (prevStepRef.current === activeStepId) return; // no real change yet (mount, or a same-value re-render)
    if (prevStepRef.current !== null) {
      window.history.pushState({ ksStep: activeStepId }, "");
    }
    prevStepRef.current = activeStepId;
  }, [activeStepId, lastNavigation]);

  // Effect 3 — the ONE popstate listener. Bridges the browser Back/Forward
  // buttons into performManifestBack, the exact same dispatch StepHost's
  // in-app Back button uses (never a second, divergent back path).
  useEffect(() => {
    function onPopState(event: PopStateEvent): void {
      const ksStep = readKsStep(event.state);
      if (ksStep === undefined) return; // not one of ours (a hash-route entry, or pre-app history)
      const current = useSurveySessionStore.getState();
      const expected = expectedBackTarget(current.activeStepId, current.history);
      // Defensive equality check — never trust the browser event alone. Only
      // a popstate landing EXACTLY where our own back-logic would have popped
      // to is treated as a genuine Back; anything else (Forward, a stale tag,
      // cross-session drift) degrades to a silent no-op.
      if (expected === null || expected !== ksStep) return;
      performManifestBack(current.activeStepId);
      prevStepRef.current = expected;
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
}
