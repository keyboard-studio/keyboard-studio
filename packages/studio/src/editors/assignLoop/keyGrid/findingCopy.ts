// findingCopy — the ONE place a `TouchKeyFinding` or `TouchKeyFix` becomes
// author-facing English (spec 058 T116; FR-044, FR-051).
//
// The engine returns STRUCTURED findings and fix descriptors — a code, a
// severity, an address, and a `fields` bag of key ids / layer ids / `sp` numbers
// — and never a composed sentence (see
// `contracts/src/touch-key-diagnostics.ts`'s own module doc, which treats a
// `message:` string in that file as a defect). This module is the studio's side
// of that contract, following exactly the pattern `existingMethodLabels.ts`
// already established for `ContributorDescriptor` / `TouchMethodDescriptor`:
// one composition site, so the inspector, the grid's aria-live announcements,
// and any future surface cannot drift onto different templates for the same
// finding.
//
// Kept pure (no React, no store reads) and callable with an optional `i18n` —
// the same convention as `existingMethodLabels.ts` / `capabilityHint` /
// `publishManagedPRErrorMessage`: real components pass `i18n` from
// `useLingui()`; unit tests call these with no `i18n` and assert on the English
// source text baked into the `msg()` descriptor.
//
// ## Exhaustive over the code union, on purpose
//
// `findingTitle` and `fixLabel` both end in a `never`-typed default branch, so
// adding a `TouchKeyFindingCode` or a `TouchKeyFix` kind without adding its copy
// here is a COMPILE ERROR rather than a raw `TOUCH_KEY_…` identifier leaking
// into the UI. That is the mechanism the contracts module's doc promises when it
// says "adding a code here is a real commitment".
//
// ## Why `fields` is read defensively
//
// `TouchKeyFinding.fields` is `Readonly<Record<string, unknown>>` — deliberately
// open, so a detector can carry whatever structured context its own copy needs
// without a shape change rippling through the union. The cost is that this module
// cannot rely on the type system for field presence, so every read goes through
// {@link fieldText} / {@link fieldList}, which degrade to a placeholder rather
// than printing `undefined` at an author. A missing field is a defect in the
// detector, not something to crash the inspector over.

import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { TouchKeyFinding, TouchKeyFix } from "@keyboard-studio/contracts";
import { resolveMessage } from "../../../lib/i18nResolve.ts";

// ---------------------------------------------------------------------------
// Defensive field reads
// ---------------------------------------------------------------------------

/** Placeholder for a `fields` entry a detector should have supplied and did not. */
const MISSING = "?";

function fieldText(finding: TouchKeyFinding, key: string): string {
  const value = finding.fields[key];
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  return MISSING;
}

