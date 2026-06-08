# Day-4 Smoke-Run Checklist

**Issue:** #32 — Integration Day: swap mocks for real validator, compiler, scaffolder
**Acceptance criterion:** #5 — committed smoke-run checklist at `packages/studio/docs/smoke-day-4.md`
**Branch:** `km/issue-32-swap-mocks`

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
   Confirm the call returns an array of findings (non-empty). _(Note: in-editor source editing and live diagnostics from typed source arrive in issue #48.)_

9. - [ ] Click the **Download** button in the toolbar. Confirm a `.js` file download is triggered by the browser.

10. - [ ] Open the downloaded file (or inspect via DevTools > Network) and confirm it is **non-empty** (size > 0 bytes).

---

## Intentional Limitations (Day-4 Scope)

- **Download artifact:** The download button produces the compiled `.js` artifact only. A full `VirtualFS` zip (`.kmp` bundle) is a follow-on item; tracking TBD.
- **Scaffolder UI:** `createScaffolderService` from `@keyboard-studio/engine` is implemented and tested at the API level but is **not yet wired to a UI button**. Manual invocation via the browser console or a Node script is required for Day-4 validation. UI entry point arrives in issue #48.
- **Live validator diagnostics from typed source:** The `runAllChecks` debounce loop (300 ms) is active, but the in-editor source-editing surface does not exist yet. Validator verification in step 8 is therefore console-only until issue #48.

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
