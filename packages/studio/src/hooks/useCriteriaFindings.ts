// useCriteriaFindings — the authored-mode findings for the criteria page
// (spec 084, plan §4, task T2.2).
//
// Two finding sources, merged and deduped by (code, message):
//   (a) Documentation findings from the existing useDocumentationFindings()
//       path — the 13 doc codes, with their rendered-docs projection and
//       upstream-origin reclassification intact. The engine is NEVER given
//       a docLintInput here (see assembleLintContext), so these codes
//       cannot arrive twice; the merge dedupe below is belt-and-braces
//       and is pinned by test.
//   (b) Engine findings from KeyboardLintEngine.lintWithContext() over
//       the OUTPUT artifact's VFS — what would ship, not the base's
//       startVfs — with the context from assembleLintContext().
//
// WHY THE ARTIFACT STAGE IS A PARAMETER, NOT usePreviewArtifact() CALLED
// HERE: usePreviewArtifact() is a full pipeline instance, not a reader.
// Each call mounts its own useKeyboardArtifact run (fetch/compile, blob
// URLs, download state) and carries an onInstantiate callback that can
// instantiate / rebase the working copy. OutputScreen deliberately owns
// exactly one instance; a second instance mounted from StudioShell for
// the Criteria route would double-instantiate that pipeline (a second
// compile run and a second onInstantiate surface to guard). So the host
// — which already owns the pipeline — passes `artifact.stage` in, and
// this hook only READS the stage it is handed. Exactly one artifact
// pipeline instance exists per screen, as before.
//
// INVENTORY (§18.6, spec 084 Batch 4): this hook builds the structured
// LinguistInventory the check needs, via buildCriteriaInventory — the
// author's confirmed decisions (workingCopyStore session.alphabet +
// session.confirmedInventory) unioned with the CLDR/SLDR exemplar
// baseline for each of the keyboard's language targets (the identity's
// tag, the decision-derived tag, and the judged package's declared
// languages), resolved through the engine's single sourcing path
// (services.sourcedExemplars — the same path Phase B proposes from).
// The outcome is folded into the assembled context with
// applyInventoryOutcome: a skipped build (a target with no CLDR/SLDR
// entry) or a fragment-bearing re-parse leaves §18.6 Not yet checkable
// with the reason named — visible degradation, never a guessed verdict
// and never a silent pass. Foreign mode builds NO inventory (the
// Compare assembly never calls this hook's build), so §18.6 stays Not
// yet checkable there.

