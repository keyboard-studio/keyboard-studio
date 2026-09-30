// RuleBuilderPanel — spec 082 Track B (rule builder), FR-007, plus FR-018
// (Matthew's rewrite, 2026-09-28).
//
// The authoring surface the rules step mounts for "Save bundle": family-level
// rule selection (implicit step 0, one tap bundles a whole family, with
// automatic touch-layer twin suggestions), then a 3-step flow — 1. Name it,
// 2. Prove it, 3. Save — exporting a schema-validated bundle (a versioned
// RulePack) via onExport, followed by a plain confirmation card.
//
// User-facing copy says "bundle" everywhere; code and schema identifiers
// keep "pack".
//
// Contracts with sibling workstreams:
// - workstream 2 mounts this panel with { selectedRules, keyboardMeta,
//   scriptKey, onExport }. `families` comes from kmAssist's `groupRules`
//   (spec 082 FR-018), imported from the engine above.
// - the Track A demo pane wires onRecordDemo; until then manual entry covers
//   pair recording. Pairs recorded from the pane are verified (recording
//   implies the demo ran green); manually added pairs are not, and saving
//   needs at least one verified pair.

import { useState, type CSSProperties, type RefCallback } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  FAMILY_ID_PARAMETER_KEY,
  FAMILY_NAME_PARAMETER_KEY,
  PACK_VERSION,
  validateRulePack,
  type BehaviourKind,
  type DemoPair,
  type IRRule,
  type ContextElement,
  type OutputElement,
  type RulePack,
} from "@keyboard-studio/contracts";
import {
  classifyRuleKind,
  type RuleFamily,
  type RuleKind,
} from "@keyboard-studio/engine/kmAssist";
import {
  ACCENT,
  BG_CARD,
  BORDER,
  CSS_TEXT_ON_ACCENT,
  ERROR_BG,
  ERROR_TEXT,
  FONT_MONO,
  TEXT_DIM,
  TEXT_MAIN,
} from "../../ui/theme.ts";
import { useGuardIntentStore } from "../../stores/guardIntentStore.ts";

/* RuleFamily is imported from "@keyboard-studio/engine/kmAssist" above. */

export interface RuleBuilderPanelProps {
  /** Rules selected in the rules step. */
  selectedRules: IRRule[];
  /**
   * Rule families from kmAssist's `groupRules` (FR-018). When provided, the
   * selection UI leads with family-level checkboxes; when absent, the panel
   * falls back to the flat individual-rule list.
   */
  families?: RuleFamily[];
  /** Source-keyboard metadata; pre-fills provenance (shown in Details). */
  keyboardMeta: {
    id: string;
    name: string;
    copyright: string;
    license: string;
  };
  /**
   * Script key from keyboard/script detection (e.g. "Latn"); shown in
   * Details as automatic and used for the confirmation card. The rules step
   * supplies this — saving is blocked with an inline error when absent.
   */
  scriptKey?: string;
  /** Called with the canonical bundle JSON after successful validation. */
  onExport: (json: string) => void;
  /**
   * Hook for recording a demo pair from the Track A demo pane. Recorded
   * pairs are marked verified (recording implies the demo ran green).
   */
  onRecordDemo?: () => Promise<{ input: string; expectedOutput: string }>;
}

// ---------------------------------------------------------------------------
// Display-only rule text
// ---------------------------------------------------------------------------

function fmtCodepoint(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp > 0xffff) {
    return `'${ch}'`;
  }
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

function fmtDeadkey(id: number): string {
  return `dk(${id.toString(16).toLowerCase().padStart(4, "0")})`;
}

function fmtContextElement(el: ContextElement): string {
  switch (el.kind) {
    case "char":
      return fmtCodepoint(el.value);
    case "vkey":
      return el.modifiers.length > 0 ? `[${el.modifiers.join(" ")} ${el.name}]` : `[${el.name}]`;
    case "deadkey":
      return fmtDeadkey(el.id);
    case "any":
      return `any(${el.storeRef})`;
    case "notany":
      return `notany(${el.storeRef})`;
    case "context":
      return `context(${el.offset})`;
    case "index":
      return `index(${el.storeRef}, ${el.offset})`;
    case "baselayout":
      return el.value ? `baselayout('${el.value}')` : "baselayout";
    case "raw":
      return el.text;
  }
}

