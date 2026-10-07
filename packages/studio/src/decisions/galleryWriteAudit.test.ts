// galleryWriteAudit — spec 090 FR-003 layer 2 (research R4): the call-site
// checker for gallery renderer trees.
//
// FR-003: a migrated renderer receives its decision value through
// DecisionRendererProps and reports changes through onChange ONLY — it
// never calls a store write action itself. Layer 1 (depcruise
// `gallery-modules-no-store-writes`) keeps stores out of the module files;
// this layer watches the renderer COMPONENT trees, which legitimately
// import stores for reads, and bans call sites of the write actions each
// story retires. The ESLint overlay in eslint.config.mjs carries the same
// lists for editor-time feedback; this test is the CI gate.
//
// Scaffolding (T007) lands with an EMPTY audit list: each story extends it
// in its own change (US1: T014, US2: T027, US3: T035, US4: T043), and T060
// asserts the final lists leave zero exceptions (SC-002). The scanner
// self-test below proves the machinery flags a planted call site, so the
// empty state asserts something real rather than nothing at all.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** One story's renderer trees and the write actions banned inside them. */
export interface GalleryWriteAuditEntry {
  /** The story that registered this entry (e.g. "US1"). */
  story: string;
  /** Files or directories, relative to packages/studio/src, forming the tree. */
  trees: readonly string[];
  /** Store write-action identifiers that must not be CALLED in the trees. */
  identifiers: readonly string[];
}

/**
 * The audit list. Empty at scaffolding (T007) BY DESIGN — each story's
 * migration task extends it with the trees it migrated and the write
 * actions those trees used to call (research R4's identifier list).
 */
export const GALLERY_WRITE_AUDIT: readonly GalleryWriteAuditEntry[] = [
  {
    story: "US1",
    trees: [
      "survey/layout/LayoutStep.tsx",
      "survey/touchSeedSource/TouchSeedSourcePanel.tsx",
      "survey/chooseBase/BaseKeyboardRenderer.tsx",
      "editors/panels/BaseResolution.tsx",
    ],
    identifiers: ["saveAnswer", "setLocalBase", "setBaseConfirmed", "setTouchSeedSource"],
  },
  {
    // US2 (T027): the Phase B/C store write path is retired — T025 deleted
    // phaseBDraftStore, and its accept/decline/setter actions survive ONLY
    // as pure functions over the decision values (survey/phaseBDraftOps.ts)
    // and hook methods that record through the gallery host
    // (survey/useInventoryDraft.ts). Those names are therefore NOT bannable
    // (they are the sanctioned decision path now); the bannable signature
    // of the old write path is the deleted store's hook itself.
    story: "US2",
    trees: [
      "survey/CharactersStep.tsx",
      "survey/PhaseB.tsx",
      "survey/CharacterMapPane.tsx",
      "survey/marks",
      "survey/punctuation",
      "survey/invisibles",
      "survey/convenience",
    ],
    identifiers: ["usePhaseBDraftStore"],
  },
  {
    // US2 (T027): the trees whose answer writes US2 retired in full —
    // invisibles (ops only, never wrote answers) and convenience (its
    // per-candidate booleans left the store in T024, D-090-17).
    story: "US2",
    trees: ["survey/invisibles", "survey/convenience"],
    identifiers: ["saveAnswer"],
  },
  {
    // US3 (T035, ungated slice): the retired Phase B draft store's hook
    // is banned in the Phase D trees too — it is retired globally
    // (SC-004 grep: zero references in src). The action-name bans T035
    // names (cascadeDelete/cascadeRestore/restoreAll/keepAll/
    // prefillCarveDispositions/commitDeadkeyOp) are NOT registered:
    // under the as-built US3 precedent those actions are the decision
    // values' internal write paths (the carve overlay; the deadkey op
    // log the decision records), and banning them awaits the lead's
    // ruling on D-090-24/D-090-27 — see the note after this list.
    story: "US3",
    trees: [
      "editors/carve",
      "editors/deadkey",
      "editors/adapters/deadkeyAdapter.tsx",
      "editors/adapters/carveAdapter.tsx",
      "survey/rules",
      "survey/deadkeys",
    ],
    identifiers: ["usePhaseBDraftStore"],
  },
  // NOT REGISTERED — ruled scope determination (T026, D-090-29, lead
  // ruling on D-090-19/D-090-20): there is no `saveAnswer` ban over the
  // marks / characters / punctuation trees, and none is pending. Those
  // calls are the spec-079 answer-store evidence layer — marks'
  // per-toggle answers (D-090-16(2)), characters' addition answers,
  // punctuation's inventory answer — which is spec 079's own draft
  // surface (the answer store's sanctioned narrowed role after T026),
  // not a gallery write-around: FR-003's ban targets gallery components
  // writing answers IN PLACE OF decision records, and these calls are
  // the within-step draft state the decision values are composed from.
  // This is a scope determination, not an exception: T060's
  // zero-exceptions assertion reads on the banned category so defined.
];

