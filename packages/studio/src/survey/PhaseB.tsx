// Phase B survey wrapper — Character inventory discovery (spec §8 step 4).
//
// Three of the four discovery entry methods (text-sample, linguist, picker)
// are engine-dependent and not yet implemented (#141/#142). They are rendered
// as DiscoveryMethodStub panels. The manual step-by-step path is fully
// functional through SurveyRunner.
//
// The runner detects which method the user chose from pb_discovery_intro and
// intercepts the non-manual branches before SurveyRunner can navigate into
// them, showing the stub instead.

import { useMemo, useState } from "react";
import type { SurveyPhaseResult, LintFinding } from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { parseFlow } from "./loadFlow.ts";
import type { SurveyContext, FlowDef } from "./types.ts";

// Vite ?raw import
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — Vite resolves ?raw at build/dev time
import phaseBRaw from "../../../../content/flows/phase_b_characters.yaml?raw";

// ---------------------------------------------------------------------------
// DiscoveryMethodStub — shown for unimplemented discovery methods
// ---------------------------------------------------------------------------

function DiscoveryMethodStub({ feature, issueRef }: { feature: string; issueRef: string }) {
  return (
    <div style={{ padding: 16, border: "1px solid #30363d", borderRadius: 6, color: "#8b949e" }}>
      <strong style={{ color: "#e6edf3" }}>{feature}</strong>
      <p>This discovery method is coming soon ({issueRef}).</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhaseB state — intercept non-manual discovery choices
// ---------------------------------------------------------------------------

type DiscoveryMethod = "manual" | "text-sample" | "linguist" | "picker" | null;

// Return a modified FlowDef that starts at pb_routing_branch, skipping the
// discovery-intro question, so the runner goes straight into manual questions.
function makeManualOnlyFlow(flow: FlowDef): FlowDef {
  return {
    ...flow,
    questions: flow.questions.map((q) =>
      q.id === "pb_discovery_intro"
        ? { ...q, next: "pb_routing_branch" }
        : q,
    ),
  };
}

// ---------------------------------------------------------------------------
// PhaseB component
// ---------------------------------------------------------------------------

export interface PhaseBProps {
  context?: SurveyContext;
  onComplete: (result: SurveyPhaseResult) => void;
  onBack?: () => void;
  findings?: LintFinding[];
}

export function PhaseB({ context = {}, onComplete, onBack, findings }: PhaseBProps) {
  const flow = useMemo(() => parseFlow(phaseBRaw as string), []);
  const [discoveryMethod, setDiscoveryMethod] = useState<DiscoveryMethod>(null);

  // When the user picks a non-manual method at the intro question, we intercept
  // and show a stub. We do this by wrapping onComplete to detect the answer
  // before the runner advances past pb_discovery_intro.
  // However SurveyRunner advances on Next — so instead we pre-patch the flow
  // to route all non-manual choices to a stub gate within the runner itself.
  // The simpler approach: inject a custom first question wrapper.
  // Actually, the cleanest approach given the YAML structure: render the intro
  // question ourselves, then branch on the answer.

  if (discoveryMethod === null) {
    return (
      <IntroChooser
        context={context}
        onChoose={setDiscoveryMethod}
        {...(onBack !== undefined ? { onBack } : {})}
      />
    );
  }

  if (discoveryMethod !== "manual") {
    const stubInfo: Record<Exclude<DiscoveryMethod, "manual" | null>, { feature: string; issueRef: string }> = {
      "text-sample": { feature: "Text-sample extraction", issueRef: "#141" },
      linguist: { feature: "Linguist-synthesized inventory", issueRef: "#141" },
      picker: { feature: "Visual character grid picker", issueRef: "#142" },
    };
    const stub = stubInfo[discoveryMethod];
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          color: "#e6edf3",
        }}
      >
        <h2
          style={{
            margin: "0 0 4px 0",
            fontSize: "1.1rem",
            color: "#6ea8fe",
            fontWeight: 600,
          }}
        >
          Phase B — Character discovery
        </h2>
        <DiscoveryMethodStub feature={stub.feature} issueRef={stub.issueRef} />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setDiscoveryMethod(null)}
            style={{
              padding: "8px 18px",
              background: "transparent",
              border: "1px solid #30363d",
              borderRadius: 6,
              color: "#8b949e",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setDiscoveryMethod("manual")}
            style={{
              padding: "8px 18px",
              background: "#1f6feb",
              border: "1px solid #30363d",
              borderRadius: 6,
              color: "#e6edf3",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Use step-by-step instead
          </button>
        </div>
      </div>
    );
  }

  // Manual path — use a patched flow that skips the intro question
  const manualFlow = makeManualOnlyFlow(flow);

  return (
    <div
      style={{
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <h2
        style={{
          margin: "0 0 20px 0",
          fontSize: "1.1rem",
          color: "#6ea8fe",
          fontWeight: 600,
        }}
      >
        Phase B — Character inventory
      </h2>
      <SurveyRunner
        flow={manualFlow}
        context={context}
        onComplete={onComplete}
        onBack={() => setDiscoveryMethod(null)}
        {...(findings !== undefined ? { findings } : {})}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// IntroChooser — the discovery method selection card
// ---------------------------------------------------------------------------

interface IntroChooserProps {
  context: SurveyContext;
  onChoose: (method: DiscoveryMethod) => void;
  onBack?: () => void;
}

const METHODS: Array<{ value: Exclude<DiscoveryMethod, null>; label: string }> = [
  { value: "manual", label: "Step by step — I will answer the questions below" },
  { value: "text-sample", label: "Paste a text sample — we will extract the characters from it" },
  { value: "linguist", label: "Show me a suggested list based on my language" },
  { value: "picker", label: "Browse a character grid and tick what I need" },
];

function IntroChooser({ context, onChoose, onBack }: IntroChooserProps) {
  const [selected, setSelected] = useState<Exclude<DiscoveryMethod, null>>("manual");

  const languageName = context["language_name"] ?? context["detected_group"] ?? "your language";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#e6edf3",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe", fontWeight: 600 }}>
        Phase B — Character discovery
      </h2>
      <p style={{ margin: 0, fontSize: 13, color: "#8b949e" }}>
        How would you like to tell us which characters {languageName} uses?
      </p>
      <p style={{ margin: 0, fontSize: 12, color: "#8b949e", lineHeight: 1.5 }}>
        There are several ways to build your character list. All of them feed the same
        final list — you can use more than one method. Choose your preferred starting point.
      </p>

      <div role="radiogroup" aria-label="Discovery method">
        {METHODS.map(({ value, label }) => {
          const inputId = `discovery-method-${value}`;
          return (
            <label
              key={value}
              htmlFor={inputId}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                marginBottom: 10,
                cursor: "pointer",
                fontSize: 13,
                color: "#e6edf3",
              }}
            >
              <input
                type="radio"
                id={inputId}
                name="discovery_method"
                value={value}
                checked={selected === value}
                onChange={() => setSelected(value)}
                style={{ marginTop: 2, accentColor: "#6ea8fe" }}
              />
              <span style={{ lineHeight: 1.5 }}>
                {label}
                {value !== "manual" && (
                  <span
                    style={{
                      marginLeft: 8,
                      padding: "1px 6px",
                      background: "#161b22",
                      border: "1px solid #30363d",
                      borderRadius: 4,
                      fontSize: 11,
                      color: "#8b949e",
                    }}
                  >
                    coming soon
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {onBack !== undefined && (
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: "8px 18px",
              background: "transparent",
              border: "1px solid #30363d",
              borderRadius: 6,
              color: "#8b949e",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={() => onChoose(selected)}
          style={{
            padding: "8px 18px",
            background: "#1f6feb",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: "#e6edf3",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
