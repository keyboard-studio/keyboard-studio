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
import type { FlowQuestion, QuestionModule } from "../survey/types.ts";
import type { DecisionId, DecisionSet } from "./decisionTypes.ts";
import { orderDecisions, filterGated } from "./orderDecisions.ts";
import { runSpikeDecisionFlow } from "./spikeRunner.ts";
import { diffDecisions } from "./adaptDiff.ts";

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
// Frozen from the deleted content/flows/identity_lite.modular.yaml (spec 085
// T040) — the parity badge compares the derived order against this.
const LEGACY_IDS: readonly string[] = [
  "il_language_english",
  "il_language_region",
  "il_language_autonym",
  "il_language_code",
  "il_target_script",
  "il_script_not_supported",
  "il_author_name",
  "il_author_email",
  "il_copyright_holder",
];

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

  // -- Section 5: manage questions (in-memory; the real registry is untouched)
  const [customModules, setCustomModules] = useState<QuestionModule[]>([]);
  const [declEdits, setDeclEdits] = useState<Record<string, { provides: DecisionId[] | undefined; requires: DecisionId[] | undefined }>>({});
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set());
  const [inspectedId, setInspectedId] = useState<string | null>(null);

  const managedModules = useMemo(() => {
    const edited: QuestionModule[] = ALL_MODULES.filter((m) => !removedIds.has(m.definition.id)).map((m) => {
      const e = declEdits[m.definition.id];
      if (e === undefined) return m;
      // exactOptionalPropertyTypes: assign-or-delete, never an explicit undefined.
      const next: QuestionModule = { ...m };
      if (e.provides === undefined) delete next.provides;
      else next.provides = e.provides;
      if (e.requires === undefined) delete next.requires;
      else next.requires = e.requires;
      return next;
    });
    return [...edited, ...customModules];
  }, [declEdits, removedIds, customModules]);
  const managedIds = useMemo(() => new Set(managedModules.map((m) => m.definition.id)), [managedModules]);
  const customIdSet = useMemo(() => new Set(customModules.map((m) => m.definition.id)), [customModules]);

  const managedOrder = useMemo(() => {
    try {
      return { ids: orderDecisions(managedModules).map((m) => m.definition.id), error: null as string | null };
    } catch (e) {
      return { ids: [] as string[], error: e instanceof Error ? e.message : String(e) };
    }
  }, [managedModules]);

  const providersByDecision = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of managedModules) {
      for (const p of m.provides ?? []) {
        const arr = map.get(p) ?? [];
        arr.push(m.definition.id);
        map.set(p, arr);
      }
    }
    return map;
  }, [managedModules]);

  const inspectedMod = managedModules.find((m) => m.definition.id === inspectedId) ?? null;
  const inspectedProvides: DecisionId[] | undefined = inspectedMod?.provides;
  const inspectedConsumers: string[] = [];
  if (inspectedMod !== null && inspectedProvides !== undefined) {
    for (const o of managedModules) {
      if (
        o.definition.id !== inspectedMod.definition.id &&
        inspectedProvides.some((p) => (o.requires ?? []).includes(p))
      ) {
        inspectedConsumers.push(o.definition.id);
      }
    }
  }

  const updateDecls = (id: string, provides: DecisionId[] | undefined, requires: DecisionId[]) => {
    setDeclEdits((prev) => ({ ...prev, [id]: { provides, requires } }));
  };
  const deleteModule = (id: string) => {
    setRemovedIds((prev) => new Set(prev).add(id));
    setCustomModules((prev) => prev.filter((m) => m.definition.id !== id));
    setInspectedId((cur) => (cur === id ? null : cur));
  };

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
          the frozen legacy question list (identity_lite.modular.yaml, deleted spec 085 T040) — reordering is derived from{" "}
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
                {m.provides?.length ? `→ ${m.provides.join(", ")}` : "(no decision)"}
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

      {/* 5 — Manage questions (local dev only: mutation is a developer tool) */}
      {import.meta.env.DEV ? (
      <div style={section}>
        <h2 style={h2}>5. Manage questions — define, edit, inspect dependencies</h2>
        <p style={{ fontSize: "0.85rem" }}>
          In-memory only — the real registry is untouched. Every edit recomputes the derived order live:
          break a dependency and the sort fails fast in red below.
        </p>

        <NewQuestionForm existingIds={managedIds} onAdd={(m) => setCustomModules((prev) => [...prev, m])} />

        <div style={{ ...h2, fontSize: "0.8rem", color: "var(--app-text-subtle)", marginTop: "16px" }}>
          Modules ({managedModules.length}) — click an id to inspect its dependencies
        </div>
        {managedModules.map((m) => (
          <ManagedModuleRow
            key={m.definition.id}
            mod={m}
            isCustom={customIdSet.has(m.definition.id)}
            selected={inspectedId === m.definition.id}
            onSelect={() => setInspectedId((cur) => (cur === m.definition.id ? null : m.definition.id))}
            onUpdateDecls={updateDecls}
            onDelete={() => deleteModule(m.definition.id)}
          />
        ))}

        {inspectedMod !== null && (
          <div
            style={{ marginTop: "12px", padding: "12px", border: "1px solid var(--app-border, #ddd)", borderRadius: "6px" }}
            data-testid="dependency-inspector"
          >
            <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>
              Dependency inspector: <span style={mono}>{inspectedMod.definition.id}</span>
            </div>
            <div style={{ fontSize: "0.8rem", marginTop: "8px", color: "var(--app-text-subtle)" }}>requires ← provided by</div>
            {(inspectedMod.requires ?? []).length === 0 && (
              <div style={{ fontSize: "0.8rem", color: "var(--app-text-subtle)" }}>(no requirements)</div>
            )}
            {(inspectedMod.requires ?? []).map((req) => {
              const providers = providersByDecision.get(req) ?? [];
              return (
                <div key={req} style={row}>
                  <span style={{ ...mono, minWidth: "180px" }}>{req}</span>
                  {providers.length > 0 ? (
                    <span style={{ fontSize: "0.8rem" }}>← {providers.join(", ")}</span>
                  ) : (
                    <span style={chip("#fee2e2", "#991b1b")}>unresolved: no provider</span>
                  )}
                </div>
              );
            })}
            <div style={{ fontSize: "0.8rem", marginTop: "8px", color: "var(--app-text-subtle)" }}>
              → required by{inspectedProvides !== undefined ? ` (via ${inspectedProvides.join(", ")})` : " (provides nothing)"}
            </div>
            {inspectedProvides !== undefined &&
              (inspectedConsumers.length > 0 ? (
                inspectedConsumers.map((cid) => (
                  <div key={cid} style={row}><span style={mono}>{cid}</span></div>
                ))
              ) : (
                <div style={{ fontSize: "0.8rem", color: "var(--app-text-subtle)" }}>(no consumers)</div>
              ))}
          </div>
        )}

        <div style={{ marginTop: "12px" }}>
          <div style={{ ...h2, fontSize: "0.8rem", color: "var(--app-text-subtle)" }}>
            Derived order for managed set
          </div>
          {managedOrder.error !== null ? (
            <div
              style={{ ...mono, fontSize: "0.85rem", color: "#991b1b", padding: "8px", border: "1px solid #fecaca", borderRadius: "6px", background: "#fef2f2" }}
              data-testid="managed-order-error"
            >
              ✕ {managedOrder.error}
            </div>
          ) : (
            <div data-testid="managed-order-list">
              {managedOrder.ids.map((mid, i) => (
                <div key={mid} style={row}><span style={mono}>{i + 1}. {mid}</span></div>
              ))}
            </div>
          )}
        </div>
      </div>
      ) : (
        <div style={section}>
          <h2 style={h2}>5. Manage questions</h2>
          <p style={{ fontSize: "0.85rem", color: "var(--app-text-subtle)" }}>
            Question management is available in local dev mode (<span style={mono}>pnpm dev</span>).
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 5: management components (in-memory only — never touch the registry)
// ---------------------------------------------------------------------------

const QUESTION_TYPES = ["text", "short_text", "radio", "select", "multi_select", "notice"] as const;

function NewQuestionForm(props: { existingIds: ReadonlySet<string>; onAdd: (m: QuestionModule) => void }) {
  const [id, setId] = useState("");
  const [type, setType] = useState<(typeof QUESTION_TYPES)[number]>("text");
  const [prompt, setPrompt] = useState("");
  const [provides, setProvides] = useState("");
  const [requiresText, setRequiresText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const tid = id.trim();
    if (!/^[a-z][a-z0-9_]*$/.test(tid)) {
      setError("id must start with a lowercase letter and contain only lowercase letters, digits, and underscores");
      return;
    }
    if (props.existingIds.has(tid)) {
      setError(`id "${tid}" already exists`);
      return;
    }
    setError(null);
    const definition: FlowQuestion = { id: tid, type, required: false };
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt !== "") definition.prompt = trimmedPrompt;
    const mod: QuestionModule = {
      definition,
      validate: (v) =>
        v === undefined || v === "" ? { ok: false, code: "required", message: "Required" } : { ok: true },
      inputs: [],
      writes: [],
      fixtures: { valid: [{ value: "x" }], invalid: [] },
    };
    const trimmedProvides = provides.trim();
    if (trimmedProvides !== "") {
      const parsed = trimmedProvides
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "") as DecisionId[];
      if (parsed.length > 0) mod.provides = parsed;
    }
    const parsedRequires = requiresText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "") as DecisionId[];
    if (parsedRequires.length > 0) mod.requires = parsedRequires;
    props.onAdd(mod);
    setId("");
    setPrompt("");
    setProvides("");
    setRequiresText("");
    setType("text");
  };

  return (
    <div style={{ padding: "12px", border: "1px dashed var(--app-border, #ccc)", borderRadius: "6px" }}>
      <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "8px" }}>Define a new question</div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: "0.8rem" }}>
          id<br />
          <input
            aria-label="New question id"
            style={{ ...input, width: "160px" }}
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="q_my_question"
          />
        </label>
        <label style={{ fontSize: "0.8rem" }}>
          type<br />
          <select
            aria-label="New question type"
            style={{ ...input, width: "120px" }}
            value={type}
            onChange={(e) => setType(e.target.value as (typeof QUESTION_TYPES)[number])}
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: "0.8rem" }}>
          prompt<br />
          <input
            aria-label="New question prompt"
            style={{ ...input, width: "200px" }}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        <label style={{ fontSize: "0.8rem" }}>
          provides<br />
          <input
            aria-label="New question provides"
            style={{ ...input, width: "150px" }}
            value={provides}
            onChange={(e) => setProvides(e.target.value)}
            placeholder="decision-id"
          />
        </label>
        <label style={{ fontSize: "0.8rem" }}>
          requires<br />
          <input
            aria-label="New question requires"
            style={{ ...input, width: "200px" }}
            value={requiresText}
            onChange={(e) => setRequiresText(e.target.value)}
            placeholder="a, b"
          />
        </label>
        <button style={activeBtn} onClick={submit}>Add question</button>
      </div>
      {error !== null && <div style={{ color: "#991b1b", fontSize: "0.8rem", marginTop: "6px" }}>{error}</div>}
    </div>
  );
}