import { useEffect, useMemo, useState } from "react";
import type {
  CompileResult,
  LintFinding,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { KeyboardLintEngine } from "@keymanapp/keyboard-lint";

import {
  applyInventoryOutcome,
  assembleLintContext,
} from "../criteria/assembleLintContext.ts";
import { computeAssemblyVerdicts } from "../criteria/assemblyVerdicts.ts";
import { buildCriteriaInventory } from "../criteria/buildCriteriaInventory.ts";
import type {
  CriteriaAssemblyVerdict,
} from "../criteria/criteriaTypes.ts";
import { deriveSurveyContext } from "../decisions/identitySelectors.ts";
import { resolveOutputKeyboardId } from "../lib/outputKeyboardId.ts";
import { readVfsText } from "../lib/vfsText.ts";
import {
  getStartBrowserService,
  sourcedExemplars,
  type SourcedInventory,
} from "../lib/services.ts";
import { useCriteriaRecordStore } from "../stores/criteriaRecordStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import type { Stage } from "./useKeyboardArtifact.ts";
import { useDocumentationFindings } from "./useDocumentationFindings.ts";

/**
 * Merge finding lists, deduping identical findings (same code AND same
 * message). First occurrence wins, so callers pass the doc findings
 * first: their `origin: "upstream"` reclassification is preserved if the
 * engine ever reports the same problem.
 */
import { mergeLintFindings } from "../criteria/mergeFindings.ts";
export { mergeLintFindings };

export interface CriteriaFindings {
  /** Doc + engine findings, merged and deduped by (code, message). */
  lintFindings: LintFinding[];
  /** Per-code verified details for the met-case evidence. */
  verifiedByCode: Map<string, string[]>;
  /** Consumable directly as CriteriaInput.contextMissing. */
  contextMissing: Record<string, string>;
  /** True once the stage is ready AND the engine run for it has settled. */
  ready: boolean;
  /** The judged artifact's keyboard id (null until the stage is ready). */
  keyboardId: string | null;
  /** The judged artifact's VFS (null until the stage is ready). */
  vfs: VirtualFS | null;
  /**
   * The stage's compile result (Batch 1: the §§7.6/7.21 severity
   * mapping reads it via CriteriaInput.compileResult). Null until the
   * stage is ready — the resolver never sees a compile result for an
   * artifact whose compile has not completed.
   */
  compileResult: CompileResult | null;
  /**
   * Assembly verdicts (Batch 3: 1.5 + 2.1/2.2/2.6), computed from the
   * working copy's instantiation state and the start-keyboard
   * catalog. Empty until the catalog has loaded and a base keyboard
   * exists — the affected rows then resolve Not yet checkable with
   * the reason, never Met.
   */
  assemblyVerdicts: ReadonlyMap<string, CriteriaAssemblyVerdict>;
  /** The working copy's instantiation mode, for the resolver's facts. */
  instantiationMode: "adapt-existing" | "new-from-base" | null;
}

interface EngineRun {
  /** The exact VFS object this run judged — identity, not path list, so a
   * recompiled artifact with the same file names never inherits a stale run. */
  forVfs: VirtualFS;
  findings: LintFinding[];
  verifiedByCode: Map<string, string[]>;
  contextMissing: Record<string, string>;
}

export function useCriteriaFindings(stage: Stage): CriteriaFindings {
  const docFindings = useDocumentationFindings();

  // The inventory build's author-side inputs (Batch 4): the confirmed
  // decisions from the working-copy session, and the author's language
  // facts (identity patch + decision-derived survey context). Subscribed
  // (not snapshotted) so a changed confirmation re-judges §18.6.
  const session = useWorkingCopyStore((s) => s.session);
  const identity = useWorkingCopyStore((s) => s.identity);
  const decisions = useDecisionStore((s) => s.decisions);

  // Batch 3 verdict inputs: the instantiation state (for 1.5 +
  // 2.1/2.2/2.6) and the author's contrastive-region attestation (for
  // 12.3, carried into the assembly below). The startVfs carries the
  // base keyboard's own files — §2.7 (KPJ pair) reads the base's .kpj
  // from it, via the assembly's baseKpjText input.
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const contrastiveAttestation = useCriteriaRecordStore(
    (s) => s.contrastiveAttestation,
  );

  // The start-keyboard catalog for the 1.5 verdict: loaded once per
  // mount; null until it settles (and on failure) — the verdict is
  // withheld while null, never guessed from an unloaded catalog.
  const [catalog, setCatalog] = useState<
    readonly { id: string; path: string }[] | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    getStartBrowserService()
      .listAll()
      .then((all) => {
        if (!cancelled) setCatalog(all.map((k) => ({ id: k.id, path: k.path })));
      })
      .catch(() => {
        if (!cancelled) setCatalog(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const assemblyVerdicts = useMemo<
    ReadonlyMap<string, CriteriaAssemblyVerdict>
  >(() => {
    if (startKeyboard === null || startIr === null) return new Map();
    if (instantiationMode === null) return new Map();
    return computeAssemblyVerdicts({
      catalog,
      baseKeyboardId: startKeyboard.id,
      outputKeyboardId: resolveOutputKeyboardId(identity, startKeyboard),
      instantiationMode,
      startVersion: startIr.header.version ?? "1.0",
    });
  }, [catalog, startKeyboard, startIr, identity, instantiationMode]);

  const readyStage = stage.kind === "ready" ? stage : null;
  const vfs = readyStage?.vfs ?? null;
  const keyboardId = readyStage?.keyboardId ?? null;

  const [engineRun, setEngineRun] = useState<EngineRun | null>(null);

  useEffect(() => {
    if (vfs === null || keyboardId === null) return;
    let cancelled = false;

    void (async () => {
      const baseKpjPath =
        startVfs?.list().find((p) => p.toLowerCase().endsWith(".kpj"));
      const baseKpjText =
        startVfs !== null &&
        startVfs !== undefined &&
        baseKpjPath !== undefined
          ? readVfsText(startVfs, baseKpjPath)
          : undefined;
      const assembled = assembleLintContext({
        vfs,
        keyboardId,
        contrastiveRegionAttested: contrastiveAttestation != null,
        ...(baseKpjText !== undefined ? { baseKpjText } : {}),
      });

      // The keyboard's language targets: the author's tags first (the
      // identity patch, then the decision-derived tag), then the judged
      // package's declared languages. For a generated output package
      // these coincide (the descriptor writes the author's tag); the
      // union keeps every declared target baselined.
      const surveyContext = deriveSurveyContext(decisions);
      const languageTags = [
        ...new Set(
          [
            identity?.bcp47,
            surveyContext.bcp47_tag,
            ...(assembled.ctx.criteriaInput?.kpsLanguages ?? []),
          ]
            .map((t) => (t ?? "").trim())
            .filter((t) => t.length > 0),
        ),
      ];

      // Resolve the exemplar baseline per target through the single
      // sourcing path. A failed load degrades to "no entry" for that
      // tag (the Phase B precedent): the build then skips with the tag
      // named, rather than wedging the page.
      const sourcedByTag = new Map<string, SourcedInventory | null>();
      await Promise.all(
        languageTags.map(async (tag) => {
          try {
            sourcedByTag.set(tag, await sourcedExemplars(tag));
          } catch {
            sourcedByTag.set(tag, null);
          }
        }),
      );
      if (cancelled) return;

      const build = buildCriteriaInventory({
        languageTags,
        script: surveyContext.script_family ?? assembled.script,
        confirmed: {
          ...(session.alphabet !== undefined
            ? { alphabet: session.alphabet }
            : {}),
          confirmedInventory: session.confirmedInventory,
        },
        sourcedByTag,
      });
      const { ctx, contextMissing } = applyInventoryOutcome(
        assembled,
        build.kind === "built"
          ? { kind: "built", inventory: build.inventory }
          : { kind: "skipped", missingTag: build.missingTag },
      );

      try {
        const engine = await new KeyboardLintEngine().lintWithContext(
          vfs,
          keyboardId,
          ctx,
        );
        if (!cancelled)
          setEngineRun({
            forVfs: vfs,
            findings: engine.findings,
            verifiedByCode: engine.verifiedByCode,
            contextMissing,
          });
      } catch {
        // A failed engine run must not wedge the page: report no engine
        // findings for this artifact, but keep the contextMissing map so
        // checks that could not run still resolve Not yet checkable.
        if (!cancelled)
          setEngineRun({
            forVfs: vfs,
            findings: [],
            verifiedByCode: new Map(),
            contextMissing,
          });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    vfs,
    keyboardId,
    session,
    identity,
    decisions,
    contrastiveAttestation,
    startVfs,
  ]);

  const runIsCurrent = engineRun !== null && engineRun.forVfs === vfs;

  const lintFindings = useMemo(
    () =>
      mergeLintFindings(docFindings, runIsCurrent ? engineRun.findings : []),
    [docFindings, engineRun, runIsCurrent],
  );

  return {
    lintFindings,
    verifiedByCode: runIsCurrent ? engineRun.verifiedByCode : new Map(),
    contextMissing: runIsCurrent ? engineRun.contextMissing : {},
    ready: readyStage !== null && runIsCurrent,
    keyboardId,
    vfs,
    compileResult: readyStage?.compileResult ?? null,
    assemblyVerdicts,
    instantiationMode: startKeyboard !== null ? instantiationMode : null,
  };
}
