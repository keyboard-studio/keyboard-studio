// Shared SC-004 setup: the real adapt flow up to (not including) the gates.
// Lives outside *.test.ts so the jsdom gate test and the node-environment .kmp
// test run the identical flow.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { createVirtualFS, makeBaseKeyboard } from "@keyboard-studio/contracts";
import type { VirtualFS, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { questionRegistry } from "../survey/questions/registry.ts";
import { runDecisionFlow } from "../decisions/decisionFlow.ts";
import { buildExtractContext } from "../decisions/extractContext.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { applyDecisionEffects, type ReducerDeps } from "../steps/reducer.ts";
import { applyMutatePatch } from "../steps/mutateApply.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { identityLanguagePatch } from "../lib/identityLanguagePatch.ts";

const here = dirname(fileURLToPath(import.meta.url));

// The same five keyboards as SC-001 (kept in step by hand: that block is owned
// by a concurrent edit, so the table is repeated rather than imported). Unlike
// SC-001 (which only needs the .kmn), the submission gates need the WHOLE
// package -- icon, visual keyboard, touch layout, welcome pages, licence -- so
// the packages are loaded from the pinned ../keyboards corpus (the project's
// canonical corpus; CI checks it out at a pinned commit).
export const KEYBOARDS = [
  { id: "basic_kbdus", group: "basic", script: "Latn", languages: ["en"] },
  { id: "basic_kbdru", group: "basic", script: "Cyrl", languages: ["ru"] },
  { id: "basic_kbdgr", group: "basic", script: "Latn", languages: ["de"] },
  { id: "arabic_izza", group: "a", script: "Arab", languages: ["ar"] },
  { id: "basic_kbduk", group: "basic", script: "Latn", languages: ["en"] },
] as const;

export const CORPUS = resolve(here, "../../../../../keyboards/release");
export const corpusPresent = existsSync(CORPUS);

/**
 * Gates run when the corpus is present, or unconditionally in CI (where an absent
 * corpus must FAIL via the presence assertion, not skip). Locally without the
 * sibling ../keyboards checkout they skip -- never silently: see announceSc004Skip.
 */
export const sc004GatesEnabled = corpusPresent || Boolean(process.env.CI);

/** Make a local skip visible: a console warning plus a clearly named skipped test. */
export function announceSc004Skip(label: string, skipTest: (name: string) => void): void {
  if (sc004GatesEnabled) return;
  console.warn(
    `[WARN] ${label}: SKIPPED -- keyboards corpus not found at ${CORPUS}. ` +
      "The SC-004 submission gates did NOT run. Check out ../keyboards (or set CI=1 to fail instead).",
  );
  skipTest(`${label} NOT RUN: keyboards corpus absent at ${CORPUS}`);
}

/** The package's files as the base browser would hand them over (no build/ output). */
function loadVfs(kb: (typeof KEYBOARDS)[number]): VirtualFS {
  const rootDir = join(CORPUS, kb.group, kb.id);
  const files: { path: string; content: string | Uint8Array; isBinary: boolean }[] = [];
  const isBinary = (p: string) => /\.(ico|png|jpg|jpeg|gif|kmx|kvk|ttf|woff2?)$/i.test(p);
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const rel = relative(rootDir, abs).replaceAll("\\", "/");
      if (statSync(abs).isDirectory()) {
        if (rel === "build" || rel === ".git") continue;
        walk(abs);
      } else {
        files.push(
          isBinary(rel)
            ? { path: rel, content: new Uint8Array(readFileSync(abs)), isBinary: true }
            : { path: rel, content: readFileSync(abs, "utf-8"), isBinary: false },
        );
      }
    }
  };
  walk(rootDir);
  // Shared assets (fonts, display maps) live OUTSIDE the package, at
  // release/shared/. The real loader (engine fetchKeyboardSourceToVfs) stages
  // each one the .kmn / .kps references into the VFS at `shared/...`; do the same.
  const refText = files
    .filter((f) => !f.isBinary && /\.(kmn|kps)$/i.test(f.path))
    .map((f) => f.content as string)
    .join("\n");
  const have = new Set(files.map((f) => f.path));
  const sharedRef = /(?:\.\.[\\/]){3}(shared[\\/][^'"<>\r\n]+)/g;
  for (const m of refText.matchAll(sharedRef)) {
    const rel = m[1]!.replaceAll("\\", "/").trim();
    const abs = join(CORPUS, rel);
    if (have.has(rel) || !existsSync(abs)) continue;
    have.add(rel);
    files.push(
      isBinary(rel)
        ? { path: rel, content: new Uint8Array(readFileSync(abs)), isBinary: true }
        : { path: rel, content: readFileSync(abs, "utf-8"), isBinary: false },
    );
  }
  // Header-store siblings that traverse out of source/ (e.g. DISPLAYMAP
  // '../../../shared/fonts/.../X.json') are written by the same loader at the
  // literal `source/<store path>` key, which is what the compiler looks up.
  const storeRef = /store\(&\w+\)\s*'([^']*\.\.[^']*)'/g;
  for (const m of refText.matchAll(storeRef)) {
    const raw = m[1]!.trim();
    const key = `source/${raw}`;
    const abs = join(rootDir, "source", raw);
    if (have.has(key) || !existsSync(abs)) continue;
    have.add(key);
    files.push(
      isBinary(raw)
        ? { path: key, content: new Uint8Array(readFileSync(abs)), isBinary: true }
        : { path: key, content: readFileSync(abs, "utf-8"), isBinary: false },
    );
  }
  return createVirtualFS(files);
}

const mod = (id: string) => {
  const m = questionRegistry[id];
  if (!m) throw new Error(`question "${id}" not in registry`);
  return m;
};

const ADAPT_MODULES = [
  "il_language_english",
  "il_language_code",
  "il_target_script",
  "il_author_name",
  "il_copyright_holder",
  "track_choice",
  "pb_standard_letters",
  // The character-inventory provider is the gallery module (spec 090 T021
  // retired the pb_character_inventory spike into it); it is in the
  // registry, so it joins by id like the others. Its declared requires
  // pull in the project-name modules (project-keyboard-id, which requires
  // project-display-name) — the live adapt flow's set includes them.
  "characterInventory",
  "project_keyboard_id",
  "project_display_name",
].map(mod);

/** Instantiate Track 1, run the decision flow, apply answers. Returns the decisions. */
export function runAdaptFlow(kb: (typeof KEYBOARDS)[number]) {
    const vfs = loadVfs(kb);
    const kmnText = readVfsText(vfs, `source/${kb.id}.kmn`);
    expect(kmnText, "fixture .kmn present in VFS").toBeDefined();
    const { ir } = parseKmn(kmnText!, kb.id);
    const base = makeBaseKeyboard({
      id: kb.id,
      script: kb.script,
      path: `release/test/${kb.id}`,
      targets: ["windows"],
      displayName: kb.id,
      version: "1.0",
      languages: [...kb.languages],
    });

    // --- 1. Track 1 working copy -------------------------------------
    useWorkingCopyStore.getState().instantiateFromBase(base, { vfs, ir });
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe(kb.id);

    // --- 2. unified decision flow with fixture answers ----------------
    const decisions = runDecisionFlow({
      modules: ADAPT_MODULES,
      context: buildExtractContext(ir, base),
      answers: {
        il_language_english: "Test Language",
        il_author_name: "Test Author",
        track_choice: "adapt",
        pb_standard_letters: "basic-az",
      },
    });
    expect(decisions["authoring-track"]?.value).toBe("adapt");
    expect(decisions["language-code"]?.value).toBe(kb.languages[0]);

    // --- 3. apply the answers ----------------------------------------
    const store = useWorkingCopyStore;

    // 3a. apply-declaring modules go through the real decision-apply runner
    // (spec 089: the successor to the mutate seam this step used before).
    // The sink mirrors StudioShell's production composition — the checked
    // `ir` merge first, then the overlay channels.
    let applied = 0;
    const deps = {
      getWorkingIR: () => store.getState().ir,
      getDecisions: () => decisions,
      getHistoryEntryState: () => store.getState().historyEntryState,
      applyWorkingCopyPatch: (patch, writes) => {
        applied++;
        const wc = store.getState();
        if (patch.ir !== undefined && wc.ir !== null) {
          wc.setWorkingIR(applyMutatePatch(wc.ir, patch.ir, writes));
        }
        if (patch.identity !== undefined) wc.setIdentity(patch.identity);
        if (patch.attribution !== undefined) wc.setAttribution(patch.attribution);
        if (patch.helpDocs !== undefined) wc.setHelpDocs(patch.helpDocs);
        if (patch.historyEntryState !== undefined) wc.setHistoryEntryState(patch.historyEntryState);
      },
    } as ReducerDeps;
    applyDecisionEffects(
      {
        phase: "B",
        answers: [
          { questionId: "il_language_english", answerType: "text", value: "Test Language" },
          { questionId: "il_author_name", answerType: "text", value: "Test Author" },
          { questionId: "track_choice", answerType: "select", value: "adapt" },
          { questionId: "pb_standard_letters", answerType: "select", value: "basic-az" },
        ],
      },
      deps,
    );
    expect(applied, "at least one module applied through the decision-apply runner").toBeGreaterThan(0);

    // 3b. identity / characters: the setters the adapters call.
    const language = {
      bcp47: String(decisions["language-code"]?.value ?? ""),
      english: String(decisions["language-name"]?.value ?? ""),
    };
    store.getState().setAttribution({
      authorName: String(decisions["author-name"]?.value ?? ""),
      copyrightHolder: String(decisions["copyright-holder"]?.value ?? ""),
    });
    store.getState().setIdentity({ displayName: base.displayName, ...identityLanguagePatch(language) });
    const inventory =
      (decisions["character-inventory"]?.value as { chars?: string[] } | undefined)?.chars ?? [];
    const phaseB: SurveyPhaseResult = {
      phase: "B",
      answers: [{ questionId: "b_inventory", answerType: "char-list", value: inventory }],
    };
    store.getState().recordPhase(phaseB);
    return decisions;
}