/** A `fields` entry that is a list of ids, joined for display. Never localized as a list — an id is an id in every locale. */
function fieldList(finding: TouchKeyFinding, key: string): string {
  const value = finding.fields[key];
  if (Array.isArray(value) && value.length > 0) return value.map(String).join(", ");
  return MISSING;
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

/**
 * The severity's own author-facing word, used as the accessible text that rides
 * beside the severity icon — FR-050 / US5 AS4's "conveyed by icon and text,
 * never colour alone". The icon carries no information the text does not.
 */
export function severityLabel(
  severity: TouchKeyFinding["severity"],
  i18n?: I18n,
): string {
  switch (severity) {
    case "error":
      return resolveMessage(i18n, msg({ id: "editor.assignLoop.keyGrid.finding.severity.error", message: "Error" }));
    case "warning":
      return resolveMessage(i18n, msg({ id: "editor.assignLoop.keyGrid.finding.severity.warning", message: "Warning" }));
    case "hint":
      return resolveMessage(i18n, msg({ id: "editor.assignLoop.keyGrid.finding.severity.hint", message: "Suggestion" }));
    default: {
      const exhaustive: never = severity;
      return String(exhaustive);
    }
  }
}

// ---------------------------------------------------------------------------
// Finding copy
// ---------------------------------------------------------------------------

/**
 * One short line naming what is wrong, in the author's terms — never a compiler
 * warning number and never a `TOUCH_KEY_*` code.
 *
 * Deliberately says what the AUTHOR observes ("pressing it does nothing")
 * rather than what the checker computed ("no binding of role produces"). The
 * mechanism belongs in {@link findingDetail}, which the inspector renders
 * underneath.
 */
export function findingTitle(finding: TouchKeyFinding, i18n?: I18n): string {
  const descriptor = findingTitleDescriptor(finding);
  return resolveMessage(i18n, descriptor);
}

function findingTitleDescriptor(finding: TouchKeyFinding): MessageDescriptor {
  const keyId = fieldText(finding, "keyId");
  switch (finding.code) {
    case "TOUCH_KEY_NO_RULE":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.noRule.title",
        message: `Nothing happens when you press "${{ keyId }}"`,
      });
    case "TOUCH_KEY_MISSING_LAYER":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.missingLayer.title",
        message: `This key switches to a layer that does not exist: "${{ target: fieldText(finding, "target") }}"`,
      });
    case "TOUCH_KEY_UNIDENTIFIED":
      return finding.fields.empty === true
        ? msg({
            id: "editor.assignLoop.keyGrid.finding.unidentified.empty.title",
            message: "This key has no id, so nothing can be wired to it",
          })
        : msg({
            id: "editor.assignLoop.keyGrid.finding.unidentified.title",
            message: `"${{ keyId }}" is not a key id Keyman can recognise`,
          });
    case "TOUCH_KEY_MISSING_REQUIRED_KEYS":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.missingRequiredKeys.title",
        message: `Layer "${{ layerId: fieldText(finding, "layerId") }}" is missing required keys: ${{ missingKeyIds: fieldList(finding, "missingKeyIds") }}`,
      });
    case "TOUCH_KEY_SPECIAL_LABEL_ON_NORMAL":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.specialLabel.title",
        message: `The keycap "${{ text: fieldText(finding, "text") }}" will not show as typed text on this key`,
      });
    case "TOUCH_KEY_DUPLICATE_ID":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.duplicateId.title",
        message: `Two keys on this layer share the id "${{ keyId }}"`,
      });
    case "TOUCH_KEY_RULE_ORPHAN":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.ruleOrphan.title",
        message: `A rule is written for "${{ keyIdAsWritten: fieldText(finding, "keyIdAsWritten") }}", but no key you can reach carries that id`,
      });
    case "TOUCH_KEY_LAYER_SWITCH_ACTIVE_MISMATCH":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.layerSwitchActive.title",
        message: "This layer-switch key is drawn in the wrong state",
      });
    case "TOUCH_KEY_HALF_DONE_SUPPRESSION":
      return finding.fields.kind === "stillLive"
        ? msg({
            id: "editor.assignLoop.keyGrid.finding.halfDoneSuppression.stillLive.title",
            message: `"${{ keyId }}" is hidden, but still types something`,
          })
        : msg({
            id: "editor.assignLoop.keyGrid.finding.halfDoneSuppression.invisibleDead.title",
            message: "This key looks usable, but types nothing",
          });
    case "TOUCH_KEY_ID_CASE":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.idCase.title",
        message: `"${{ keyId }}" is spelled with different capitalisation in its rule`,
      });
    case "TOUCH_KEY_MIXED_SUPPRESS_REMOVE":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.mixedSuppressRemove.title",
        message: `Layer "${{ layerId: fieldText(finding, "layerId") }}" mixes hidden keys and deleted keys`,
      });
    case "TOUCH_KEY_ROW_CROWDED":
      // Row numbers are 1-based for the author: `fields.rowIndex` is the
      // 0-based array index every other consumer wants, and the grid's own
      // `aria-rowindex` is likewise +1 (KeyGrid.tsx).
      return msg({
        id: "editor.assignLoop.keyGrid.finding.rowCrowded.title",
        message: `Row ${{ rowNumber: Number(finding.fields.rowIndex ?? 0) + 1 }} has ${{ interactiveKeyCount: fieldText(finding, "interactiveKeyCount") }} keys, more than ${{ platform: fieldText(finding, "platform") }} fits comfortably`,
      });
    case "TOUCH_KEY_KEYCAP_MISMATCH":
      // Names both halves, because the author needs to compare them to judge
      // whether the hint is right — this is a judgement call, not a defect.
      return msg({
        id: "editor.assignLoop.keyGrid.finding.keycapMismatch.title",
        message: `This key is labelled "${{ keycap: fieldText(finding, "keycap") }}" but types "${{ output: fieldText(finding, "output") }}"`,
      });
    default: {
      // Exhaustiveness guard — see the module doc. A new code without copy is a
      // compile error here, not a raw identifier rendered at an author.
      const exhaustive: never = finding.code;
      return msg({
        id: "editor.assignLoop.keyGrid.finding.unknown.title",
        message: `Unrecognised diagnostic: ${{ code: String(exhaustive) }}`,
      });
    }
  }
}

