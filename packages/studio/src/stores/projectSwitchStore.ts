// projectSwitchStore — bridges an in-place project switch
// (lib/switchActiveProject.ts, reachable from anywhere via the top-bar
// `CurrentKeyboardIndicator` and from `MyKeyboardsList`) into a remount
// signal `StudioShell` can key `SurveyView` on.
//
// WHY THIS EXISTS (confirmed P0 — see switchActiveProject.ts's own header for
// the full mechanism this closes). `switchActiveProject()` can fire while the
// author is ALREADY on `#survey` with `SurveyView` mounted: it calls
// `resumeProject(key)` -> `pinActiveProject(key)` -> `navigateTo("survey")`,
// and writing the hash to its CURRENT value fires no `hashchange`, so
// `StudioShell`'s route-driven render never unmounts/remounts `SurveyView`.
// `SurveyView`'s whole autosave-subscription lifecycle
// (`draftPersistence.installDraftAutosave`) is wired through a per-instance
// React ref installed by a mount-only effect, so without a remount signal the
// newly-resumed project gets NO autosave subscription at all — silent,
// permanent loss of every edit made after the switch.
//
// `generation` increments exactly once per SUCCESSFUL call to
// `switchActiveProject()` — the ONE call site this store's `bump()` is wired
// into — and nowhere else. In particular, nothing in the identity/keyboardId
// rename path (Track 1's Phase A "custom keyboard id" field) calls `bump()`,
// so this is safe to use as a React `key`: it changes only on a genuine
// project switch, never mid-typing. It is deliberately NOT wired into the
// broader `pinActiveProject`/`doCommit` machinery (StudioShell.tsx) — a
// genuine base switch or the FIRST instantiation already reinstalls the
// autosave subscription explicitly, from INSIDE the already-mounted
// `SurveyView`, via `promotePendingAutosave()`; forcing an extra remount there
// would tear down that same instance mid-commit for no benefit.
//
// Same "one writer (a lib helper), one reader (StudioShell)" store-bridge
// WIRING as `startOverStore` — see its header for that shape. The CONSUMPTION
// differs: `startOverStore` publishes a callback (one writer, one reader, no
// remount); this store publishes a generation counter consumed as a React
// `key` (`SurveyView key={projectSwitchGeneration}`, StudioShell.tsx) to force
// an unmount/remount. That is the only key-as-remount-signal in this codebase
// (checked stores/, hooks/, survey/) — treat it as a new idiom here, not as
// an instance of an existing convention.
import { create } from "zustand";

interface ProjectSwitchState {
  generation: number;
  bump: () => void;
}

export const useProjectSwitchStore = create<ProjectSwitchState>((set) => ({
  generation: 0,
  bump: () => set((s) => ({ generation: s.generation + 1 })),
}));
