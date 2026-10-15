// Documentation completeness (spec 080, data-model.md).
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
export type StartDocLevel = "none" | "minimal" | "full" | "unknown";

/** Which welcome-page convention a base uses; "folder" wins when both exist. */
export type WelcomeConvention = "folder" | "flat" | "absent";

export interface StartDocumentationProfile {
  level: StartDocLevel;
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

/**
 * The author's answer to one deterministic documentation-fix proposal
 * (issue #1908, the #504 posture): a proposal is only ever applied after
 * the author accepts it, and a decline is recorded too — so the same
 * finding is not re-proposed as if never seen, and either answer can be
 * revisited (the record is a whole-value working-copy slice, replaced on
 * every change).
 */
export type DocFixProposalState = "accepted" | "declined";

/** Which inherited page's body a body-parity fix copies to the other (issue #1908). */
export type DocBodySyncSource = "welcome" | "help";

/**
 * The recorded documentation-fix proposals for an adaptation (issue
 * #1908): the deterministic Layer C fixes for the inherited welcome/help
 * members, each present only once the author has answered its proposal.
 * Absent fields mean "not answered yet" — the inherited bytes and their
 * findings are then exactly as they were.
 */
export interface DocFixProposals {
  /** Criterion 11.7: rewrite the help page's $pagename/$pagetitle to the expected form. */
  pagename?: DocFixProposalState;
  /** Criterion 11.9: sync the welcome/help bodies from the named canonical side, or declined. */
  bodySync?: DocBodySyncSource | "declined";
  /** Criterion 11.8: add an `img { max-width: 100%; }` rule to the shipped kb.css. */
  imageWidth?: DocFixProposalState;
}

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
  /**
   * Texts of the package's bundled stylesheets (every `.css` under
   * `source/`), for criterion 11.8 (spec 084 Batch 2): a custom help
   * image's width constraint may live in a CSS class rule rather than
   * on the tag. Optional — collectors that cannot see the stylesheets
   * omit it, and 11.8 then judges tag-level constraints only.
   */
  cssTexts?: readonly string[];
  /** For criterion 3.7. */
  deletedFilenames: string[];
  /** For criterion 3.4 (entries present at instantiation). */
  startHistoryMdText?: string;
}
