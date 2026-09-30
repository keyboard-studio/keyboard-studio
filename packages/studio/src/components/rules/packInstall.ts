// packInstall — studio seam for rule-pack install/uninstall (spec 082 FR-015).
//
// Applies the engine's IR-first installer to the carve working IR through
// the overlay-preserving `setWorkingIR` seam — the same reversible path the
// guard-synthesis flow uses. Installed rules arrive as typed IR rules stamped
// `ownedByBehaviour: "<packId>/<behaviourId>"`, so they show up in the rule
// list, group into families, and name their behaviour in the demo trace.
// Uninstall derives everything from those stamps: no extra store state.
//
// Scope note: the working IR is the rules step's view. The compile pipeline
// (`projectWorkingCopyVfs`) projects from baseIr + overlays, so — exactly
// like guard-synthesis additions today — installed rules reach the compiled
// artifact once that projection consumes working-IR additions; the engine
// installer itself is compile-ready (IR→KMN emit) and this seam is where the
// projection will pick it up.

import {
  installPack,
  uninstallPack,
  isPackInstalled,
  RulePackInstallError,
  type InstallPackResult,
  type UninstallPackResult,
} from "@keyboard-studio/engine/rulePacks";
import type { RulePack } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useGuardIntentStore } from "../../stores/guardIntentStore.ts";

/**
 * Install a rule pack into the working IR.
 *
 * @throws {RulePackInstallError} when there is no working IR, the pack is
 *   invalid, a behaviour's rule text does not parse, or the pack is already
 *   installed.
 */
export function applyPackInstall(pack: RulePack): InstallPackResult {
  const { ir, setWorkingIR } = useWorkingCopyStore.getState();
  if (ir === null) {
    throw new RulePackInstallError("no working keyboard IR to install the pack into");
  }
  const result = installPack(ir, pack);
  setWorkingIR(result.ir);
  // FR-020 intent signal: installing a bundle with block behaviours is the
  // "installs a block-behaviour bundle" signal — guard suggestions for the
  // touched families may now surface.
  if (pack.behaviours.some((b) => b.kind === "block")) {
    useGuardIntentStore.getState().noteBlockBundleInstalled();
  }
  return result;
}

/**
 * Uninstall a rule pack from the working IR. Removes exactly the rules and
 * synthesized stores the install stamped — never anything else. A no-op
 * when the pack is not installed.
 */
export function applyPackUninstall(packId: string): UninstallPackResult {
  const { ir, setWorkingIR } = useWorkingCopyStore.getState();
  if (ir === null) {
    throw new RulePackInstallError("no working keyboard IR to uninstall the pack from");
  }
  const result = uninstallPack(ir, packId);
  setWorkingIR(result.ir);
  return result;
}

/** True when the working IR carries any rule or store owned by the pack. */
export function isPackInstalledInWorkingCopy(packId: string): boolean {
  const { ir } = useWorkingCopyStore.getState();
  return ir !== null && isPackInstalled(ir, packId);
}
