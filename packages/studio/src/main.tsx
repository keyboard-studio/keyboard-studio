import './index.css';
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StudioShell } from "./StudioShell.tsx";
import { LintDemo } from "./lint/index.ts";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Studio bootstrap: #root element missing from index.html");
}

const isDemoLint =
  typeof window !== "undefined" &&
  window.location.search.includes("demo=lint");

createRoot(rootEl).render(
  <StrictMode>
    {isDemoLint ? <LintDemo /> : <StudioShell />}
  </StrictMode>,
);
