// panelAdapters — EditorStep adapters for the five wizard panels (P4a, T013).
//
// Each adapter satisfies React.ComponentType<EditorStepProps> (the single
// contract for all editor steps). Panels have divergent existing prop shapes,
// so each adapter threads the relevant data from the store or ctx to the panel.
//
// The panels currently have inline survey-level side effects (onNext, onSubmit,
// onResolved) that also live in StudioShell. Those transitions are LEFT IN
// StudioShell for P4a and reserved for P4b (plan.md §"Out of scope for P4a").
// These adapters forward the results through onComplete so the manifest (P4b)
// can consume them.
//
// Declared but NOT yet wired into StudioShell. T014 repoints the imports;
// P4b introduces the manifest that actually uses these adapters.

import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { TrackStep } from "../panels/TrackStep.tsx";
import type { Track } from "../panels/TrackStep.tsx";
import { ProjectNameStep } from "../panels/ProjectNameStep.tsx";
import { ScaffoldForm } from "../panels/ScaffoldForm.tsx";
import type { ScaffoldSpec } from "../../hooks/useKeyboardArtifact.ts";
import { TrackOneIdentityPanel } from "../panels/TrackOneIdentityPanel.tsx";
import { BaseResolution } from "../panels/BaseResolution.tsx";
import type { SuggestTarget } from "../../lib/suggestBase.ts";

// ---------------------------------------------------------------------------
// TrackStepAdapter
// ---------------------------------------------------------------------------

/**
 * Adapter for TrackStep. Reads the base keyboard from the store; passes track
 * choice as the step result.
 */
export function TrackStepAdapter({ onComplete, onBack }: EditorStepProps) {
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);

  if (baseKeyboard === null) {
    // Guard: base must be set before this step is shown.
    return null;
  }

  function handleNext(track: Track) {
    onComplete({ track });
  }

  return (
    <TrackStep
      base={baseKeyboard}
      onNext={handleNext}
      onBack={onBack}
    />
  );
}

// ---------------------------------------------------------------------------
// ProjectNameStepAdapter
// ---------------------------------------------------------------------------

/**
 * Adapter for ProjectNameStep. Derives default display name from the working
 * copy's identity (if already set) or the base keyboard display name.
 */
export function ProjectNameStepAdapter({ onComplete, onBack }: EditorStepProps) {
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const identity = useWorkingCopyStore((s) => s.identity);

  const defaultDisplayName =
    identity?.displayName ?? baseKeyboard?.displayName ?? "";

  function handleNext(displayName: string, keyboardId: string) {
    onComplete({ displayName, keyboardId });
  }

  return (
    <ProjectNameStep
      defaultDisplayName={defaultDisplayName}
      onNext={handleNext}
      onBack={onBack}
    />
  );
}

// ---------------------------------------------------------------------------
// ScaffoldFormAdapter
// ---------------------------------------------------------------------------

/**
 * Adapter for ScaffoldForm. Passes the submitted ScaffoldSpec as the step
 * result. ScaffoldForm has no Back affordance in its existing design.
 */
export function ScaffoldFormAdapter({ onComplete }: EditorStepProps) {
  function handleSubmit(spec: ScaffoldSpec) {
    onComplete({ spec });
  }

  return <ScaffoldForm onSubmit={handleSubmit} />;
}

// ---------------------------------------------------------------------------
// TrackOneIdentityPanelAdapter
// ---------------------------------------------------------------------------

/**
 * Adapter for TrackOneIdentityPanel. The panel reads/writes the store
 * directly and has no explicit onComplete — it is a continuous editing surface.
 * The adapter fires onComplete immediately so the step is treated as "always
 * done" (the panel stays mounted alongside the working-copy preview).
 *
 * The actual transition to the next step happens when the user clicks the
 * primary action in StudioShell (P4b will wire this through the manifest).
 */
export function TrackOneIdentityPanelAdapter({ onComplete }: EditorStepProps) {
  // Fire onComplete on mount — identity editing is continuous, not gate-locked.
  // The manifest (P4b) will query the panel's validity state before advancing.
  void onComplete;
  return <TrackOneIdentityPanel />;
}

// ---------------------------------------------------------------------------
// BaseResolutionAdapter
// ---------------------------------------------------------------------------

/**
 * Adapter for BaseResolution. Reads the suggest target from the working-copy
 * store (identity_lite language + script selection) and passes the resolved
 * BaseKeyboard as the step result.
 */
export function BaseResolutionAdapter({ onComplete, onBack }: EditorStepProps) {
  const identity = useWorkingCopyStore((s) => s.identity);

  // Derive suggest target from identity. Falls back to Latn if neither
  // is set yet — the guard in BaseResolution handles the no-bases case gracefully.
  const target: SuggestTarget = {
    script: identity?.targetScript ?? "Latn",
    ...(identity?.bcp47 !== undefined ? { bcp47: identity.bcp47 } : {}),
  };

  return (
    <BaseResolution
      target={target}
      onResolved={(base) => onComplete({ base })}
      {...(onBack !== undefined ? { onBack } : {})}
    />
  );
}