/** A single banned call site found in a source text. */
export interface WriteCallSite {
  identifier: string;
  /** 1-based line number within the scanned source. */
  line: number;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find call sites of the given identifiers in one source text: a bare call
 * (`saveAnswer(`) or a member call (`anything.saveAnswer(`) both match the
 * word-boundary + open-paren shape. Mentions without a following paren
 * (imports of a type, prose) do not match — but a comment showing a call
 * DOES, deliberately: renderer trees should not even document the old
 * write path as a call.
 */
export function findWriteCallSites(
  source: string,
  identifiers: readonly string[],
): WriteCallSite[] {
  const hits: WriteCallSite[] = [];
  const lines = source.split("\n");
  for (const identifier of identifiers) {
    const pattern = new RegExp(`\\b${escapeRegExp(identifier)}\\s*\\(`);
    lines.forEach((text, i) => {
      if (pattern.test(text)) hits.push({ identifier, line: i + 1 });
    });
  }
  return hits.sort((a, b) => a.line - b.line);
}

/** Every .ts/.tsx source file under a tree path (files pass through). */
export function collectTreeFiles(treePath: string): string[] {
  const abs = resolve(SRC_ROOT, treePath);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [abs];
  const out: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const child = join(treePath, entry.name);
    if (entry.isDirectory()) out.push(...collectTreeFiles(child));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(resolve(SRC_ROOT, child));
    }
  }
  return out.sort();
}

describe("galleryWriteAudit scanner (self-test)", () => {
  it("flags bare and member call sites of a banned identifier", () => {
    const source = [
      "const a = saveAnswer(step, id, v);",
      "useSurveyAnswerStore.getState().saveAnswer(step, id, v);",
      "const label = 'saveAnswer'; // a mention, not a call",
    ].join("\n");
    expect(findWriteCallSites(source, ["saveAnswer"])).toEqual([
      { identifier: "saveAnswer", line: 1 },
      { identifier: "saveAnswer", line: 2 },
    ]);
  });

  it("finds nothing in a clean source or with an empty identifier list", () => {
    expect(findWriteCallSites("onChange(nextValue);", ["saveAnswer"])).toEqual([]);
    expect(findWriteCallSites("saveAnswer(x);", [])).toEqual([]);
  });
});

describe("galleryWriteAudit (FR-003 layer 2)", () => {
  it("every registered tree path exists (a typo cannot silently scan nothing)", () => {
    for (const entry of GALLERY_WRITE_AUDIT) {
      for (const tree of entry.trees) {
        expect(existsSync(resolve(SRC_ROOT, tree)), `${entry.story}: ${tree}`).toBe(true);
        expect(collectTreeFiles(tree).length, `${entry.story}: ${tree} has sources`).toBeGreaterThan(0);
      }
    }
  });

  it("no registered renderer tree calls a banned store write action", () => {
    const violations: string[] = [];
    for (const entry of GALLERY_WRITE_AUDIT) {
      for (const tree of entry.trees) {
        for (const file of collectTreeFiles(tree)) {
          const hits = findWriteCallSites(readFileSync(file, "utf-8"), entry.identifiers);
          for (const hit of hits) {
            violations.push(
              `${entry.story}: ${relative(SRC_ROOT, file)}:${hit.line} calls ${hit.identifier}(`,
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
