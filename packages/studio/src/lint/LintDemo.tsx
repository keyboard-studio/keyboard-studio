// Standalone demo / story component for the lint chip UI.
// No props. Renders a LintSummary with one finding from each fixture group
// plus a standalone upstream-muted chip example.
//
// Access at: /?demo=lint in dev mode (see main.tsx conditional).

import {
  layerAFindings,
  layerBFindings,
  layerCFindings,
  fatalFindings,
} from "@keyboard-studio/contracts/fixtures";
import type { LintFinding } from "@keyboard-studio/contracts";
import { LintSummary } from "./LintSummary";
import { LintChip } from "./LintChip";

// Named lookups by code — resilient to fixture ordering changes.
const duplicateStoreError = layerAFindings.find(f => f.code === "KM_ERROR_DUPLICATE_STORE")!;
const deprecatedStoreWarn = layerAFindings.find(f => f.code === "KM_WARN_DEPRECATED_STORE_ID")!;
const canonicalOrderHint = layerBFindings.find(f => f.code === "KM_HINT_CANONICAL_STORE_ORDER")!;
const missingLicenseError = layerCFindings.find(f => f.code === "KM_LINT_MISSING_LICENSE")!;
const welcomePlaceholderInfo = layerCFindings.find(f => f.code === "KM_LINT_WELCOME_PLACEHOLDER")!;
const missingWasmFatal = fatalFindings.find(f => f.code === "KM_FATAL_MISSING_WASM_MODULE")!;

// 2 from layerA (KM_ERROR entry + KM_WARN entry), 1 from layerB,
// 2 from layerC, 1 from fatalFindings — exercises all 5 severity levels
// and at least one finding with a hint.
const demoFindings: LintFinding[] = [
  duplicateStoreError,   // error, has hint
  deprecatedStoreWarn,   // warning, has hint
  canonicalOrderHint,    // hint, has hint
  missingLicenseError,   // error, has hint
  welcomePlaceholderInfo, // info, has hint
  missingWasmFatal,      // fatal, has hint
];

// Upstream-origin finding: spread duplicateStoreError and mark as upstream.
// This demonstrates the 50% opacity muted rendering.
const upstreamFinding: LintFinding = {
  ...duplicateStoreError,
  origin: "upstream" as const,
};

export function LintDemo() {
  return (
    <div
      style={{
        padding: 32,
        background: "#0d1117",
        minHeight: "100vh",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        boxSizing: "border-box",
      }}
    >
      <h1
        style={{
          fontSize: "1.4rem",
          margin: 0,
          letterSpacing: "-0.01em",
          marginBottom: 24,
        }}
      >
        Lint Chip Demo
      </h1>

      {/* Full summary with 6 findings */}
      <section
        aria-label="LintSummary example"
        style={{ marginBottom: 32, maxWidth: 720 }}
      >
        <h2
          style={{
            fontSize: "0.9rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#9aa7b8",
            fontWeight: 600,
            margin: "0 0 12px",
          }}
        >
          LintSummary (6 findings, all severity levels)
        </h2>
        <LintSummary findings={demoFindings} />
      </section>

      {/* Zero-state */}
      <section
        aria-label="LintSummary zero state"
        style={{ marginBottom: 32, maxWidth: 720 }}
      >
        <h2
          style={{
            fontSize: "0.9rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#9aa7b8",
            fontWeight: 600,
            margin: "0 0 12px",
          }}
        >
          LintSummary (zero state)
        </h2>
        <LintSummary findings={[]} />
      </section>

      {/* Upstream-muted chip */}
      <section
        aria-label="Upstream-origin chip example"
        style={{ maxWidth: 720 }}
      >
        <h2
          style={{
            fontSize: "0.9rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#9aa7b8",
            fontWeight: 600,
            margin: "0 0 12px",
          }}
        >
          LintChip — upstream origin (muted at 50% opacity)
        </h2>
        <LintChip finding={upstreamFinding} />
      </section>
    </div>
  );
}
