// galleryHost — the runtime host for gallery decision modules (spec 090 T005).
//
// A gallery step's component tree used to write survey answers, session
// fields, and working-copy overlays directly. Under spec 090 the step is a
// module (survey/questions/gallery/): its renderer receives the recorded
// decision's value + provenance through DecisionRendererProps and reports
// every change through onChange. THIS host is the first runtime reader of
// `module.renderer`: it renders the module's renderer, and its onChange is
// the single write path — record the decision, then run the module's apply.
//
// Why not 089's runner? `applyDecisionEffects` iterates step-completion
// ANSWERS (`string | string[] | undefined`); gallery values are rich
// objects recorded the moment the author acts, not at step completion
// (research addendum D-090-1). The host therefore invokes `apply` directly,
// but reuses the runner's exact machinery: the same ApplyContext shape, the
// same channel authorization (`assertPatchChannelsAuthorized`, contract A3),
// and the same injected patch sink StudioShell composes for the runner.
// Record-then-apply ordering matches A6: the apply's `ctx.decisions`
// already contains the decision just recorded.
//
// Boundary: steps/ may not import stores/, lib/, or components/ (depcruise
// steps-layer), so every store touch is an injected dep — the same pattern
// as ReducerDeps. `lib/galleryHostDeps.ts` composes the live deps from the
// stores; step wrappers hand them in.

import { createContext, useContext } from "react";
import type { IRPath, KeyboardIR, HistoryEntryState } from "@keyboard-studio/contracts";
import type {
  Decision,
  DecisionProvenance,
  DecisionSet,
} from "../decisions/decisionTypes.ts";
import type { ApplyContext, GalleryModule, WorkingCopyPatch } from "../survey/types.ts";
import { assertPatchChannelsAuthorized } from "./applyAuthorization.ts";

/**
 * Step chrome a hosted renderer may need — completion and back navigation.
 * DecisionRendererProps (FR-001) deliberately carries only the decision
 * contract, so the host passes the manifest step's navigation through
 * this context instead: the wrapper (the step's manifest component) gives
 * it to the host, and renderers that navigate consume it. Renderers that
 * never navigate (the small pickers) simply ignore it.
 */
export interface GalleryStepContextValue {
  onComplete: (result: unknown) => void;
  onBack?: () => void;
}

export const GalleryStepContext = createContext<GalleryStepContextValue | null>(null);

/** The step context the gallery host provided; throws outside a hosted renderer. */
export function useGalleryStepContext(): GalleryStepContextValue {
  const ctx = useContext(GalleryStepContext);
  if (ctx === null) {
    throw new Error("useGalleryStepContext: renderer is not hosted by GalleryHost");
  }
  return ctx;
}

/** The store touches the host needs, injected (see file header). */
export interface GalleryHostDeps {
  /** Write one decision record into the live decision store. */
  recordDecision: (record: Decision) => void;
  /** Read the live decision set (inputs snapshots + apply contexts). */
  getDecisions: () => DecisionSet;
  /** Read the working copy's current IR (null before instantiation). */
  getWorkingIR: () => KeyboardIR | null;
  /** Read the working copy's current HISTORY-entry state (apply context). */
  getHistoryEntryState: () => HistoryEntryState | null;
  /**
   * The checked working-copy patch sink (089 contract A4) — the same sink
   * StudioShell injects into the reducer deps: the `ir` channel's checked
   * merge runs before any overlay channel is written.
   */
  applyWorkingCopyPatch: (patch: WorkingCopyPatch, writes: readonly IRPath[]) => void;
}

/**
 * Record a gallery decision: one record for the module's single provided
 * decision, carrying an `inputs` snapshot of the module's `requires` values
 * currently in the store (the same snapshot rule as 088's completion
 * writer) and the completing step's id. Returns the record written.
 */
