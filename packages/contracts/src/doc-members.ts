// Documentation completeness (spec 076, data-model.md).
//
// Additive contract types for the six documentation members every produced
// package ships, the tier each member's content came from, the base's
// documentation profile, the HISTORY proposal, layout charts, and the input
// to the Layer C documentation checks. Every runtime-boundary type here has a
// zod mirror in schemas.ts pinned by a compile-time drift guard (Article I).

import type { KeyboardIR, KvksIR, TouchLayoutIR } from "./keyboard-ir";

// ---------------------------------------------------------------------------
// §1 Documentation member + source tier
// ---------------------------------------------------------------------------

/** The six shipped documentation members, in checklist order (FR-001). */
export type DocMemberId =
  | "readme-md" // README.md
  | "history-md" // HISTORY.md
  | "license-md" // LICENSE.md
  | "readme-htm" // source/readme.htm
  | "welcome-htm" // source/welcome/welcome.htm
  | "help-php"; // source/help/<id>.php

/** Checklist order and the closed set behind `DocMemberId` (one source). */
export const DOC_MEMBER_IDS: readonly DocMemberId[] = [
  "readme-md",
  "history-md",
  "license-md",
  "readme-htm",
  "welcome-htm",
  "help-php",
];

/**
 * Projected output path of each member (FR-001); only the help page is
 * keyboard-id dependent. Lives here — not in the engine — because both the
 * engine (tier derivation) and `@keymanapp/keyboard-lint` (finding locations)
 * need the one rule, and keyboard-lint may import contracts only.
 */
export function docMemberPath(member: DocMemberId, keyboardId: string): string {
  switch (member) {
    case "readme-md":
      return "README.md";
    case "history-md":
      return "HISTORY.md";
    case "license-md":
      return "LICENSE.md";
    case "readme-htm":
      return "source/readme.htm";
    case "welcome-htm":
      return "source/welcome/welcome.htm";
    case "help-php":
      return `source/help/${keyboardId}.php`;
  }
}

/** Where a member's current content came from — the FR-005 priority order. */
export type DocSourceTier = "derived" | "inherited" | "authored";

export interface DocMemberState {
  member: DocMemberId;
  /** Projected output path, e.g. "source/welcome/welcome.htm". */
  path: string;
  /** Highest-priority tier that contributed prose (FR-005 order). */
  tier: DocSourceTier;
  /** True while content is the fallback stub (FR-017 marker). */
  placeholder: boolean;
  /** Step id that supplies this member's content (checklist link-back target). */
  fillStepId: string;
  /** Row annotations, e.g. missing inherited images (spec edge case). */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// §2 Base documentation profile
// ---------------------------------------------------------------------------

/** "unknown" until computed for the focused/selected base (FR-008). */
export type BaseDocLevel = "none" | "minimal" | "full" | "unknown";

/** Which welcome-page convention a base uses; "folder" wins when both exist. */
export type WelcomeConvention = "folder" | "flat" | "absent";

export interface BaseDocumentationProfile {
  level: BaseDocLevel;
  /** Members the base ships (from its .kps <Files>). */
  members: DocMemberId[];
  welcomeConvention: WelcomeConvention;
  /** Welcome-folder image paths declared by the base's .kps (source/-relative). */
  welcomeImages: string[];
  /** FR-009 gate: the base has a usable description per the spec's threshold. */
  hasUsableDescription: boolean;
}

/**
 * One file fetched from a base's `source/welcome/` folder (data-model §6),
 * carried into the working copy so the projection can write it beside the
 * welcome page (FR-006) and the descriptor can list it (FR-002).
 *
 * `path` is `source/`-relative in POSIX form (`welcome/desktop_default.png`) —
 * the same shape the projection writes under `source/`. The descriptor's
 * backslash form (`welcome\desktop_default.png`) is derived at write time,
 * never stored.
 */
export interface WelcomeFolderImage {
  path: string;
  bytes: Uint8Array;
}

// ---------------------------------------------------------------------------
// §3 HISTORY proposal
// ---------------------------------------------------------------------------

export type HistoryProposalStatus = "proposed" | "confirmed" | "edited" | "dismissed";

export interface HistoryProposal {
  /** Version the heading was derived for; re-derived on version change. */
  version: string;
  /** Injected date recorded at proposal/confirmation time (determinism, R12). */
  dateIso: string;
  bullets: string[];
}

export interface HistoryEntryState {
  status: HistoryProposalStatus;
  proposal: HistoryProposal;
  /** Author-edited bullets; null until edited. */
  editedBullets: string[] | null;
}

// ---------------------------------------------------------------------------
// §4 Layout charts
// ---------------------------------------------------------------------------

export type LayoutChartPlatform = "desktop" | "phone" | "tablet";

export interface LayoutChartFile {
  /** "ks-layout-<platform>-<layer>.svg" — reserved prefix, collision-free (FR-015). */
  filename: string;
  platform: LayoutChartPlatform;
  layerId: string;
  /** Deterministic SVG text (FR-014). */
  svg: string;
}

export interface LayoutChartInput {
  displayName: string;
  /** Desktop labels when present. */
  kvks: KvksIR | null;
  /** Desktop fallback via rule outputs. */
  ir: KeyboardIR;
  /** Geometry-bearing touch model. */
  touchLayout: TouchLayoutIR | null;
}

// ---------------------------------------------------------------------------
// §5 Chart preference (working-copy slice)
// ---------------------------------------------------------------------------

/** Defaults to "keep-base-images" when the base ships images, else "regenerate" (FR-015). */
export type ChartPreference = "keep-base-images" | "regenerate";

// ---------------------------------------------------------------------------
// §7 Layer C documentation check input
// ---------------------------------------------------------------------------

export interface DocLintCopyrightHolders {
  license?: string;
  kmn?: string;
  kps?: string;
  readme?: string;
  history?: string;
}

export interface DocLintInput {
  keyboardId: string;
  /** From .kmn &VERSION / identity. */
  keyboardVersion: string;
  /** Parsed &TARGETS tokens. */
  targets: string[];
  /** Desktop + touch layer ids (criterion 11.6). */
  layerIds: string[];
  /** For the 11.7 page-name format. */
  displayName: string;
  /** For criterion 4.7. */
  copyrightHolders: DocLintCopyrightHolders;
  /** Rendered / current member texts. */
  members: Partial<Record<DocMemberId, string>>;
  /** For criterion 3.7. */
  deletedFilenames: string[];
  /** For criterion 3.4 (entries present at instantiation). */
  baseHistoryMdText?: string;
}
