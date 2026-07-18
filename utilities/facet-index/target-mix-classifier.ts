/**
 * Target/device-mix classifier (spec 037 US3, T022) — declared-metadata
 * archetype. Emits the device-class set {desktop, touch, web} a keyboard
 * supports, from declared targets UNIONED with touch-layout artifact presence.
 *
 * Sources, in ascending fidelity:
 *   1. `.kps <Targets>` — enum-validated platform list (windows/macosx/linux/
 *      web/mobile/tablet). Absent ⇒ default `windows` (desktop), FR-014 AC2.
 *   2. `.kmn &TARGETS`   — raw platform list; the `any` sentinel expands to all
 *      device classes (research D8), not a literal.
 *   3. touch-layout artifact — a `.keyman-touch-layout` sibling. Its PRESENCE
 *      adds `touch` even when no declaration names a touch platform. Artifact
 *      outranks declaration (FR-014 AC1); the mismatch is flagged in `notes`.
 *
 * There is no content-derived tier — none of this is in the parsed rule IR — so
 * `classifyTargetMix` (the content-tier entry point) always returns null and the
 * build routes every keyboard through `targetMixFallback`, which reads the
 * scanned source bytes directly. `provenanceTier` is `declared-metadata` when
 * any declaration/artifact is present, else `default-fallback` (defaulted to
 * desktop), so the defaulting is always auditable.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { KeymanPlatformTarget } from "@keyboard-studio/contracts";
import { parseKps } from "../../packages/engine/src/base-browser/kps-parser.js";

import type { Categorization, ConfidenceClass, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

type DeviceClass = "desktop" | "touch" | "web";

/** Map a Keyman platform target to its device class. */
function deviceClassOf(target: string): DeviceClass | null {
  switch (target.toLowerCase()) {
    case "windows":
    case "macosx":
    case "linux":
    case "desktop":
      return "desktop";
    case "web":
      return "web";
    case "mobile":
    case "tablet":
    case "iphone":
    case "ipad":
    case "androidphone":
    case "androidtablet":
      return "touch";
    default:
      return null;
  }
}

const ALL_DEVICE_CLASSES: readonly DeviceClass[] = ["desktop", "touch", "web"];

/**
 * Content tier for target-mix is intentionally empty: device targets are
 * declared metadata + artifact presence, none of which lives in the parsed rule
 * IR. Always returns null so the build routes to `targetMixFallback`.
 */
export function classifyTargetMix(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void ir;
  void def;
  return null;
}

/** Read the raw `&TARGETS` store value from a `.kmn` header, or null when absent. */
function readKmnTargets(kmnText: string | null): string | null {
  if (kmnText === null) return null;
  const beginMatch = /^\s*begin\s/im.exec(kmnText);
  const header = beginMatch !== null ? kmnText.slice(0, beginMatch.index) : kmnText;
  const m = /store\s*\(\s*&TARGETS\s*\)\s*(?:'([^']*)'|"([^"]*)")/i.exec(header);
  const value = m?.[1] ?? m?.[2] ?? null;
  return value !== null ? value.trim() : null;
}

/**
 * Target/device-mix categorization from declared metadata + artifact presence.
 * Always returns a valid record (never null / never throws): the worst case is
 * the desktop default at the `default-fallback` tier.
 */
export function targetMixFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void def;

  const kpsSource = kb.sources.find((s) => s.path === kb.kpsPath);
  const kpsXml = kpsSource ? kpsSource.bytes.toString("utf8") : "";

  // `<Targets>` presence — parseKps defaults an ABSENT <Targets> to ["windows"],
  // so we cannot read "was it declared?" from the parsed list; detect the raw
  // element instead to keep declared-windows distinct from defaulted-windows.
  //
  // Use the SAME regex parseKps extracts with (kps-parser.ts) so "declared" is
  // exactly "parseKps parsed a non-default value" — a looser detector (e.g.
  // attribute- or case-tolerant) would flag `declared-metadata` while parseKps
  // returned nothing, silently under-reporting device classes (km-keyman review).
  const targetsDeclared = /<Targets\s*>([^<]+)<\/Targets>/.test(kpsXml);
  const kpsTargets: KeymanPlatformTarget[] = kpsXml ? parseKps(kpsXml).targets : [];

  const kmnTargetsRaw = readKmnTargets(kb.kmnText);
  const kmnTargets = kmnTargetsRaw !== null ? kmnTargetsRaw.split(/\s+/).filter(Boolean) : [];
  const kmnDeclaresAny = kmnTargets.some((t) => t.toLowerCase() === "any");

  // Touch-layout artifact presence: a `.keyman-touch-layout` sibling collected by
  // the scanner. Its presence is the highest-fidelity signal for `touch`.
  const touchArtifactPresent = kb.sources.some((s) => /\.keyman-touch-layout$/i.test(s.path));

  // ------ assemble device classes with per-source provenance ------
  const declared = new Set<DeviceClass>();

  // .kps <Targets> — only when actually declared (a defaulted ["windows"] is handled below).
  if (targetsDeclared) {
    for (const t of kpsTargets) {
      const dc = deviceClassOf(t);
      if (dc) declared.add(dc);
    }
  }
  // .kmn &TARGETS — `any` expands to every device class; otherwise map each token.
  if (kmnDeclaresAny) {
    for (const dc of ALL_DEVICE_CLASSES) declared.add(dc);
  } else {
    for (const t of kmnTargets) {
      const dc = deviceClassOf(t);
      if (dc) declared.add(dc);
    }
  }

  const anyDeclaration = declared.size > 0;

  // Union declaration with artifact evidence; artifact outranks declaration for `touch`.
  const devices = new Set<DeviceClass>(declared);
  const touchDeclared = declared.has("touch");
  if (touchArtifactPresent) devices.add("touch");

  // Default: no declaration and no artifact ⇒ desktop (windows), FR-014 AC2.
  let provenanceTier: Categorization["provenanceTier"];
  if (!anyDeclaration && !touchArtifactPresent) {
    devices.add("desktop");
    provenanceTier = "default-fallback";
  } else {
    provenanceTier = "declared-metadata";
  }

  const value = [...devices].sort();

  // Declaration/artifact mismatch flag (FR-014 AC1).
  const mismatch = touchArtifactPresent && !touchDeclared;
  const noteParts: string[] = [];
  if (mismatch) {
    noteParts.push("touch-layout artifact present but touch not declared (artifact outranks declaration)");
  }
  if (!anyDeclaration && !touchArtifactPresent) {
    noteParts.push("no <Targets>/&TARGETS declaration; defaulted to desktop (windows)");
  }
  const provenance = [
    targetsDeclared ? `kps:[${kpsTargets.join(",")}]` : null,
    kmnTargetsRaw !== null ? `kmn:[${kmnTargetsRaw}]` : null,
    touchArtifactPresent ? "artifact:touch-layout" : null,
  ].filter(Boolean);
  if (provenance.length > 0) noteParts.push(`sources: ${provenance.join(" ")}`);

  const confidenceClass: ConfidenceClass = mismatch ? "mixed" : "confident";

  return {
    value,
    confidence: null,
    confidenceClass,
    provenanceTier,
    evidenceSize: value.length,
    analyzedCoverage: 1, // declared metadata is read in full; there is nothing opaque to miss
    analysisOutcome: "fully",
    ...(noteParts.length > 0 ? { notes: noteParts.join("; ") } : {}),
  };
}
