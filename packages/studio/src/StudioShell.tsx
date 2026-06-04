// Real authoring SPA — empty shell. The spec'd two-pane survey + live
// preview layout lands in #22 / #48 et al.
//
// For the working compile-on-the-fly POC (in-browser kmcmplib +
// kmw-compiler + KMW iframe + base-keyboard picker), see the sibling
// package @keyboard-studio/studio-poc. That package stays on main as a
// dev tool / integration testbed; reuse components from there as this
// package gets built up against the spec.

export function StudioShell() {
  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "grid",
        placeItems: "center",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        background: "#0d1117",
        color: "#e6edf3",
        padding: 32,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: 640,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: "2rem", letterSpacing: "-0.02em" }}>
          Keyboard Studio
        </h1>
        <p style={{ margin: 0, color: "#9aa7b8", fontSize: 15, lineHeight: 1.6 }}>
          The spec&apos;d authoring SPA scaffold. The survey, gallery, strategy
          picker and live preview pane land here as work resumes against{" "}
          <code style={{ color: "#7ee787" }}>spec.md</code> §4&nbsp;/&nbsp;§7&nbsp;/&nbsp;§8.
        </p>
        <p style={{ margin: 0, color: "#9aa7b8", fontSize: 14, lineHeight: 1.6 }}>
          For the working compile + preview reference, run the POC dev
          interface:
        </p>
        <code
          style={{
            background: "#161b22",
            border: "1px solid #283040",
            borderRadius: 8,
            padding: "10px 14px",
            color: "#6ea8fe",
            fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
            fontSize: 13,
          }}
        >
          pnpm --filter @keyboard-studio/studio-poc dev
        </code>
      </div>
    </div>
  );
}