function ManagedModuleRow(props: {
  mod: QuestionModule;
  isCustom: boolean;
  selected: boolean;
  onSelect: () => void;
  onUpdateDecls: (id: string, provides: DecisionId[] | undefined, requires: DecisionId[]) => void;
  onDelete: () => void;
}) {
  const { mod } = props;
  const [providesText, setProvidesText] = useState((mod.provides ?? []).join(", "));
  const [requiresText, setRequiresText] = useState((mod.requires ?? []).join(", "));

  const commit = () => {
    const parsedProvides = providesText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "") as DecisionId[];
    props.onUpdateDecls(
      mod.definition.id,
      parsedProvides.length === 0 ? undefined : parsedProvides,
      requiresText
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "") as DecisionId[],
    );
  };

  return (
    <div style={{ ...row, background: props.selected ? "#eff6ff" : undefined }}>
      <button
        style={{ ...btn, ...mono, fontSize: "0.8rem" }}
        onClick={props.onSelect}
        aria-label={`inspect ${mod.definition.id}`}
      >
        {mod.definition.id}
      </button>
      {props.isCustom && <span style={chip("#ede9fe", "#5b21b6")}>custom</span>}
      <label style={{ fontSize: "0.75rem", color: "var(--app-text-subtle)" }}>
        provides{" "}
        <input
          aria-label={`provides for ${mod.definition.id}`}
          style={{ ...input, width: "150px" }}
          value={providesText}
          onChange={(e) => setProvidesText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
        />
      </label>
      <label style={{ fontSize: "0.75rem", color: "var(--app-text-subtle)" }}>
        requires{" "}
        <input
          aria-label={`requires for ${mod.definition.id}`}
          style={{ ...input, width: "220px" }}
          value={requiresText}
          onChange={(e) => setRequiresText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
        />
      </label>
      <button style={btn} onClick={props.onDelete} aria-label={`delete ${mod.definition.id}`}>✕</button>
    </div>
  );
}
