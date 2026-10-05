// SPIKE DEMO — not product UI (km/decisions-spike).
//
// Dev-only visualization of the "Decision as the only unit" spike. Mounted via
// ?demo=decisions (see main.tsx), mirroring the ?demo=lint precedent. Calls the
// spike API only (orderDecisions / filterGated / runSpikeDecisionFlow /
// diffDecisions); no new logic lives here.
//
// Access at: /?demo=decisions

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { QuestionModule } from "../survey/types.ts";
import type { DecisionId, DecisionSet } from "./decisionTypes.ts";
import { orderDecisions, filterGated } from "./orderDecisions.ts";
import { runSpikeDecisionFlow } from "./spikeRunner.ts";
import { diffDecisions } from "./adaptDiff.ts";
import { parseThinYaml } from "../survey/loadModularFlow.ts";
import identityLiteRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";

import ilAuthorEmail from "../survey/questions/a/il_author_email.ts";
import ilAuthorName from "../survey/questions/a/il_author_name.ts";
import ilCopyrightHolder from "../survey/questions/a/il_copyright_holder.ts";
import ilLanguageAutonym from "../survey/questions/a/il_language_autonym.ts";
import ilLanguageCode from "../survey/questions/a/il_language_code.ts";
import ilLanguageEnglish from "../survey/questions/a/il_language_english.ts";
import ilLanguageRegion from "../survey/questions/a/il_language_region.ts";
import ilScriptNotSupported from "../survey/questions/a/il_script_not_supported.ts";
import ilTargetScript from "../survey/questions/a/il_target_script.ts";

const ALL_MODULES: readonly QuestionModule[] = [
  // Legacy identity_lite.modular.yaml order (see orderParity.test.ts) — the
  // derived topological order reproduces this exactly (parity badge, §1).
  ilLanguageEnglish,
  ilLanguageRegion,
  ilLanguageAutonym,
  ilLanguageCode,
  ilTargetScript,
  ilScriptNotSupported,
  ilAuthorName,
  ilAuthorEmail,
  ilCopyrightHolder,
];
const MODULE_IDS = ALL_MODULES.map((m) => m.definition.id);
const LEGACY_IDS: readonly string[] = parseThinYaml(identityLiteRaw).questions;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFixtureIR(opts: { keyboardId: string; name: string; bcp47: string[] }): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: opts.keyboardId,
      name: opts.name,
      bcp47: opts.bcp47,
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

const FULL_IR = makeFixtureIR({ keyboardId: "sil_cameroon_qwerty", name: "Cameroon QWERTY", bcp47: ["bam-Latn"] });
const SPARSE_IR = makeFixtureIR({ keyboardId: "mystery_keyboard", name: "Mystery", bcp47: [] });

// ---------------------------------------------------------------------------
// Styles (minimal; theme tokens only)
// ---------------------------------------------------------------------------

const page: CSSProperties = {
  maxWidth: "1100px",
  margin: "0 auto",
  padding: "24px",
  fontFamily: "system-ui, sans-serif",
  color: "var(--app-text, #1a1a1a)",
  background: "var(--app-bg, #fff)",
};
const banner: CSSProperties = {
  border: "2px dashed #b45309",
  background: "#fffbeb",
  color: "#92400e",
  padding: "8px 16px",
  borderRadius: "8px",
  fontWeight: 700,
  marginBottom: "16px",
};
const section: CSSProperties = {
  border: "1px solid var(--app-border, #ddd)",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "16px",
};
const h2: CSSProperties = { margin: "0 0 12px", fontSize: "1.05rem" };
const row: CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  padding: "4px 0",
  borderBottom: "1px dotted var(--app-border, #eee)",
  fontSize: "0.85rem",
};
const mono: CSSProperties = { fontFamily: "monospace" };
const chip = (bg: string, fg: string): CSSProperties => ({
  display: "inline-block",
  fontSize: "0.7rem",
  fontWeight: 700,
  padding: "1px 8px",
  borderRadius: "999px",
  background: bg,
  color: fg,
  whiteSpace: "nowrap",
});
const btn: CSSProperties = {
  padding: "4px 10px",
  border: "1px solid var(--app-border, #ccc)",
  borderRadius: "6px",
  background: "var(--app-bg, #fff)",
  cursor: "pointer",
};
const activeBtn: CSSProperties = { ...btn, background: "#1d4ed8", color: "#fff", borderColor: "#1d4ed8" };
const input: CSSProperties = {
  padding: "4px 8px",
  border: "1px solid var(--app-border, #ccc)",
  borderRadius: "6px",
  fontFamily: "monospace",
  width: "140px",
};

