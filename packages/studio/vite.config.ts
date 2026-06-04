import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Real authoring SPA. For the POC dev tool with the in-browser
// kmcmplib + kmw-compiler pipeline + local-keyboards Vite plugin,
// see @keyboard-studio/studio-poc.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
  },
});