export function recordGalleryDecision<V>(
  mod: GalleryModule<V>,
  value: V,
  opts: { provenance: DecisionProvenance; source?: string },
  stepId: string,
  deps: GalleryHostDeps,
): Decision {
  const decisionId = mod.provides[0];
  let inputs: Decision["inputs"];
  if (mod.requires !== undefined && mod.requires.length > 0) {
    const current = deps.getDecisions();
    const snapshot: NonNullable<Decision["inputs"]> = {};
    for (const required of mod.requires) {
      const record = current[required];
      if (record !== undefined) snapshot[required] = record.value;
    }
    if (Object.keys(snapshot).length > 0) inputs = snapshot;
  }
  const record: Decision = {
    id: decisionId,
    value,
    provenance: opts.provenance,
    ...(opts.source !== undefined && { source: opts.source }),
    ...(inputs !== undefined && { inputs }),
    step: stepId,
  };
  deps.recordDecision(record);
  return record;
}

/**
 * Run a gallery module's apply for a just-recorded value: build the
 * ApplyContext from the live deps (decisions re-read AFTER recording, so
 * the apply composes from its own decision — A6), verify the patch's
 * channels against the A3 table, and hand it to the sink. A module without
 * `apply`, or an empty patch, writes nothing.
 */
export function runGalleryApply<V>(
  mod: GalleryModule<V>,
  value: V | undefined,
  deps: GalleryHostDeps,
): void {
  if (mod.apply === undefined) return;
  const writes = mod.writes ?? [];
  const ctx: ApplyContext = {
    ir: deps.getWorkingIR(),
    writes,
    decisions: deps.getDecisions(),
    currentHistoryEntryState: deps.getHistoryEntryState(),
  };
  const patch = mod.apply(value, ctx);
  if (!assertPatchChannelsAuthorized(mod.definition.id, mod, patch)) return;
  deps.applyWorkingCopyPatch(patch, writes);
}

/** The host's onChange core: record the decision, then run its apply (A6). */
export function decideGalleryValue<V>(
  mod: GalleryModule<V>,
  value: V,
  opts: { provenance: DecisionProvenance; source?: string },
  stepId: string,
  deps: GalleryHostDeps,
): Decision {
  const record = recordGalleryDecision(mod, value, opts, stepId, deps);
  runGalleryApply(mod, value, deps);
  return record;
}

export interface GalleryHostProps<V> {
  /** The gallery module to host. */
  module: GalleryModule<V>;
  /** The currently recorded decision for the module's id, if any. */
  record: Decision | undefined;
  /** The manifest step id the decision is attributed to. */
  stepId: string;
  /** Injected store deps (lib/galleryHostDeps.ts composes the live ones). */
  deps: GalleryHostDeps;
  /**
   * Provenance recorded for changes reported through the renderer
   * (default `"asked"`). A step whose value is wholly studio-derived passes
   * `"derived"`; per-item provenance, where a decision has it, rides inside
   * the value itself (data-model.md).
   */
  provenance?: DecisionProvenance;
  /** Source recorded alongside the value, when the step has one to name. */
  source?: string;
  /** Step navigation handed to the renderer via GalleryStepContext. */
  stepContext?: GalleryStepContextValue;
}

/**
 * Render a gallery module's renderer with its recorded decision. The
 * renderer's only write path is the host's onChange: record + apply.
 */
export function GalleryHost<V>(props: GalleryHostProps<V>): React.JSX.Element {
  const { module: mod, record, stepId, deps } = props;
  const Renderer = mod.renderer;
  const onChange = (value: V): void => {
    decideGalleryValue(
      mod,
      value,
      {
        provenance: props.provenance ?? "asked",
        ...(props.source !== undefined && { source: props.source }),
      },
      stepId,
      deps,
    );
  };
  const renderer = (
    <Renderer
      value={record?.value as V | undefined}
      onChange={onChange}
      decisionId={mod.provides[0]}
      provenance={record?.provenance ?? "asked"}
      {...(record?.source !== undefined && { source: record.source })}
    />
  );
  if (props.stepContext === undefined) return renderer;
  return (
    <GalleryStepContext.Provider value={props.stepContext}>{renderer}</GalleryStepContext.Provider>
  );
}
