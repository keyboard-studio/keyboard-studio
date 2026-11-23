// The Open end-to-end walk with SC-010 asserted after EVERY applied change (spec 111
// T097). One corpus keyboard (bambara: .kmn, .kvks, touch layout, .kps, help page) is
// opened, then each kind of change is applied in turn; after each, every file the
// change touched must read byte-for-byte the same in the code view, the preview and
// the download (version lines and HISTORY aside). The touched set is measured from the
// working copy's files, not declared by the test. Undo is walked back the same way.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS, makePattern, type MechanismAssignment, type Pattern, type StartKeyboard, type VirtualFS } from "@keyboard-studio/contracts";
import { fetchKeyboardSourceToVfs, parseKmn, parseKps, type FetchFn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { clearOpenSession, useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useOpenRemovalStore } from "../stores/openRemovalStore.ts";
import { useOpenAssignStore, assignmentFingerprint } from "../stores/openAssignStore.ts";
import { applyOpenChange, undoLastOpenApply } from "./openApply.ts";
import type { OpenApplyResult, OpenChange } from "./openApply/types.ts";
import { commitDescriptorOnOpen } from "./descriptorOpenCommit.ts";
import { commitStylesheetOnOpen } from "./cssOpenCommit.ts";
import { commitDocPagesThroughSeam } from "./docsOpenCommit.ts";
import { applyDocRegeneration } from "./docRegenerationFix.ts";
import { useDocRegenerationFixes } from "../hooks/useDocRegenerationFixes.ts";
import { findTouchLayoutPath } from "./findTouchLayoutPath.ts";
import { readVfsText } from "./vfsText.ts";
import { sampleKeyboardRelativePath } from "../test/openSampleKeyboards.ts";
import { expectSc010, snapshotText, touchedPaths, type Sc010Context } from "../test/openSc010.ts";

const SWAP: Pattern = makePattern({
  id: "simple_swap", title: "simple_swap", description: "simple_swap", category: "desktop", appliesTo: [],
  questions: [{ id: "kmnRules", prompt: "kmnRules", answerType: "text" as const }],
  kmnFragment: "{{kmnRules}}\n", tests: [], validatedForFamilies: [], sourceKeyboards: [], reviewedBy: "", reviewDate: "2026-10-29",
});
vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async (id: string) => (id === "simple_swap" ? SWAP : undefined) })),
  getPatternByIdSync: (id: string) => (id === "simple_swap" ? SWAP : undefined),
}));