/**
 * The mechanism behind the title: why this is a problem, and (where it matters)
 * what the checker could and could not prove.
 *
 * Returns `undefined` when the title already says everything — a detail line
 * that only restates the title is noise, and an inspector row that is sometimes
 * absent is cheaper to read than one that is always redundant.
 */
export function findingDetail(finding: TouchKeyFinding, i18n?: I18n): string | undefined {
  const descriptor = findingDetailDescriptor(finding);
  return descriptor === undefined ? undefined : resolveMessage(i18n, descriptor);
}

function findingDetailDescriptor(finding: TouchKeyFinding): MessageDescriptor | undefined {
  switch (finding.code) {
    case "TOUCH_KEY_NO_RULE":
      // The opaque-fragment downgrade is the author's business: it is the
      // difference between "this is broken" and "we could not check".
      return finding.fields.hasOpaque === true
        ? msg({
            id: "editor.assignLoop.keyGrid.finding.noRule.detail.opaque",
            message:
              "A key id starting with T_ only types something if a rule is written for it. No rule was found — but this keyboard contains parts we could not read, which may already define one.",
          })
        : msg({
            id: "editor.assignLoop.keyGrid.finding.noRule.detail",
            message:
              "A key id starting with T_ has no output of its own; it types only what a rule gives it. No rule mentions this one.",
          });
    case "TOUCH_KEY_MISSING_LAYER":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.missingLayer.detail",
        message:
          "Pressing the key does nothing, and any keys you meant to put on that layer cannot be reached at all.",
      });
    case "TOUCH_KEY_UNIDENTIFIED":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.unidentified.detail",
        message:
          "A key id must start with K_ (a keyboard key), T_ (your own key, wired by a rule), or U_ (a character, typed directly).",
      });
    case "TOUCH_KEY_MISSING_REQUIRED_KEYS":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.missingRequiredKeys.detail",
        message:
          "Keyman expects every layer to offer backspace, enter, and the options key, so a typist is never stranded on a layer.",
      });
    case "TOUCH_KEY_SPECIAL_LABEL_ON_NORMAL":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.specialLabel.detail",
        message:
          "A keycap written between asterisks is a name Keyman looks up, not text — it is meant for system keys such as shift. On an ordinary key it will not appear as you wrote it.",
      });
    case "TOUCH_KEY_DUPLICATE_ID":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.duplicateId.detail",
        message:
          "A rule cannot tell the two apart, so whichever it matches fires for both — one key behaves as the other.",
      });
    case "TOUCH_KEY_RULE_ORPHAN":
      return typeof finding.fields.nearMissId === "string" &&
        finding.fields.nearMissSelfOutputs === true
        ? msg({
            id: "editor.assignLoop.keyGrid.finding.ruleOrphan.detail.nearMiss",
            message: `The layout has "${{ nearMissId: String(finding.fields.nearMissId) }}" instead, which types its character directly — so your rule never gets a chance to run.`,
          })
        : msg({
            id: "editor.assignLoop.keyGrid.finding.ruleOrphan.detail",
            message:
              "The rule is written and looks correct, but no key reaches it, so the character it produces cannot be typed.",
          });
    case "TOUCH_KEY_LAYER_SWITCH_ACTIVE_MISMATCH":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.layerSwitchActive.detail",
        message:
          "A layer-switch key is shown engaged on the layer it leads to, and inactive everywhere else, so a typist can see where they are.",
      });
    case "TOUCH_KEY_HALF_DONE_SUPPRESSION":
      return finding.fields.kind === "stillLive"
        ? msg({
            id: "editor.assignLoop.keyGrid.finding.halfDoneSuppression.stillLive.detail",
            message:
              "Hiding a key changes how it is drawn. Its id is still wired to a rule, so wherever the key can be reached it still types.",
          })
        : msg({
            id: "editor.assignLoop.keyGrid.finding.halfDoneSuppression.invisibleDead.detail",
            message:
              "Its id was replaced with a placeholder that types nothing, but the key is still drawn as an ordinary key, so nothing warns the typist.",
          });
    case "TOUCH_KEY_ID_CASE":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.idCase.detail",
        message: `The rule spells it ${{ ruleSpellings: fieldList(finding, "ruleSpellings") }}. This works here, but Keyman Developer compares capitalisation exactly and will warn about it.`,
      });
    case "TOUCH_KEY_MIXED_SUPPRESS_REMOVE":
      return msg({
        id: "editor.assignLoop.keyGrid.finding.mixedSuppressRemove.detail",
        message:
          "Hiding a key keeps its space; deleting one closes the gap. Doing both on one layer usually leaves the spacing looking accidental.",
      });
    case "TOUCH_KEY_ROW_CROWDED":
      // Says plainly that nothing is blocked (FR-014). A warning the author
      // cannot act on, and does not have to, should say so rather than leave
      // them looking for the thing they broke.
      return msg({
        id: "editor.assignLoop.keyGrid.finding.rowCrowded.detail",
        message: `Past about ${{ platformMaxKeys: fieldText(finding, "platformMaxKeys") }} keys in a row, each key gets too narrow to hit reliably on a small screen. You can leave it this way — nothing here is blocked.`,
      });
    case "TOUCH_KEY_KEYCAP_MISMATCH":
      // Says out loud that leaving it is legitimate. A keycap deliberately
      // unlike its output is a real design choice in plenty of scripts, and
      // this hint must not read as an accusation.
      return msg({
        id: "editor.assignLoop.keyGrid.finding.keycapMismatch.detail",
        message:
          "Usually this means the label was left behind when the key changed. If you meant it, leave it — setting the label yourself stops this being mentioned again.",
      });
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Fix copy
// ---------------------------------------------------------------------------

