# Day-4 Smoke-Run Checklist

**Issue:** #32 — Integration Day: swap mocks for real validator, compiler, scaffolder
**Acceptance criterion:** #5 — committed smoke-run checklist at `packages/studio/docs/smoke-day-4.md`
**Branch:** `km/issue-32-integration-smoke`

---

## Prerequisites

- [ ] `pnpm dev` is running inside `packages/studio` (default port `5173`)
- [ ] A sibling `keymanapp/keyboards` clone is present at `../keyboards` relative to the repo root
- [ ] Browser: Chrome or Firefox (WASM support required; Safari excluded until WASM threading lands)

---

## Smoke-Run Steps

1. - [ ] Open `http://localhost:5173` (or the port Vite reports in the terminal).

2. - [ ] Confirm the **BaseBrowserPicker** dropdown loads and lists keyboards drawn from the local `keymanapp/keyboards` clone. The list should contain 100+ entries.

3. - [ ] Select `khmer_angkor` from the dropdown. (Fallback: use `sil_euro_latin` if the clone is incomplete or a network-backed fetch fails.)

4. - [ ] Confirm a **"fetching"** spinner appears in the preview pane immediately after selection, followed by a **"compiling"** state indicator while `kmc-kmn` WASM runs.

5. - [ ] Confirm the **KeymanWeb OSK** renders in the right pane once compilation completes.

6. - [ ] Click inside the OSK iframe and type a character. Confirm the keyboard responds (key highlights or character output visible).

7. - [ ] Confirm the **DiagnosticsPanel** appears below the OSK. A clean source produces a green "No compiler diagnostics" banner; a source with warnings shows severity + message rows.

8. - [ ] To verify the real validator is wired: open the browser DevTools console and run:
   ```js
   // runAllChecks is exposed on window.studioDebug in dev builds
   window.studioDebug.runAllChecks("bad source here")
   ```
   Confirm the call returns an array of findings (non-empty).

9. - [ ] Click the **New from base** button in the left pane to enter scaffold mode. With a base keyboard already selected, fill in the **ScaffoldForm** (Keyboard ID + Display name) and click **Create keyboard**. Confirm the right pane cycles through "fetching" → "compiling" and then renders the OSK for the new keyboard.

10. - [ ] With the scaffolded keyboard compiled and the **KmnEditor** visible in the left pane, add a mapping rule (e.g. `+ [K_C] > 'c'`), then pause typing. After the 300 ms debounce, confirm the OSK re-renders and the DiagnosticsPanel reflects the updated compile result.

11. - [ ] Click the **Download .zip** button in the toolbar. Confirm a `.zip` file download is triggered by the browser and is **non-empty** (size > 0 bytes). The archive is a real `VirtualFS` zip produced by `toZip(vfs)`.

---

## Automated proof of the scaffold-compile chain

[packages/engine/src/scaffolder/scaffold-compile.integration.test.ts](../../../packages/engine/src/scaffolder/scaffold-compile.integration.test.ts)
covers both paths automatically:

- **Case A (fetch-OK):** scaffold from a base that returns a valid KMN → compile → 2 artifacts (`.kmx` + `.js`), 0 fatal/error diagnostics.
- **Case B (404 stub):** scaffold when the base source is unreachable → header-only stub KMN → compile → at least a `.kmx` artifact, 0 fatal/error diagnostics.

These tests encode the codec fixes that previously caused every scaffolded keyboard to produce zero artifacts: `&VERSION` file-format default raised from `'1.0'` to `'14.0'`, and `&CasedKeys` system-store casing corrected so `kmc-kmn` accepts it.

---

## Remaining limitations

- **Full live browser E2E (Playwright):** end-to-end automated browser sign-off is tracked separately in issues #53/#54. The manual click-through in steps 9–11 above is the human sign-off in place of that automation until it lands.

---

## Sign-Off

| Step | Result | Tester | Date |
|------|--------|--------|------|
| 1    |        |        |      |
| 2    |        |        |      |
| 3    |        |        |      |
| 4    |        |        |      |
| 5    |        |        |      |
| 6    |        |        |      |
| 7    |        |        |      |
| 8    |        |        |      |
| 9    |        |        |      |
| 10   |        |        |      |
| 11   |        |        |      |
