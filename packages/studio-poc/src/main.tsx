import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StudioShell } from "./StudioShell.tsx";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Studio bootstrap: #root element missing from index.html");
}

createRoot(rootEl).render(
  <StrictMode>
    <StudioShell />
  </StrictMode>,
);