/**
 * The label on a fix's button — an imperative naming what will happen, so the
 * author never has to guess what a fix does before pressing it (FR-041's
 * "concrete fix action" read from the author's side).
 */
export function fixLabel(fix: TouchKeyFix, i18n?: I18n): string {
  return resolveMessage(i18n, fixLabelDescriptor(fix));
}

function fixLabelDescriptor(fix: TouchKeyFix): MessageDescriptor {
  switch (fix.kind) {
    case "addRule":
      return msg({
        id: "editor.assignLoop.keyGrid.fix.addRule",
        message: "Choose what this key types",
      });
    case "convertToUnicodeId":
      return fix.toId !== undefined
        ? msg({
            id: "editor.assignLoop.keyGrid.fix.convertToUnicodeId.known",
            message: `Rename to "${{ toId: fix.toId }}" so it types its character directly`,
          })
        : msg({
            id: "editor.assignLoop.keyGrid.fix.convertToUnicodeId",
            message: "Rename it to a character id that types directly",
          });
    case "renameKey":
      return fix.toId !== undefined
        ? msg({
            id: "editor.assignLoop.keyGrid.fix.renameKey.known",
            message: `Rename this key to "${{ toId: fix.toId }}"`,
          })
        : msg({
            id: "editor.assignLoop.keyGrid.fix.renameKey",
            message: "Give this key a different id",
          });
    case "repointNextlayer":
      return msg({
        id: "editor.assignLoop.keyGrid.fix.repointNextlayer",
        message: "Point this key at a layer that exists",
      });
    case "removeNextlayer":
      return msg({
        id: "editor.assignLoop.keyGrid.fix.removeNextlayer",
        message: "Stop this key switching layers",
      });
    case "addRequiredKeys":
      return msg({
        id: "editor.assignLoop.keyGrid.fix.addRequiredKeys",
        message: `Add ${{ keyIds: fix.keyIds.join(", ") }} to this layer`,
      });
    case "clearSpecialLabel":
      return msg({
        id: "editor.assignLoop.keyGrid.fix.clearSpecialLabel",
        message: "Clear the keycap so you can type a real one",
      });
    case "markAsFrameKey":
      return msg({
        id: "editor.assignLoop.keyGrid.fix.markAsFrameKey",
        message: "Make this a system key, so the label works",
      });
    case "completeSuppression":
      return msg({
        id: "editor.assignLoop.keyGrid.fix.completeSuppression",
        message: "Finish hiding this key",
      });
    case "setSp":
      return fix.sp === 2
        ? msg({
            id: "editor.assignLoop.keyGrid.fix.setSp.active",
            message: "Draw it as engaged on this layer",
          })
        : msg({
            id: "editor.assignLoop.keyGrid.fix.setSp.inactive",
            message: "Draw it as inactive on this layer",
          });
    case "trimRow":
      return msg({
        id: "editor.assignLoop.keyGrid.fix.trimRow",
        message: `Show me this row so I can remove ${{ overBy: fix.overBy }}`,
      });
    case "setKeycap":
      return msg({
        id: "editor.assignLoop.keyGrid.fix.setKeycap",
        message: `Label it "${{ proposed: fix.proposed }}"`,
      });
    case "reviewKey":
      return msg({
        id: "editor.assignLoop.keyGrid.fix.reviewKey",
        message: "Show me this key",
      });
    default: {
      // Exhaustiveness guard — see the module doc.
      const exhaustive: never = fix;
      return msg({
        id: "editor.assignLoop.keyGrid.fix.unknown",
        message: `Unrecognised fix: ${{ fix: JSON.stringify(exhaustive) }}`,
      });
    }
  }
}

/**
 * One line combining severity, title, and count, for the grid's `aria-live`
 * announcement (T117) — a screen-reader user hears the same three facts a
 * sighted user reads from the icon, the text, and the badge.
 *
 * Announcing the SELECTED cell's findings (rather than every finding in the
 * layer) is deliberate: an announcement fires on selection change, and reading
 * out a layer's worth of diagnostics on every arrow key would make the grid
 * unusable with a screen reader.
 */
export function findingAnnouncement(
  findings: readonly TouchKeyFinding[],
  i18n?: I18n,
): string | undefined {
  const first = findings[0];
  if (first === undefined) return undefined;

  const primary = `${severityLabel(first.severity, i18n)}: ${findingTitle(first, i18n)}`;
  if (findings.length === 1) return primary;
  return resolveMessage(
    i18n,
    msg({
      id: "editor.assignLoop.keyGrid.finding.announcementMore",
      message: `${{ primary }}. ${{ count: findings.length - 1 }} more on this key.`,
    }),
  );
}