const ID = "bambara";
const HERE = dirname(fileURLToPath(import.meta.url));
const KEYBOARDS_ROOT = resolve(HERE, "../../../../../keyboards");
const PROXY = "http://corpus.invalid";
const corpusFetch: FetchFn = async (url) => {
  const file = join(KEYBOARDS_ROOT, url.slice(PROXY.length + 1));
  if (!existsSync(file) || !statSync(file).isFile()) {
    return { ok: false, status: 404, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
  }
  const bytes = readFileSync(file);
  return {
    ok: true, status: 200,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
};

const KMN = `source/${ID}.kmn`;
const KVKS = `source/${ID}.kvks`;
const KPS = `source/${ID}.kps`;
const CSS = `source/${ID}.css`;
const HELP = `source/help/${ID}.php`;

let fetched: VirtualFS;
let ctx: Sc010Context;
const startVfs = (): VirtualFS => useWorkingCopyStore.getState().startVfs!;
const host = (c: OpenChange): Promise<OpenApplyResult> => Promise.resolve(applyOpenChange(c));
const ruleFor = (needle: string) =>
  useWorkingCopyStore.getState().startIr!.groups.flatMap((g) => g.rules).find((r) => JSON.stringify(r.context).includes(needle))!;

/** The steps the walk took, for the report the last test asserts on. */
const steps: Array<{ name: string; touched: string[] }> = [];

/** Runs one applied change, measures the files it touched, and asserts SC-010 on them. */
async function walkStep(name: string, run: () => void | Promise<void>, expectTouched?: string[]): Promise<string[]> {
  const before = snapshotText(startVfs());
  await run();
  const touched = touchedPaths(before, snapshotText(startVfs()));
  expect(touched.length, `${name}: the change touched no file`).toBeGreaterThan(0);
  if (expectTouched) for (const p of expectTouched) expect(touched, `${name}: expected ${p} touched`).toContain(p);
  await expectSc010(ctx, touched, name);
  steps.push({ name, touched });
  return touched;
}

describe("Open walk on bambara: SC-010 after every applied change", () => {
  async function openBambara(): Promise<void> {
    const meta = parseKps(readFileSync(join(KEYBOARDS_ROOT, "release", sampleKeyboardRelativePath(ID), "source", `${ID}.kps`), "utf8"));
    const kb: StartKeyboard = {
      id: ID, path: `release/${sampleKeyboardRelativePath(ID)}`, script: meta.script, targets: meta.targets,
      displayName: meta.displayName, version: meta.version, languages: meta.languages,
    };
    const vfs = createVirtualFS();
    await fetchKeyboardSourceToVfs(kb, vfs, { proxyBase: PROXY, fetchImpl: corpusFetch, keepKps: true });
    fetched = createVirtualFS(vfs.entries());
    ctx = { fetched, id: ID };
    clearOpenSession();
    useOpenRemovalStore.getState().clear();
    useOpenAssignStore.getState().clear();
    useDecisionStore.getState().reset();
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    wc.instantiateFromExisting(kb, { vfs, ir: parseKmn(readVfsText(vfs, KMN)!, ID).ir });
    wc.setAttribution({ authorName: "Walk", copyrightHolder: "Walk" });
    wc.setFallbackPolicy("pass-through");
    const help = readVfsText(vfs, HELP);
    if (help !== undefined) wc.setStartHelpPhpText(help);
  }

  it("walks every kind of change, SC-010 asserted after each", async () => {
    await openBambara();
    // --- nothing applied
    const all = [...snapshotText(startVfs()).keys()];
    await expectSc010(ctx, all, "open");

  // --- removal
  {
    const rule = ruleFor("K_9");
    await walkStep("removal", () => {
      expect(applyOpenChange({ kind: "remove", itemIds: [rule.nodeId], chars: ["9"] }).status).toBe("applied");
    }, [KMN, KVKS]);
    // Guards the check itself: the preview started from the fetched text, so agreement above
    // means the working copy's change really reached the preview and the download.
    expect(readVfsText(startVfs(), KMN)).not.toBe(readVfsText(fetched, KMN));
  }

  // --- restore (reinsert)
  {
    await walkStep("restore", () => {
      const entries = [...useOpenRemovalStore.getState().entries];
      expect(applyOpenChange({ kind: "reinsert", entries }).status).toBe("applied");
    }, [KMN]);
  }

  // --- assign (kmn + kvks + touch labels in one change), then unassign
  {
    const a: MechanismAssignment = {
      scope: "individual", target: "ɐ", modality: "physical", source: "user",
      mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: "+ [K_Q] > U+0250" } }],
    };
    const touched = await walkStep("assign", () => {
      expect(applyOpenChange({ kind: "assign", add: [a], remove: [] }).status).toBe("applied");
    }, [KMN]);
    expect(touched.length).toBeGreaterThanOrEqual(1);
    await walkStep("unassign", () => {
      expect(applyOpenChange({ kind: "assign", add: [], remove: [assignmentFingerprint(a)] }).status).toBe("applied");
    }, [KMN]);
  }

  // --- code-view edit of the .kmn
  {
    const edited = readVfsText(startVfs(), KMN)!.replace("+ [K_5] > '5'", "+ [K_5] > '5'  c walk edit");
    await walkStep("code edit", () => {
      expect(applyOpenChange({ kind: "files", files: { [KMN]: edited }, label: "Edit" }).status).toBe("applied");
    }, [KMN]);
  }

  // --- touch key edit and a touch key delete
  {
    const path = findTouchLayoutPath(startVfs())!;
    expect(path, "bambara ships a touch layout").toBeDefined();
    const layout = JSON.parse(readVfsText(startVfs(), path)!.replace(/^﻿/, "")) as { phone?: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string }> }> }> } };
    const layer = layout.phone!.layer[0]!;
    const firstKey = layer.row[0]!.key[0]!.id;
    const lastKey = layer.row[0]!.key[layer.row[0]!.key.length - 1]!.id;
    await walkStep("touch key edit", () => {
      const r = applyOpenChange({ kind: "touch", edit: { ops: [{ kind: "set", seq: 1, address: `phone:${layer.id}:${firstKey}`, fields: { text: "ɛ" } }] }, label: "edit" });
      expect(r.status).toBe("applied");
    }, [path]);
    await walkStep("touch key delete", () => {
      expect(applyOpenChange({ kind: "touch", edit: { removeIds: [`phone:${layer.id}:${lastKey}`] }, label: "drop" }).status).toBe("applied");
    }, [path]);
  }

  // --- language list (.kps)
  {
    await walkStep("language list", async () => {
      expect(await commitDescriptorOnOpen({ languages: [{ tag: "bm" }, { tag: "dyu" }] }, host)).toBe("written");
    }, [KPS]);
  }

  // --- stylesheet
  {
    await walkStep("stylesheet", async () => {
      expect(await commitStylesheetOnOpen(".kmw-key { color: red; }", host)).toBe("written");
    }, [CSS]);
  }

  // --- documentation page, then the regeneration fix when one is offered
  {
    const s = useWorkingCopyStore.getState();
    const current = readVfsText(startVfs(), HELP);
    expect(current, "bambara ships help/bambara.php").toBeDefined();
    const edited = `${current}\n<p>Walk edit.</p>\n<!-- ks:generated:start -->\nstale\n<!-- ks:generated:end -->\n`;
    await walkStep("documentation page", () => {
      expect(commitDocPagesThroughSeam({ edits: { "help-php": edited }, keyboardId: ID, startVfs: s.startVfs, convention: s.startWelcomeConvention }).written).toEqual(["help-php"]);
    }, [HELP]);
    useWorkingCopyStore.getState().setStartHelpPhpText(edited);
    const fix = renderHook(() => useDocRegenerationFixes()).result.current.find((f) => f.id.startsWith("docs:regenerate:help-php:"));
    expect(fix, "a stale generated section offers the regeneration fix").toBeDefined();
    await walkStep("regeneration fix", async () => {
      expect(await applyDocRegeneration(fix!, host)).toBe(true);
    }, [HELP]);
  }

  // --- undo walks every change back, SC-010 holding after each
  {
    let n = 0;
    while (useOpenUndoStore.getState().records.length > 0) {
      const before = snapshotText(startVfs());
      expect(undoLastOpenApply().ok).toBe(true);
      const touched = touchedPaths(before, snapshotText(startVfs()));
      await expectSc010(ctx, touched, `undo #${++n}`);
    }
    expect(n).toBeGreaterThanOrEqual(steps.length - 1);
    // Back on the fetched files for the .kmn, apart from nothing: the walk leaves no residue.
    expect(readVfsText(startVfs(), KMN)).toBe(readVfsText(fetched, KMN));
  }

  // --- the walk covered every kind of live-file change
  {
    const names = steps.map((s) => s.name);
    expect(names).toEqual([
      "removal", "restore", "assign", "unassign", "code edit", "touch key edit", "touch key delete",
      "language list", "stylesheet", "documentation page", "regeneration fix",
    ]);
  }
  }, 120_000);
});
