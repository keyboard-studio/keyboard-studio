// RuleBuilderPanel — spec 082 Track B (rule builder), FR-007.
//
// The authoring surface the rules step mounts for "Save selection as rule
// pack": rule multi-select summary, editable pack metadata, provenance
// pre-filled from the source keyboard, a canned demo-pair recorder, and
// schema-validated export to a versioned RulePack JSON file.
//
// Contracts with sibling workstreams:
// - workstream 2 mounts this panel with { selectedRules, keyboardMeta, onExport }.
// - the Track A demo pane wires onRecordDemo later; until then manual entry
//   covers demo-pair recording.

import { useState, type CSSProperties } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  BehaviourKinds,
  PACK_VERSION,
  validateRulePack,
  type BehaviourKind,
  type ContextElement,
  type DemoPair,
  type IRRule,
  type OutputElement,
  type RulePack,
} from "@keyboard-studio/contracts";
import {
  ACCENT,
  BG_CARD,
  BORDER,
  ERROR_BG,
  ERROR_TEXT,
  FONT_MONO,
  TEXT_DIM,
  TEXT_MAIN,
} from "../../ui/theme.ts";

export interface RuleBuilderPanelProps {
  /** Rules selected in the rules step; each renders as a checkbox row. */
  selectedRules: IRRule[];
  /** Source-keyboard metadata; pre-fills the provenance form. */
  keyboardMeta: {
    id: string;
    name: string;
    copyright: string;
    license: string;
  };
  /** Called with the canonical pack JSON after successful validation. */
  onExport: (json: string) => void;
  /**
   * Hook for recording a demo pair from the Track A demo pane. The rules
   * step wires this to the pane later; when absent, manual entry covers
   * recording (FR-007's minimum).
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
 * Canonical pack serialization: sorted keys, 2-space indent, trailing
 * newline. Byte-identical to the engine's exportPack; kept local until the
 * engine root index re-exports ./rulePacks (see note on formatRuleSummary).
 */
function canonicalPackJson(pack: RulePack): string {
  return JSON.stringify(sortKeysDeep(pack), null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// Per-kind parameter templates (valid, minimal, structured — FR-005)
// ---------------------------------------------------------------------------

const KIND_LABELS: Record<BehaviourKind, string> = {
  swallowUndefined: "Swallow undefined",
  markOnNonBase: "Mark on non-base",
  block: "Block",
  replace: "Replace",
  canonicalOrder: "Canonical order",
  reorderTable: "Reorder table",
  contextOutput: "Context output",
  authored: "Authored",
};

const KIND_PARAMETER_TEMPLATES: Record<BehaviourKind, string> = {
  swallowUndefined: `{\n  "scope": "which keys are swallowed (character class or key list)"\n}`,
  markOnNonBase: `{\n  "markStore": "store of combining marks",\n  "baseClass": "characters marks may attach to"\n}`,
  block: `{\n  "guardStore": "store of characters that trigger the block",\n  "guardedContextChars": [],\n  "blockedChords": [],\n  "outputOnBlock": "context"\n}`,
  replace: `{\n  "trigger": "what is replaced",\n  "replacement": "what it becomes"\n}`,
  canonicalOrder: `{\n  "normalization": "describe the canonical ordering"\n}`,
  reorderTable: `{\n  "rows": []\n}`,
  contextOutput: `{\n  "context": "the preceding context that triggers the output",\n  "output": "what is emitted"\n}`,
  authored: `{\n  "note": "describe the authored rule"\n}`,
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function RuleBuilderPanel({
  selectedRules,
  keyboardMeta,
  onExport,
  onRecordDemo,
}: RuleBuilderPanelProps) {
  const { t } = useLingui();

  const [includedIds, setIncludedIds] = useState<string[]>(() =>
    selectedRules.map(rule => rule.nodeId),
  );
  const [kind, setKind] = useState<BehaviourKind>("block");
  const [packName, setPackName] = useState("");
  const [packId, setPackId] = useState("");
  const [packIdTouched, setPackIdTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [scriptKey, setScriptKey] = useState("");
  const [copyright, setCopyright] = useState(keyboardMeta.copyright);
  const [license, setLicense] = useState(keyboardMeta.license);
  const [corpusCommit, setCorpusCommit] = useState("");
  const [parametersText, setParametersText] = useState(KIND_PARAMETER_TEMPLATES.block);
  const [parametersTouched, setParametersTouched] = useState(false);
  const [pairs, setPairs] = useState<DemoPair[]>([]);
  const [recording, setRecording] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const toggleRule = (nodeId: string) => {
    setIncludedIds(prev =>
      prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId],
    );
  };

  const handleNameChange = (value: string) => {
    setPackName(value);
    if (!packIdTouched) {
      setPackId(slugify(value));
    }
  };

  const handleKindChange = (next: BehaviourKind) => {
    setKind(next);
    if (!parametersTouched) {
      setParametersText(KIND_PARAMETER_TEMPLATES[next]);
    }
  };

  const handleRecordFromDemoPane = async () => {
    if (onRecordDemo === undefined) {
      return;
    }
    setRecording(true);
    try {
      const recorded = await onRecordDemo();
      setPairs(prev => [
        ...prev,
        { input: recorded.input, expectedOutput: recorded.expectedOutput },
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

  const handleExport = () => {
    const nextErrors: string[] = [];

    let parameters: Record<string, unknown> | undefined;
    try {
      const parsed: unknown = JSON.parse(parametersText);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("parameters must be a JSON object");
      }
      parameters = parsed as Record<string, unknown>;
    } catch (error) {
      nextErrors.push(
        `${t({ id: "ruleBuilder.export.badParameters", message: "Parameters are not valid JSON" })}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const includedRules = selectedRules.filter(rule => includedIds.includes(rule.nodeId));
    if (includedRules.length === 0) {
      nextErrors.push(
        t({
          id: "ruleBuilder.export.noRules",
          message: "Select at least one rule to include in the pack.",
        }),
      );
    }

    if (parameters !== undefined && nextErrors.length === 0) {
      const pack: RulePack = {
        packVersion: PACK_VERSION,
        id: packId.trim(),
        name: packName.trim(),
        description: description.trim(),
        scriptKey: scriptKey.trim(),
        behaviours: [
          {
            kind,
            id: packId.trim().replace(/-/g, "_") === "" ? "behaviour" : packId.trim().replace(/-/g, "_"),
            parameters,
            provenance: {
              sourceKeyboardId: keyboardMeta.id,
              sourceKeyboardName: keyboardMeta.name,
              copyright: copyright.trim(),
              license: license.trim(),
              ...(corpusCommit.trim() !== "" ? { corpusCommit: corpusCommit.trim() } : {}),
            },
            rules: includedRules.map(formatRuleSummary),
            demoPairs: pairs,
          },
        ],
      };
      const result = validateRulePack(pack);
      if (result.ok) {
        setErrors([]);
        onExport(canonicalPackJson(result.pack));
        return;
      }
      for (const issue of result.issues) {
        nextErrors.push(`${issue.path === "" ? "pack" : issue.path}: ${issue.message}`);
      }
    }

    setErrors(nextErrors);
  };

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
        <Trans id="ruleBuilder.title">Rule builder — save selection as rule pack</Trans>
      </h2>

      {/* 1. Rule selection summary */}
      <section aria-label={t({ id: "ruleBuilder.rules.label", message: "Rules in this pack" })}>
        <h3 style={{ margin: "0 0 8px", fontSize: 13, color: TEXT_DIM }}>
          <Trans id="ruleBuilder.rules.heading">Rules in this pack</Trans> ({includedIds.length}/
          {selectedRules.length})
        </h3>
        {selectedRules.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM }}>
            <Trans id="ruleBuilder.rules.empty">No rules selected.</Trans>
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {selectedRules.map(rule => (
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
            ))}
          </ul>
        )}
      </section>

      {/* 2. Pack metadata */}
      <section aria-label={t({ id: "ruleBuilder.meta.label", message: "Pack details" })}>
        <h3 style={{ margin: "0 0 8px", fontSize: 13, color: TEXT_DIM }}>
          <Trans id="ruleBuilder.meta.heading">Pack details</Trans>
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={labelStyle} htmlFor="rule-builder-kind">
              <Trans id="ruleBuilder.meta.kind">Behaviour kind</Trans>
            </label>
            <select
              id="rule-builder-kind"
              value={kind}
              onChange={event => handleKindChange(event.target.value as BehaviourKind)}
              style={fieldStyle}
            >
              {BehaviourKinds.map(k => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="rule-builder-name">
              <Trans id="ruleBuilder.meta.name">Pack name</Trans>
            </label>
            <input
              id="rule-builder-name"
              type="text"
              value={packName}
              onChange={event => handleNameChange(event.target.value)}
              placeholder={t({ id: "ruleBuilder.meta.name.placeholder", message: "Cameroon diacritic blocking" })}
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="rule-builder-id">
              <Trans id="ruleBuilder.meta.id">Pack ID</Trans>
            </label>
            <input
              id="rule-builder-id"
              type="text"
              value={packId}
              onChange={event => {
                setPackId(event.target.value);
                setPackIdTouched(true);
              }}
              placeholder={t({ id: "ruleBuilder.meta.id.placeholder", message: "cameroon-diacritic-blocking" })}
              style={{ ...fieldStyle, fontFamily: FONT_MONO }}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="rule-builder-description">
              <Trans id="ruleBuilder.meta.description">Description</Trans>
            </label>
            <textarea
              id="rule-builder-description"
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={3}
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="rule-builder-script">
              <Trans id="ruleBuilder.meta.scriptKey">Script key</Trans>
            </label>
            <input
              id="rule-builder-script"
              type="text"
              value={scriptKey}
              onChange={event => setScriptKey(event.target.value)}
              placeholder={t({ id: "ruleBuilder.meta.scriptKey.placeholder", message: "Latn" })}
              style={{ ...fieldStyle, fontFamily: FONT_MONO }}
            />
          </div>
        </div>
      </section>

      {/* 3. Provenance (pre-filled from the source keyboard, editable) */}
      <section aria-label={t({ id: "ruleBuilder.provenance.label", message: "Provenance" })}>
        <h3 style={{ margin: "0 0 8px", fontSize: 13, color: TEXT_DIM }}>
          <Trans id="ruleBuilder.provenance.heading">Provenance</Trans>
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={labelStyle} htmlFor="rule-builder-src-id">
              <Trans id="ruleBuilder.provenance.sourceId">Source keyboard ID</Trans>
            </label>
            <input id="rule-builder-src-id" type="text" value={keyboardMeta.id} readOnly style={{ ...fieldStyle, fontFamily: FONT_MONO, opacity: 0.7 }} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="rule-builder-src-name">
              <Trans id="ruleBuilder.provenance.sourceName">Source keyboard name</Trans>
            </label>
            <input id="rule-builder-src-name" type="text" value={keyboardMeta.name} readOnly style={{ ...fieldStyle, opacity: 0.7 }} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="rule-builder-copyright">
              <Trans id="ruleBuilder.provenance.copyright">Copyright</Trans>
            </label>
            <input
              id="rule-builder-copyright"
              type="text"
              value={copyright}
              onChange={event => setCopyright(event.target.value)}
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="rule-builder-license">
              <Trans id="ruleBuilder.provenance.license">License</Trans>
            </label>
            <input
              id="rule-builder-license"
              type="text"
              value={license}
              onChange={event => setLicense(event.target.value)}
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="rule-builder-corpus">
              <Trans id="ruleBuilder.provenance.corpusCommit">Corpus commit</Trans>
            </label>
            <input
              id="rule-builder-corpus"
              type="text"
              value={corpusCommit}
              onChange={event => setCorpusCommit(event.target.value)}
              placeholder={t({ id: "ruleBuilder.provenance.corpusCommit.placeholder", message: "optional — enter manually" })}
              style={{ ...fieldStyle, fontFamily: FONT_MONO }}
            />
          </div>
        </div>
      </section>

      {/* 4. Structured parameters (FR-005: data, never a raw snippet) */}
      <section aria-label={t({ id: "ruleBuilder.parameters.label", message: "Structured parameters" })}>
        <h3 style={{ margin: "0 0 8px", fontSize: 13, color: TEXT_DIM }}>
          <Trans id="ruleBuilder.parameters.heading">Structured parameters</Trans>
        </h3>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: TEXT_DIM }}>
          <Trans id="ruleBuilder.parameters.hint">
            Plain data describing the behaviour (character classes, store names, table rows) — never a raw KMN
            snippet. Packs carrying only KMN text are rejected.
          </Trans>
        </p>
        <textarea
          aria-label={t({ id: "ruleBuilder.parameters.aria", message: "Structured parameters (JSON)" })}
          value={parametersText}
          onChange={event => {
            setParametersText(event.target.value);
            setParametersTouched(true);
          }}
          rows={8}
          spellCheck={false}
          style={{ ...fieldStyle, fontFamily: FONT_MONO, fontSize: 12 }}
        />
      </section>

      {/* 5. Canned demo pairs (FR-007: at least one) */}
      <section aria-label={t({ id: "ruleBuilder.demo.label", message: "Canned demo pairs" })}>
        <h3 style={{ margin: "0 0 8px", fontSize: 13, color: TEXT_DIM }}>
          <Trans id="ruleBuilder.demo.heading">Canned demo pairs</Trans> ({pairs.length})
        </h3>
        {pairs.map((pair, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: 8,
              marginBottom: 8,
              border: `1px solid ${BORDER}`,
              borderRadius: 4,
            }}
          >
            <div>
              <label style={labelStyle} htmlFor={`rule-builder-pair-input-${index}`}>
                <Trans id="ruleBuilder.demo.input">Typed input (description)</Trans>
              </label>
              <input
                id={`rule-builder-pair-input-${index}`}
                type="text"
                value={pair.input}
                onChange={event =>
                  setPairs(prev => prev.map((p, i) => (i === index ? { ...p, input: event.target.value } : p)))
                }
                placeholder={t({ id: "ruleBuilder.demo.input.placeholder", message: "type 5, then press the grave-accent key" })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor={`rule-builder-pair-output-${index}`}>
                <Trans id="ruleBuilder.demo.output">Expected stored output</Trans>
              </label>
              <input
                id={`rule-builder-pair-output-${index}`}
                type="text"
                value={pair.expectedOutput}
                onChange={event =>
                  setPairs(prev =>
                    prev.map((p, i) => (i === index ? { ...p, expectedOutput: event.target.value } : p)),
                  )
                }
                placeholder={t({ id: "ruleBuilder.demo.output.placeholder", message: "5" })}
                style={{ ...fieldStyle, fontFamily: FONT_MONO }}
              />
            </div>
            <button
              type="button"
              onClick={() => setPairs(prev => prev.filter((_, i) => i !== index))}
              style={{
                alignSelf: "flex-start",
                fontSize: 12,
                background: "transparent",
                border: `1px solid ${BORDER}`,
                borderRadius: 4,
                color: TEXT_DIM,
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              <Trans id="ruleBuilder.demo.remove">Remove pair</Trans>
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setPairs(prev => [...prev, { input: "", expectedOutput: "" }])}
            style={{
              fontSize: 13,
              background: "transparent",
              border: `1px solid ${BORDER}`,
              borderRadius: 4,
              color: TEXT_MAIN,
              cursor: "pointer",
              padding: "6px 12px",
            }}
          >
            <Trans id="ruleBuilder.demo.add">Add pair manually</Trans>
          </button>
          {onRecordDemo !== undefined && (
            <button
              type="button"
              onClick={handleRecordFromDemoPane}
              disabled={recording}
              style={{
                fontSize: 13,
                background: ACCENT,
                border: "none",
                borderRadius: 4,
                color: "#fff",
                cursor: recording ? "wait" : "pointer",
                padding: "6px 12px",
                opacity: recording ? 0.7 : 1,
              }}
            >
              {recording ? (
                <Trans id="ruleBuilder.demo.recording">Recording…</Trans>
              ) : (
                <Trans id="ruleBuilder.demo.record">Record from demo pane</Trans>
              )}
            </button>
          )}
        </div>
      </section>

      {/* 6. Errors + export */}
      {errors.length > 0 && (
        <div
          role="alert"
          style={{
            background: ERROR_BG,
            border: `1px solid ${ERROR_TEXT}`,
            borderRadius: 4,
            padding: 8,
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
      <button
        type="button"
        onClick={handleExport}
        style={{
          fontSize: 14,
          fontWeight: 600,
          background: ACCENT,
          border: "none",
          borderRadius: 4,
          color: "#fff",
          cursor: "pointer",
          padding: "10px 16px",
        }}
      >
        <Trans id="ruleBuilder.export">Export rule pack</Trans>
      </button>
    </div>
  );
}
