// monacoSetup — one-time Monaco configuration for the touch step's Code tab
// (TIKE touch-builder port, Phase 2).
//
// Binds @monaco-editor/react's loader to the LOCALLY BUNDLED monaco-editor —
// never a CDN — and points Monaco's web workers at Vite-bundled `?worker`
// modules (vite.config.ts sets worker.format "es"; no config change needed).
//
// Import this module once, for its side effects, before the first
// <Editor/> mounts (TouchCodePane.tsx does). Importing it twice is harmless:
// loader.config is idempotent and MonacoEnvironment is simply reassigned.

import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
// NOTE: the subpath needs the `.js` extension and no `esm/vs` prefix —
// monaco-editor's `exports` map (`"./*.js": "./esm/vs/*.js"`) only resolves
// that shape; the extensionless `esm/vs/...` form from Monaco's docs fails
// under Vite/Rollup's exports enforcement (verified against the 0.57.0 map).
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";
import jsonWorker from "monaco-editor/language/json/json.worker.js?worker";

// Use the bundled copy: @monaco-editor/react would otherwise fetch Monaco
// from a CDN at runtime.
loader.config({ monaco });

self.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    // The JSON language worker powers the Code tab's syntax highlighting;
    // everything else falls back to the main editor worker.
    if (label === "json") {
      return new jsonWorker();
    }
    return new editorWorker();
  },
};