function fmtOutputElement(el: OutputElement): string {
  switch (el.kind) {
    case "char":
      return fmtCodepoint(el.value);
    case "deadkey":
      return fmtDeadkey(el.id);
    case "beep":
      return "beep";
    case "nul":
      return "nul";
    case "context":
      return el.offset === 0 ? "context" : `context(${el.offset})`;
    case "index":
      return `index(${el.storeRef}, ${el.offset})`;
    case "outs":
      return `outs(${el.storeRef})`;
    case "useGroup":
      return `use(${el.groupName})`;
    case "raw":
      return el.text;
  }
}

/**
 * One-line KMN-style summary of a rule for the selection list.
 *
 * DISPLAY ONLY — the engine codec's emitRule is authoritative. This local
 * formatter exists because @keyboard-studio/engine's root index does not
 * re-export emitRule yet (its index.ts has uncommitted sibling changes);
 * switch to the engine export once it lands.
 */
export function formatRuleSummary(rule: IRRule): string {
  const parts = rule.context.map(fmtContextElement);
  const firstVkey = rule.context.findIndex(el => el.kind === "vkey");
  const hasPlus = rule.context.some(el => el.kind === "raw" && el.text.trim() === "+");
  if (firstVkey >= 0 && !hasPlus) {
    parts.splice(firstVkey, 0, "+");
  }
  const lhs = parts.join(" ");
  const rhs = rule.output.map(fmtOutputElement).join(" ");
  const prefix = rule.matchKind !== undefined ? `${rule.matchKind} ` : "";
  return `${prefix}${lhs} > ${rhs}`;
}

// ---------------------------------------------------------------------------
// Canonical JSON (mirrors the engine's exportPack byte-for-byte)
// ---------------------------------------------------------------------------

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (typeof value === "object" && value !== null) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Canonical bundle serialization: sorted keys, 2-space indent, trailing
 * newline. Byte-identical to the engine's exportPack; kept local until the
 * engine root index re-exports ./rulePacks (see note on formatRuleSummary).
 */
