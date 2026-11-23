// unappliedTextStore -- the one leave guard for code views that hold text the
// author has not applied (spec 111 FR-046, "live files").
//
// On a keyboard opened for update a code view (the .kmn Code tab, the touch
// layout, the visual keyboard, the stylesheet, a documentation page's code
// mode) only writes its text into the files when the author presses its Apply.
// Leaving the view (another tab, Continue or Back, a step dot, the footer Undo
// or "Discard changes and go back") used to drop that text silently. Each view
// registers a handle here while it is mounted; `guardLeave(proceed)` runs
// `proceed` at once when nothing is unapplied, and otherwise asks (the dialog
// is `components/UnappliedTextDialog.tsx`): apply the text, discard it, or stay.
//
// Apply goes through the view's own apply path and reports whether the files
// took it; a refused or failed apply stays where the author is. Only a
// keyboard opened for update is guarded: Copy keeps its own behaviour. The
// handle table is ephemeral UI state, never persisted. No timers.

import { create } from "zustand";
import { useWorkingCopyStore } from "./workingCopyStore.ts";
import { isLiveOpen } from "../lib/openMode.ts";
import { setNavigationGuard } from "../lib/navigationGuard.ts";

export interface UnappliedTextHandle {
  /** What the view is called in the question (already translated). */
  readonly label: string;
  /** True when the view holds text that is not in the files. Read when the author leaves. */
  readonly hasUnapplied: () => boolean;
  /** Apply through the view's own path. True when the text is now applied; false to stay. */
  readonly apply: () => Promise<boolean>;
  /** Drop the text and show what the files hold. */
  readonly discard: () => void;
}

export type LeaveChoice = "apply" | "discard" | "cancel";

interface Asking {
  readonly labels: readonly string[];
  readonly allowApply: boolean;
  readonly answer: (choice: LeaveChoice) => void;
}

interface UnappliedTextState {
  handles: ReadonlyMap<string, UnappliedTextHandle>;
  asking: Asking | null;
  register: (id: string, handle: UnappliedTextHandle) => () => void;
  /** Called by the dialog. */
  answer: (choice: LeaveChoice) => void;
}

export const useUnappliedTextStore = create<UnappliedTextState>()((set, get) => ({
  handles: new Map(),
  asking: null,
  register: (id, handle) => {
    set((s) => ({ handles: new Map(s.handles).set(id, handle) }));
    return () =>
      set((s) => {
        if (s.handles.get(id) !== handle) return s;
        const next = new Map(s.handles);
        next.delete(id);
        return { handles: next };
      });
  },
  answer: (choice) => get().asking?.answer(choice),
}));

/** The views that hold text not in the files, on a keyboard opened for update (none elsewhere). */
function dirtyHandles(): UnappliedTextHandle[] {
  // Cheapest test first: with no view holding text there is nothing to ask about.
  const dirty = [...useUnappliedTextStore.getState().handles.values()].filter((h) => h.hasUnapplied());
  return dirty.length > 0 && isLiveOpen(useWorkingCopyStore.getState()) ? dirty : [];
}

/** True on a keyboard opened for update when a mounted code view holds text that is not applied. */
export function hasUnappliedText(): boolean {
  return dirtyHandles().length > 0;
}

/**
 * True from the author's answer until the leave has run, been cancelled, or been refused. A leave
 * that arrives meanwhile (a second click while an Apply is writing) is ignored, so two leaves can
 * never run one after the other on the same answer.
 */
let busy = false;

export interface GuardLeaveOptions {
  /**
   * False when applying would defeat the leave (the footer Undo: applying and then undoing
   * the same edit): the question then offers only Discard and Keep editing.
   */
  readonly allowApply?: boolean;
}

/** After a stay, put focus back where the author was; if that is gone, on the step navigation. */
function restoreFocus(origin: Element | null): void {
  const target =
    origin instanceof HTMLElement && origin.isConnected
      ? origin
      : (document.getElementById("step-navigation") ?? document.querySelector<HTMLElement>("main"));
  target?.focus();
}

/**
 * Run `proceed` (the leave) now when no code view holds unapplied text, or after
 * the author's answer when one does. Returns true when it ran now (always
 * synchronously in that case, so callers that never have unapplied text behave
 * exactly as before) and false when it was held behind the question or ignored.
 *
 * Apply runs the dirty views' own applies one after another, in the order they
 * registered. There is no rollback: if a later view refuses, the earlier views
 * stay applied (each is its own undo step) and the author stays to deal with
 * the one that refused.
 */
export function guardLeave(proceed: () => void, options: GuardLeaveOptions = {}): boolean {
  const dirty = dirtyHandles();
  if (dirty.length === 0) {
    proceed();
    return true;
  }
  // One question at a time, and none while an answered one is still being carried out.
  if (busy || useUnappliedTextStore.getState().asking !== null) return false;
  const allowApply = options.allowApply ?? true;
  const origin = document.activeElement;
  void (async () => {
    const choice = await new Promise<LeaveChoice>((resolve) => {
      useUnappliedTextStore.setState({
        asking: {
          labels: dirty.map((h) => h.label),
          allowApply,
          answer: (c) => {
            busy = true;
            useUnappliedTextStore.setState({ asking: null });
            resolve(c);
          },
        },
      });
    });
    try {
      if (choice === "cancel" || (choice === "apply" && !allowApply)) {
        restoreFocus(origin);
        return;
      }
      if (choice === "apply") {
        for (const h of dirty) {
          let ok = false;
          try {
            ok = await h.apply();
          } catch {
            ok = false;
          }
          // Refused or failed: the host or the view has said why; stay with the text.
          if (!ok) {
            restoreFocus(origin);
            return;
          }
        }
      } else {
        for (const h of dirty) h.discard();
      }
    } finally {
      busy = false;
    }
    proceed();
  })();
  return false;
}

// Every route change (navigateTo, jumpToLocation, the browser's Back and links) asks through here.
setNavigationGuard({ run: (proceed) => guardLeave(proceed), dirty: hasUnappliedText });
