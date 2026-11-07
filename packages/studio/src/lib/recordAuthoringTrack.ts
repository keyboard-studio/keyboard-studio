// recordAuthoringTrack — the start screen's act of recording which track
// the walk is on (New = copy, Open = adapt), shared by the headless author
// (spec 107 FR-040: what the author cannot reach without the UI is lifted
// into product code the UI then calls).
//
// The track question is gone, so nothing in the walk itself asks it: the
// start screen records it before the walk, StudioShell's instantiation
// effect waits for it alongside the base, and the headless walk records the
// case's track the same way before its first step. Provenance is always
// "asked" — the author chose it on the start screen. (StudioShell's
// copy-default for walks that arrive with no track recorded is a different
// act — provenance "default", step "choose_base" — and stays inline there.)
import { useDecisionStore } from "../stores/decisionStore.ts";

/** Record the walk's authoring track as the start screen chose it. */
export function recordAuthoringTrack(value: "copy" | "adapt", step: "start" | "open"): void {
  useDecisionStore.getState().record({
    id: "authoring-track",
    value,
    provenance: "asked",
    step,
  });
}