function provenanceChip(p: string): CSSProperties {
  if (p === "extracted") return chip("#dcfce7", "#166534");
  if (p === "asked") return chip("#dbeafe", "#1d4ed8");
  return chip("#f3f4f6", "#6b7280");
}
function diffChip(s: string): CSSProperties {
  if (s === "confirmed") return chip("#dcfce7", "#166534");
  if (s === "changed") return chip("#fef3c7", "#92400e");
  return chip("#f3f4f6", "#6b7280");
}
function fmtValue(v: unknown): string {
  return v === undefined ? "—" : JSON.stringify(v);
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

const EDITABLE_DECISIONS: readonly DecisionId[] = ["language-name", "language-code", "target-script"];

export function DecisionsDemo() {
  // Section 2: fixture picker.
  const [fixture, setFixture] = useState<"full" | "sparse">("full");
  // Section 3: author overrides keyed by DecisionId.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // Section 4: module subset + display order + Ethi simulation.
  const [included, setIncluded] = useState<Record<string, boolean>>(
    Object.fromEntries(MODULE_IDS.map((id) => [id, true])),
  );
  const [displayOrder, setDisplayOrder] = useState<string[]>([...MODULE_IDS]);
  const [simulateEthi, setSimulateEthi] = useState(false);

  const byId = useMemo(() => new Map(ALL_MODULES.map((m) => [m.definition.id, m] as const)), []);

  // -- Section 1: derived order vs legacy YAML order -------------------------
  const derivedIds = useMemo(() => orderDecisions(ALL_MODULES).map((m) => m.definition.id), []);
  const parity = useMemo(
    () => derivedIds.length === LEGACY_IDS.length && derivedIds.every((id, i) => id === LEGACY_IDS[i]),
    [derivedIds],
  );

  // -- Section 2: extract -----------------------------------------------------
  const baseIR = fixture === "full" ? FULL_IR : SPARSE_IR;
  const extracted = useMemo(
    () => runSpikeDecisionFlow({ modules: ALL_MODULES, baseIR }),
    [baseIR],
  );

  // -- Section 3: adapt diff --------------------------------------------------
  const answersSet = useMemo<DecisionSet>(() => {
    const out: Record<string, { id: DecisionId; value: unknown; provenance: "asked" }> = {};
    for (const id of EDITABLE_DECISIONS) {
      const v = (overrides[id] ?? "").trim();
      if (v !== "") out[id] = { id, value: v, provenance: "asked" };
    }
    return out;
  }, [overrides]);
  const diffs = useMemo(() => diffDecisions(extracted, answersSet), [extracted, answersSet]);

  // -- Section 4: add/remove/reorder -----------------------------------------
  const selected = useMemo(
    () => displayOrder.map((id) => byId.get(id)!).filter((m) => included[m.definition.id]),
    [displayOrder, included, byId],
  );
  const derivedSelected = useMemo(() => {
    try {
      return { ids: orderDecisions(selected).map((m) => m.definition.id), error: null as string | null };
    } catch (e) {
      return { ids: [] as string[], error: e instanceof Error ? e.message : String(e) };
    }
  }, [selected]);

  // Gating demo: sparse fixture (no extractable script) + stub answers so the
  // author's script choice drives filterGated.
  const gated = useMemo(() => {
    const answers = simulateEthi
      ? { il_language_english: "Amharic", il_language_code: "amh", il_target_script: "Ethi" }
      : { il_language_english: "Bamanankan", il_language_code: "bam", il_target_script: "Latn" };
    const decisions = runSpikeDecisionFlow({ modules: selected, answers });
    const kept = new Set(filterGated(selected, decisions).map((m) => m.definition.id));
    return { decisions, dropped: selected.map((m) => m.definition.id).filter((id) => !kept.has(id)) };
  }, [selected, simulateEthi]);

  const move = (id: string, dir: -1 | 1) => {
    setDisplayOrder((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  };

  const scriptDecision = gated.decisions["target-script"];

  return (
    <div style={page}>
      <div style={banner}>SPIKE DEMO — not product UI (km/decisions-spike). Dev-only visualization of the decision primitive.</div>
      <h1 style={{ fontSize: "1.4rem", margin: "0 0 16px" }}>Decision as the only unit — spike demo</h1>

      {/* 1 — Derived order */}
      <div style={section}>
        <h2 style={h2}>1. Derived order vs legacy YAML order</h2>
        <p style={{ fontSize: "0.85rem" }}>
          <span style={parity ? chip("#dcfce7", "#166534") : chip("#fee2e2", "#991b1b")}>
            {parity ? "PARITY: MATCH" : "PARITY: MISMATCH"}
          </span>{" "}
          <span style={mono}>orderDecisions()</span> output {parity ? "equals" : "differs from"}{" "}
          <span style={mono}>identity_lite.modular.yaml</span> question list — reordering is derived from{" "}
          <span style={mono}>provides</span>/<span style={mono}>requires</span>, not declared.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <div style={{ ...h2, fontSize: "0.8rem", color: "var(--app-text-subtle)" }}>Derived (topological)</div>
            {derivedIds.map((id, i) => (
              <div key={id} style={row}><span style={mono}>{i + 1}. {id}</span></div>
            ))}
          </div>
          <div>
            <div style={{ ...h2, fontSize: "0.8rem", color: "var(--app-text-subtle)" }}>Legacy YAML list</div>
            {LEGACY_IDS.map((id, i) => (
              <div key={id} style={row}><span style={mono}>{i + 1}. {id}</span></div>
            ))}
          </div>
        </div>
      </div>

      {/* 2 — Extract */}
      <div style={section}>
        <h2 style={h2}>2. Extract — base keyboard pre-fills decisions</h2>
        <div style={{ marginBottom: "12px", display: "flex", gap: "8px" }}>
          <button style={fixture === "full" ? activeBtn : btn} onClick={() => setFixture("full")}>
            sil_cameroon_qwerty (bam-Latn)
          </button>
          <button style={fixture === "sparse" ? activeBtn : btn} onClick={() => setFixture("sparse")}>
            mystery_keyboard (no BCP47)
          </button>
        </div>
        {(Object.keys(extracted) as DecisionId[]).map((id) => {
          const d = extracted[id]!;
          return (
            <div key={id} style={row}>
              <span style={{ ...mono, minWidth: "180px" }}>{id}</span>
              <span style={{ ...mono, flex: 1 }}>{fmtValue(d.value)}</span>
              <span style={provenanceChip(d.provenance)}>{d.provenance}</span>
              {d.source && <span style={{ ...mono, fontSize: "0.75rem" }}>from {d.source}</span>}
            </div>
          );
        })}
        <p style={{ fontSize: "0.8rem", color: "var(--app-text-subtle)" }}>
          No stub answers here: <span style={mono}>extracted</span> came from the base keyboard's IR,{" "}
          <span style={mono}>default</span> means "nothing to extract, author will be asked".
        </p>
      </div>

      {/* 3 — Adapt diff */}
      <div style={section}>
        <h2 style={h2}>3. Adapt diff — change an extracted decision</h2>
        <p style={{ fontSize: "0.85rem" }}>
          Base: <span style={mono}>sil_cameroon_qwerty</span> extraction. Type an override to see the diff flip live.
        </p>
        <div style={{ display: "flex", gap: "16px", marginBottom: "12px", flexWrap: "wrap" }}>
          {EDITABLE_DECISIONS.map((id) => (
            <label key={id} style={{ fontSize: "0.85rem" }}>
              <span style={mono}>{id}</span>{" "}
              <input
                style={input}
                value={overrides[id] ?? ""}
                placeholder="(keep extracted)"
                onChange={(e) => setOverrides((o) => ({ ...o, [id]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        {diffs.map((d) => (
          <div key={d.id} style={row}>
            <span style={{ ...mono, minWidth: "180px" }}>{d.id}</span>
            <span style={diffChip(d.status)}>{d.status}</span>
            <span style={{ ...mono, fontSize: "0.8rem", color: "var(--app-text-subtle)" }}>{d.provenance}</span>
          </div>
        ))}
      </div>

      {/* 4 — Add/remove/reorder + gating */}
      <div style={section}>
        <h2 style={h2}>4. Add / remove / reorder — order follows declarations</h2>
        <p style={{ fontSize: "0.85rem" }}>
          Uncheck a module or move it — the derived order below recomputes from{" "}
          <span style={mono}>provides</span>/<span style={mono}>requires</span>, not list position.
          Try unchecking <span style={mono}>il_language_english</span>: the sort fails fast with{" "}
          <span style={mono}>unresolved decision</span>.
        </p>
        {displayOrder.map((id) => {
          const m = byId.get(id)!;
          return (
            <div key={id} style={row}>
              <input
                type="checkbox"
                checked={!!included[id]}
                onChange={() => setIncluded((s) => ({ ...s, [id]: !s[id] }))}
                aria-label={`include ${id}`}
              />
              <span style={{ ...mono, flex: 1, opacity: included[id] ? 1 : 0.4 }}>{id}</span>
              <span style={{ fontSize: "0.75rem", color: "var(--app-text-subtle)" }}>
                {m.provides ? `→ ${m.provides}` : "(no decision)"}
                {m.requires?.length ? ` · needs ${(m.requires as readonly string[]).join(", ")}` : ""}
              </span>
              <button style={btn} onClick={() => move(id, -1)} aria-label={`move ${id} up`}>↑</button>
              <button style={btn} onClick={() => move(id, 1)} aria-label={`move ${id} down`}>↓</button>
            </div>
          );
        })}
        <div style={{ marginTop: "12px" }}>
          <div style={{ ...h2, fontSize: "0.8rem", color: "var(--app-text-subtle)" }}>Derived order for selection</div>
          {derivedSelected.error ? (
            <div style={{ ...mono, fontSize: "0.85rem", color: "#991b1b" }}>✕ {derivedSelected.error}</div>
          ) : (
            derivedSelected.ids.map((id, i) => (
              <div key={id} style={row}><span style={mono}>{i + 1}. {id}</span></div>
            ))
          )}
        </div>
        <div style={{ marginTop: "16px" }}>
          <div style={{ ...h2, fontSize: "0.8rem", color: "var(--app-text-subtle)" }}>Conditional routing via filterGated</div>
          <label style={{ fontSize: "0.85rem", display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
            <input type="checkbox" checked={simulateEthi} onChange={() => setSimulateEthi((v) => !v)} />
            Simulate author picking script = <span style={mono}>Ethi</span> (currently{" "}
            <span style={mono}>{fmtValue(scriptDecision?.value)}</span>)
          </label>
          {gated.dropped.length > 0 ? (
            <div style={{ fontSize: "0.85rem" }}>
              Dropped by <span style={mono}>gatedBy</span>:{" "}
              {gated.dropped.map((id) => (
                <span key={id} style={{ ...mono, marginRight: "8px" }}>{id}</span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "0.85rem", color: "var(--app-text-subtle)" }}>
              No modules gated out — attribution questions stay for a supported script.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