function canonicalPackJson(pack: RulePack): string {
  return JSON.stringify(sortKeysDeep(pack), null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// Family helpers (FR-018)
// ---------------------------------------------------------------------------

/** A rule is touch-layer when its trigger is a touch key (`T_0300`-style). */
function isTouchRule(rule: IRRule): boolean {
  return rule.context.some(el => el.kind === "vkey" && el.name.startsWith("T_"));
}

type FamilySelection = "all" | "some" | "none";

function selectionOf(rules: IRRule[], includedIds: string[]): FamilySelection {
  const included = rules.filter(rule => includedIds.includes(rule.nodeId)).length;
  if (included === 0) return "none";
  if (included === rules.length) return "all";
  return "some";
}

/** kmAssist RuleKind → the closed BehaviourKind set. */
const RULE_KIND_TO_BEHAVIOUR_KIND: Record<RuleKind, BehaviourKind> = {
  blocking: "block",
  context: "contextOutput",
  reorder: "reorderTable",
  "plain-output": "replace",
  opaque: "authored",
};

/**
 * Detect the behaviour kind from member rule shapes (kmAssist
 * classifyRuleKind). Uniform shapes map onto the closed kind set; a mixed
 * family is `authored` — an authored composition, not a guess.
 */
function detectBehaviourKind(rules: IRRule[]): { kind: BehaviourKind; mixed: boolean } {
  const kinds = rules.map(rule => RULE_KIND_TO_BEHAVIOUR_KIND[classifyRuleKind(rule)]);
  const first = kinds[0] ?? "authored";
  const mixed = kinds.some(kind => kind !== first);
  return { kind: mixed ? "authored" : first, mixed };
}

/** Touch-layer twin suggestion: same-shape rules from touch families. */
interface TwinSuggestion {
  family: RuleFamily;
  ruleIds: string[];
}

/**
 * Compute twin suggestions for fully-selected families: other families with
 * the same guard store and output shape whose members are all touch-layer
 * rules. Computed from the family data, never hardcoded.
 */
function computeTwinSuggestions(
  groups: { family: RuleFamily; rules: IRRule[] }[],
  includedIds: string[],
): TwinSuggestion[] {
  const suggestions: TwinSuggestion[] = [];
  for (const group of groups) {
    if (selectionOf(group.rules, includedIds) !== "all") continue;
    const { family } = group;
    if (family.guardStore === undefined) continue;
    for (const other of groups) {
      if (other.family.id === family.id) continue;
      if (other.family.guardStore !== family.guardStore) continue;
      if (other.family.outputShape !== family.outputShape) continue;
      if (!other.rules.every(isTouchRule)) continue;
      const ruleIds = other.rules
        .map(rule => rule.nodeId)
        .filter(id => !includedIds.includes(id));
      if (ruleIds.length > 0) {
        suggestions.push({ family: other.family, ruleIds });
      }
    }
  }
  return suggestions;
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SCRIPT_NAMES: Record<string, string> = {
  Latn: "Latin",
  Cyrl: "Cyrillic",
  Arab: "Arabic",
  Grek: "Greek",
  Hebr: "Hebrew",
  Deva: "Devanagari",
  Thai: "Thai",
  Armn: "Armenian",
  Geor: "Georgian",
  Hans: "Simplified Chinese",
  Hant: "Traditional Chinese",
  Jpan: "Japanese",
  Kore: "Korean",
};

function scriptName(scriptKey: string): string {
  return SCRIPT_NAMES[scriptKey] ?? scriptKey;
}

/** A demo pair with its proof state: recorded-from-pane pairs are verified. */
interface DemoPairState {
  input: string;
  expectedOutput: string;
  verified: boolean;
}

const fieldStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  fontSize: 13,
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  color: TEXT_MAIN,
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  color: TEXT_DIM,
  marginBottom: 4,
};

const buttonStyle: CSSProperties = {
  fontSize: 13,
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  color: TEXT_MAIN,
  cursor: "pointer",
  padding: "6px 12px",
};

const primaryButtonStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  background: ACCENT,
  border: "none",
  borderRadius: 4,
  color: CSS_TEXT_ON_ACCENT,
  cursor: "pointer",
  padding: "10px 16px",
};

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function RuleBuilderPanel({
  selectedRules,
  families,
  keyboardMeta,
  scriptKey,
  onExport,
  onRecordDemo,
}: RuleBuilderPanelProps) {
  const { t } = useLingui();

  const [includedIds, setIncludedIds] = useState<string[]>(() =>
    selectedRules.map(rule => rule.nodeId),
  );
  const [expandedFamilyIds, setExpandedFamilyIds] = useState<string[]>([]);
  const [bundleName, setBundleName] = useState("");
  const [descriptionOverride, setDescriptionOverride] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [pairs, setPairs] = useState<DemoPairState[]>([]);
  const [recording, setRecording] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<{ name: string; scriptLabel: string } | null>(null);

  // -- Family grouping ------------------------------------------------------

  const ruleById = new Map(selectedRules.map(rule => [rule.nodeId, rule] as const));
  const coveredRuleIds = new Set<string>();
  const groups = (families ?? [])
    .map(family => {
      const rules = family.memberIds
        .map(id => ruleById.get(id))
        .filter((rule): rule is IRRule => rule !== undefined);
      for (const rule of rules) coveredRuleIds.add(rule.nodeId);
      return { family, rules };
    })
    .filter(group => group.rules.length > 0);
  const ungroupedRules = selectedRules.filter(rule => !coveredRuleIds.has(rule.nodeId));

  const toggleRule = (nodeId: string) => {
    setIncludedIds(prev =>
      prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId],
    );
  };

  const toggleFamily = (group: { family: RuleFamily; rules: IRRule[] }) => {
    const memberIds = group.rules.map(rule => rule.nodeId);
    setIncludedIds(prev =>
      selectionOf(group.rules, prev) === "all"
        ? prev.filter(id => !memberIds.includes(id))
        : [...new Set([...prev, ...memberIds])],
    );
    // FR-020 intent signal: the author selected rules in this guard family —
    // guard suggestions for the family may now surface.
    useGuardIntentStore.getState().noteFamilyEdited(group.family.id);
  };

  const toggleExpanded = (familyId: string) => {
    setExpandedFamilyIds(prev =>
      prev.includes(familyId) ? prev.filter(id => id !== familyId) : [...prev, familyId],
    );
  };

  const indeterminateRef = (selection: FamilySelection): RefCallback<HTMLInputElement> => {
    return element => {
      if (element !== null) {
        element.indeterminate = selection === "some";
      }
    };
  };

  const twinSuggestions = computeTwinSuggestions(groups, includedIds);
  const acceptTwins = (suggestion: TwinSuggestion) => {
    setIncludedIds(prev => [...new Set([...prev, ...suggestion.ruleIds])]);
  };

  // -- Step 1: name + auto-drafted description --------------------------------

  const bundleId = slugify(bundleName.trim());

  const selectedFamilies = groups.filter(group =>
    group.rules.some(rule => includedIds.includes(rule.nodeId)),
  );
  const fallbackRuleCount = includedIds.length;
  const fallbackKeyboardName = keyboardMeta.name;
  const draftDescription =
    selectedFamilies.length > 0
      ? selectedFamilies.map(group => group.family.explanation).join(" ")
      : t({
          id: "ruleBuilder.description.fallback",
          message: `${fallbackRuleCount} rules from ${fallbackKeyboardName}.`,
        });
  const description = descriptionOverride ?? draftDescription;

  // -- Step 2: demo pairs ------------------------------------------------------

  const verifiedCount = pairs.filter(pair => pair.verified).length;

  const handleRecordFromDemoPane = async () => {
    if (onRecordDemo === undefined) {
      return;
    }
    setRecording(true);
    try {
      const recorded = await onRecordDemo();
      // Recorded from the pane: the demo ran green, so the pair is verified.
      setPairs(prev => [
        ...prev,
        { input: recorded.input, expectedOutput: recorded.expectedOutput, verified: true },
      ]);
    } catch {
      setErrors(prev => [
        ...prev,
        t({
          id: "ruleBuilder.record.failed",
          message: "Demo recording was cancelled or failed.",
        }),
      ]);
    } finally {
      setRecording(false);
    }
  };

  const addManualPair = () => {
    // Manually added pairs are never verified — only a pane recording proves.
    setPairs(prev => [...prev, { input: "", expectedOutput: "", verified: false }]);
  };

  // -- Step 3: save ------------------------------------------------------------

  const buildPack = (): RulePack => {
    const behaviourGroups: { family?: RuleFamily; rules: IRRule[] }[] = selectedFamilies.map(
      group => ({
        family: group.family,
        rules: group.rules.filter(rule => includedIds.includes(rule.nodeId)),
      }),
    );
    const ungroupedIncluded = ungroupedRules.filter(rule => includedIds.includes(rule.nodeId));
    if (ungroupedIncluded.length > 0) {
      behaviourGroups.push({ rules: ungroupedIncluded });
    }

    const behaviourIdFor = (family: RuleFamily | undefined): string => {
      const familySlug = family !== undefined ? slugify(family.id).replace(/-/g, "_") : "";
      const raw = familySlug !== "" ? `${bundleId}_${familySlug}` : `${bundleId}_rules`;
      const clean = raw.replace(/[^a-z0-9_]/g, "");
      return clean === "" ? "behaviour" : clean;
    };

    return {
      packVersion: PACK_VERSION,
      id: bundleId,
      name: bundleName.trim(),
      description: description.trim(),
      scriptKey: scriptKey === undefined ? "" : scriptKey.trim(),
      behaviours: behaviourGroups.map(group => {
        const { kind } = detectBehaviourKind(group.rules);
        const parameters: Record<string, unknown> =
          group.family === undefined
            ? { selection: "individual-rules", ruleCount: group.rules.length }
            : {
                [FAMILY_ID_PARAMETER_KEY]: group.family.id,
                [FAMILY_NAME_PARAMETER_KEY]: group.family.name,
                ...(group.family.guardStore !== undefined
                  ? { guardStore: group.family.guardStore }
                  : {}),
              };
        const demoPairs: DemoPair[] = pairs.map(pair => ({
          input: pair.input,
          expectedOutput: pair.expectedOutput,
          verified: pair.verified,
        }));
        return {
          kind,
          id: behaviourIdFor(group.family),
          parameters,
          provenance: {
            sourceKeyboardId: keyboardMeta.id,
            sourceKeyboardName: keyboardMeta.name,
            copyright: keyboardMeta.copyright,
            license: keyboardMeta.license,
          },
          rules: group.rules.map(formatRuleSummary),
          demoPairs,
        };
      }),
    };
  };

  const handleSave = () => {
    const nextErrors: string[] = [];
    if (bundleName.trim() === "") {
      nextErrors.push(
        t({ id: "ruleBuilder.save.emptyName", message: "Give the bundle a name." }),
      );
    } else if (bundleId === "") {
      nextErrors.push(
        t({
          id: "ruleBuilder.save.badName",
          message: "The name must contain at least one letter or digit.",
        }),
      );
    }
    if (description.trim() === "") {
      nextErrors.push(
        t({
          id: "ruleBuilder.save.emptyDescription",
          message: "The bundle description must not be empty.",
        }),
      );
    }
    if (!selectedRules.some(rule => includedIds.includes(rule.nodeId))) {
      nextErrors.push(
        t({
          id: "ruleBuilder.save.noRules",
          message: "Select at least one rule to bundle.",
        }),
      );
    }
    if (verifiedCount === 0) {
      nextErrors.push(
        t({
          id: "ruleBuilder.save.needVerified",
          message:
            "Saving needs at least one verified demo pair — record one from the demo pane.",
        }),
      );
    }
    if (scriptKey === undefined || scriptKey.trim() === "") {
      nextErrors.push(
        t({
          id: "ruleBuilder.save.needScript",
          message: "The rules step did not supply a script key, so the bundle cannot be saved yet.",
        }),
      );
    }

    if (nextErrors.length === 0) {
      const result = validateRulePack(buildPack());
      if (result.ok) {
        setErrors([]);
        onExport(canonicalPackJson(result.pack));
        setSaved({ name: bundleName.trim(), scriptLabel: scriptName(scriptKey!.trim()) });
        return;
      }
      for (const issue of result.issues) {
        nextErrors.push(`${issue.path === "" ? "bundle" : issue.path}: ${issue.message}`);
      }
    }
    setErrors(nextErrors);
  };

  const handleReset = () => {
    setSaved(null);
    setBundleName("");
    setDescriptionOverride(null);
    setEditingDescription(false);
    setPairs([]);
    setErrors([]);
    setIncludedIds(selectedRules.map(rule => rule.nodeId));
  };

  // -- Confirmation card -------------------------------------------------------

  if (saved !== null) {
    const savedName = saved.name;
    const savedScriptLabel = saved.scriptLabel;
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: 16,
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
        }}
      >
        <p style={{ margin: 0, fontSize: 14, color: TEXT_MAIN }}>
          {t({
            id: "ruleBuilder.saved.message",
            message: `Saved — “${savedName}” becomes a card other ${savedScriptLabel} keyboards are offered, with your demo attached.`,
          })}
        </p>
        <button type="button" onClick={handleReset} style={{ ...buttonStyle, alignSelf: "flex-start" }}>
          <Trans id="ruleBuilder.saved.again">Build another bundle</Trans>
        </button>
      </div>
    );
  }

  // -- Details rows (auto-derived, read-only) ------------------------------------

  const detailKindRows: { key: string; label: string; value: string }[] = (() => {
    const rows: { key: string; label: string; value: string }[] = [];
    const push = (key: string, label: string, rules: IRRule[]) => {
      const { kind, mixed } = detectBehaviourKind(rules);
      const detectedKind = kind;
      rows.push({
        key,
        label,
        value: mixed
          ? t({
              id: "ruleBuilder.details.kindMixed",
              message: `${detectedKind} · mixed rule shapes`,
            })
          : t({
              id: "ruleBuilder.details.kindDetected",
              message: `${detectedKind} · detected from the rules`,
            }),
      });
    };
    if (selectedFamilies.length > 0) {
      for (const group of selectedFamilies) {
        const kindFamilyName = group.family.name;
        push(
          group.family.id,
          t({
            id: "ruleBuilder.details.kindFor",
            message: `Kind · ${kindFamilyName}`,
          }),
          group.rules.filter(rule => includedIds.includes(rule.nodeId)),
        );
      }
    } else {
      push(
        "rules",
        t({ id: "ruleBuilder.details.kind", message: "Kind" }),
        selectedRules.filter(rule => includedIds.includes(rule.nodeId)),
      );
    }
    const ungroupedIncluded = ungroupedRules.filter(rule => includedIds.includes(rule.nodeId));
    if (selectedFamilies.length > 0 && ungroupedIncluded.length > 0) {
      push(
        "ungrouped",
        t({ id: "ruleBuilder.details.kindUngrouped", message: "Kind · ungrouped rules" }),
        ungroupedIncluded,
      );
    }
    return rows;
  })();

  // -- Render ------------------------------------------------------------------

  const groupCount = groups.length;
  const selectedRuleCount = includedIds.length;
  const groupWord =
    groupCount === 1
      ? t({ id: "ruleBuilder.selection.oneGroup", message: "group" })
      : t({ id: "ruleBuilder.selection.manyGroups", message: "groups" });
  const selectionSummary =
    families === undefined
      ? t({
          id: "ruleBuilder.selection.countRules",
          message: `${selectedRuleCount} rules selected`,
        })
      : t({
          id: "ruleBuilder.selection.countGroups",
          message: `· ${groupCount} ${groupWord} · ${selectedRuleCount} rules selected`,
        });

  const renderRuleRow = (rule: IRRule) => (
    <li key={rule.nodeId}>
      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={includedIds.includes(rule.nodeId)}
          onChange={() => toggleRule(rule.nodeId)}
          aria-label={formatRuleSummary(rule)}
        />
        <code style={{ fontFamily: FONT_MONO, color: TEXT_MAIN, wordBreak: "break-all" }}>
          {formatRuleSummary(rule)}
        </code>
      </label>
    </li>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 16,
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 16, color: TEXT_MAIN }}>
        <Trans id="ruleBuilder.title">Build a rule bundle</Trans>
      </h2>

      {/* Step 0 (implicit): family-level rule selection */}
      <section aria-label={t({ id: "ruleBuilder.selection.label", message: "Select rules to bundle" })}>
        <h3 style={{ margin: "0 0 8px", fontSize: 13, color: TEXT_DIM }}>
          <Trans id="ruleBuilder.selection.heading">Select rules to bundle</Trans>{" "}
          <span>{selectionSummary}</span>
        </h3>
        {selectedRules.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM }}>
            <Trans id="ruleBuilder.selection.empty">No rules selected.</Trans>
          </p>
        ) : families === undefined ? (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {selectedRules.map(renderRuleRow)}
          </ul>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {groups.map(group => {
              const selection = selectionOf(group.rules, includedIds);
              const isOpen = expandedFamilyIds.includes(group.family.id);
              const memberCount = group.rules.length;
              const bundleFamilyName = group.family.name;
              const familyRuleTotal = group.family.count;
              const familyRuleWord =
                familyRuleTotal === 1
                  ? t({ id: "ruleBuilder.family.oneRule", message: "rule" })
                  : t({ id: "ruleBuilder.family.manyRules", message: "rules" });
              const toggleWord = isOpen
                ? t({ id: "ruleBuilder.family.hide", message: "Hide" })
                : t({ id: "ruleBuilder.family.show", message: "Show" });
              return (
                <div
                  key={group.family.id}
                  style={{ border: `1px solid ${BORDER}`, borderRadius: 4, padding: 8 }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <input
                      type="checkbox"
                      ref={indeterminateRef(selection)}
                      checked={selection === "all"}
                      onChange={() => toggleFamily(group)}
                      aria-label={t({
                        id: "ruleBuilder.family.bundleAll",
                        message: `Bundle all ${memberCount} rules in “${bundleFamilyName}”`,
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => toggleExpanded(group.family.id)}
                      aria-expanded={isOpen}
                      aria-label={t({
                        id: "ruleBuilder.family.toggle",
                        message: `${toggleWord} individual rules in “${bundleFamilyName}”`,
                      })}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: TEXT_DIM,
                        cursor: "pointer",
                        fontSize: 13,
                        padding: 0,
                      }}
                    >
                      {isOpen ? "▾" : "▸"}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: TEXT_MAIN }}>
                        <strong>{group.family.name}</strong>{" "}
                        <span style={{ color: TEXT_DIM }}>
                          {t({
                            id: "ruleBuilder.family.count",
                            message: `${familyRuleTotal} ${familyRuleWord}`,
                          })}
                        </span>
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: TEXT_DIM }}>
                        {group.family.explanation}
                      </p>
                    </div>
                  </div>
                  {isOpen && (
                    <ul
                      style={{
                        listStyle: "none",
                        margin: "8px 0 0",
                        padding: "8px 0 0 24px",
                        borderTop: `1px solid ${BORDER}`,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      {group.rules.map(renderRuleRow)}
                    </ul>
                  )}
                </div>
              );
            })}
            {twinSuggestions.map(suggestion => {
              const twinCount = suggestion.ruleIds.length;
              return (
              <div
                key={suggestion.family.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 13,
                  color: TEXT_MAIN,
                  border: `1px dashed ${BORDER}`,
                  borderRadius: 4,
                  padding: 8,
                }}
              >
                <span>
                  {t({
                    id: "ruleBuilder.twins.prompt",
                    message: `Also include ${twinCount} touch-layer twins?`,
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => acceptTwins(suggestion)}
                  style={buttonStyle}
                >
                  <Trans id="ruleBuilder.twins.accept">Include</Trans>
                </button>
              </div>
              );
            })}
            {ungroupedRules.length > 0 && (
              <div>
                <h4 style={{ margin: "4px 0 8px", fontSize: 12, color: TEXT_DIM }}>
                  <Trans id="ruleBuilder.selection.ungrouped">Ungrouped rules</Trans>
                </h4>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {ungroupedRules.map(renderRuleRow)}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Step 1: name it */}
      <section aria-label={t({ id: "ruleBuilder.name.label", message: "Name the bundle" })}>
        <h3 style={{ margin: "0 0 8px", fontSize: 13, color: TEXT_DIM }}>
          <Trans id="ruleBuilder.name.step">1 · What should we call it?</Trans>
        </h3>
        <label style={labelStyle} htmlFor="rule-builder-name">
          <Trans id="ruleBuilder.name.field">Bundle name</Trans>
        </label>
        <input
          id="rule-builder-name"
          type="text"
          value={bundleName}
          onChange={event => setBundleName(event.target.value)}
          placeholder={t({
            id: "ruleBuilder.name.placeholder",
            message: "Cameroon diacritic blocking",
          })}
          style={{ ...fieldStyle, marginBottom: 8 }}
        />
        <div style={{ fontSize: 13, color: TEXT_DIM }}>
          <span>
            {t({
              id: "ruleBuilder.description.draft",
              message: `“${description}”`,
            })}
          </span>{" "}
          <button
            type="button"
            onClick={() => setEditingDescription(prev => !prev)}
            style={{
              background: "transparent",
              border: "none",
              color: ACCENT,
              cursor: "pointer",
              fontSize: 13,
              padding: 0,
              textDecoration: "underline",
            }}
          >
            {editingDescription ? (
              <Trans id="ruleBuilder.description.hide">hide</Trans>
            ) : (
              <Trans id="ruleBuilder.description.edit">edit</Trans>
            )}
          </button>
        </div>
        {editingDescription && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              aria-label={t({
                id: "ruleBuilder.description.aria",
                message: "Bundle description",
              })}
              value={descriptionOverride ?? draftDescription}
              onChange={event => setDescriptionOverride(event.target.value)}
              rows={3}
              style={fieldStyle}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setEditingDescription(false)}
                style={buttonStyle}
              >
                <Trans id="ruleBuilder.description.done">Done</Trans>
              </button>
              {descriptionOverride !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setDescriptionOverride(null);
                    setEditingDescription(false);
                  }}
                  style={buttonStyle}
                >
                  <Trans id="ruleBuilder.description.restore">Restore draft</Trans>
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Step 2: prove it */}
      <section aria-label={t({ id: "ruleBuilder.prove.label", message: "Show it works" })}>
        <h3 style={{ margin: "0 0 8px", fontSize: 13, color: TEXT_DIM }}>
          <Trans id="ruleBuilder.prove.step">2 · Show it works</Trans>
        </h3>
        {pairs.map((pair, index) => {
          const pairNumber = index + 1;
          return (
          <div
            key={index}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              padding: 8,
              marginBottom: 8,
              border: `1px solid ${BORDER}`,
              borderRadius: 4,
              fontSize: 13,
            }}
          >
            <span
              aria-hidden="true"
              style={{ color: pair.verified ? ACCENT : TEXT_DIM, fontSize: 12, marginTop: 2 }}
            >
              {pair.verified ? "●" : "○"}
            </span>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              {pair.verified ? (
                <span style={{ color: TEXT_MAIN }}>
                  {pair.input} → {pair.expectedOutput}
                </span>
              ) : (
                <>
                  <div>
                    <label style={labelStyle} htmlFor={`rule-builder-pair-input-${index}`}>
                      <Trans id="ruleBuilder.prove.input">Typed input (description)</Trans>
                    </label>
                    <input
                      id={`rule-builder-pair-input-${index}`}
                      type="text"
                      value={pair.input}
                      onChange={event =>
                        setPairs(prev =>
                          prev.map((p, i) =>
                            i === index ? { ...p, input: event.target.value } : p,
                          ),
                        )
                      }
                      placeholder={t({
                        id: "ruleBuilder.prove.input.placeholder",
                        message: "type 5, then press the grave-accent key",
                      })}
                      style={fieldStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor={`rule-builder-pair-output-${index}`}>
                      <Trans id="ruleBuilder.prove.output">Expected stored output</Trans>
                    </label>
                    <input
                      id={`rule-builder-pair-output-${index}`}
                      type="text"
                      value={pair.expectedOutput}
                      onChange={event =>
                        setPairs(prev =>
                          prev.map((p, i) =>
                            i === index ? { ...p, expectedOutput: event.target.value } : p,
                          ),
                        )
                      }
                      placeholder={t({
                        id: "ruleBuilder.prove.output.placeholder",
                        message: "5",
                      })}
                      style={{ ...fieldStyle, fontFamily: FONT_MONO }}
                    />
                  </div>
                </>
              )}
              <span style={{ fontSize: 12, color: TEXT_DIM }}>
                {pair.verified ? (
                  <Trans id="ruleBuilder.prove.verified">Verified in the demo pane</Trans>
                ) : (
                  <Trans id="ruleBuilder.prove.unverified">
                    Not verified — record from the demo pane to verify
                  </Trans>
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPairs(prev => prev.filter((_, i) => i !== index))}
              aria-label={t({
                id: "ruleBuilder.prove.remove",
                message: `Remove demo pair ${pairNumber}`,
              })}
              style={{ ...buttonStyle, fontSize: 12 }}
            >
              <Trans id="ruleBuilder.prove.removeLabel">Remove</Trans>
            </button>
          </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={addManualPair} style={buttonStyle}>
            <Trans id="ruleBuilder.prove.add">Add pair manually</Trans>
          </button>
          {onRecordDemo !== undefined && (
            <button
              type="button"
              onClick={handleRecordFromDemoPane}
              disabled={recording}
              style={{
                ...primaryButtonStyle,
                fontSize: 13,
                padding: "6px 12px",
                opacity: recording ? 0.7 : 1,
                cursor: recording ? "wait" : "pointer",
              }}
            >
              {recording ? (
                <Trans id="ruleBuilder.prove.recording">Recording…</Trans>
              ) : (
                <Trans id="ruleBuilder.prove.record">Record from demo pane</Trans>
              )}
            </button>
          )}
        </div>
      </section>

      {/* Step 3: save */}
      <section aria-label={t({ id: "ruleBuilder.save.label", message: "Save the bundle" })}>
        <h3 style={{ margin: "0 0 8px", fontSize: 13, color: TEXT_DIM }}>
          <Trans id="ruleBuilder.save.step">3 · Save the bundle</Trans>
        </h3>
        <button
          type="button"
          onClick={handleSave}
          disabled={verifiedCount === 0}
          style={{
            ...primaryButtonStyle,
            opacity: verifiedCount === 0 ? 0.5 : 1,
            cursor: verifiedCount === 0 ? "not-allowed" : "pointer",
          }}
        >
          <Trans id="ruleBuilder.save.button">Save bundle</Trans>
        </button>
        {verifiedCount === 0 && (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: TEXT_DIM }}>
            <Trans id="ruleBuilder.save.needProof">
              To save, record a proving demo from the demo pane — at least one verified pair is
              needed.
            </Trans>
          </p>
        )}
        {errors.length > 0 && (
          <div
            role="alert"
            style={{
              background: ERROR_BG,
              border: `1px solid ${ERROR_TEXT}`,
              borderRadius: 4,
              padding: 8,
              marginTop: 8,
              fontSize: 13,
              color: ERROR_TEXT,
            }}
          >
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        <details style={{ marginTop: 12, fontSize: 13 }}>
          <summary style={{ cursor: "pointer", color: TEXT_DIM }}>
            <Trans id="ruleBuilder.details.summary">Details</Trans>{" "}
            <span>
              <Trans id="ruleBuilder.details.auto">· filled in automatically</Trans>
            </span>
          </summary>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ color: TEXT_DIM, minWidth: 90 }}>
                <Trans id="ruleBuilder.details.bundleId">Bundle ID</Trans>
              </span>
              <code style={{ fontFamily: FONT_MONO, color: TEXT_MAIN }}>
                {bundleId === "" ? "—" : bundleId}
              </code>
            </div>
            {detailKindRows.map(row => (
              <div key={row.key} style={{ display: "flex", gap: 8 }}>
                <span style={{ color: TEXT_DIM, minWidth: 90 }}>{row.label}</span>
                <code style={{ fontFamily: FONT_MONO, color: TEXT_MAIN }}>{row.value}</code>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ color: TEXT_DIM, minWidth: 90 }}>
                <Trans id="ruleBuilder.details.scriptKey">Script key</Trans>
              </span>
              <code style={{ fontFamily: FONT_MONO, color: TEXT_MAIN }}>
                {scriptKey === undefined || scriptKey.trim() === "" ? "—" : scriptKey.trim()}
              </code>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ color: TEXT_DIM, minWidth: 90 }}>
                <Trans id="ruleBuilder.details.from">From</Trans>
              </span>
              <code style={{ fontFamily: FONT_MONO, color: TEXT_MAIN }}>
                {keyboardMeta.id} · {keyboardMeta.copyright} · {keyboardMeta.license}
              </code>
            </div>
          </div>
        </details>
      </section>

      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM }}>
        <Trans id="ruleBuilder.footnote">
          A bundle is just a named set of rules saved for reuse. Underneath it’s a versioned
          Behaviour record — auditable, simulatable, removable — so a bundle installed elsewhere
          behaves exactly like the rules you tested here.
        </Trans>
      </p>
    </div>
  );
}
