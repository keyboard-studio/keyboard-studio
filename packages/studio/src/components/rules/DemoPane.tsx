// DemoPane — Track A universal before/after demo (spec 082, FR-001…FR-004).
//
// "Type here, watch what happens": each keystroke is simulated against the
// working copy's ALREADY-COMPILED artifact and rendered as a trace row —
// the typed key, the stored code points, the rendered glyphs, the rule (or
// behaviour) that fired in author language, and the host-consequence label
// for blocking demonstrations.
//
// Article IV compliance (FR-001 / SC-006): this pane READS the single
// 300 ms compile-cycle artifact published by SurveyView into
// rulesDemoArtifactStore. It creates no compile, no debounce, and no
// useKeyboardArtifact call site — typing re-runs only the cheap synchronous
// `simulate()` against the published bytes.
//
// FR-004: a compile error shows the blocking diagnostic and NEVER stale
// output — while the artifact is not "ready" the trace table is hidden.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trans } from "@lingui/react/macro";
import type {
  CompileResult,
  IRRule,
  KeyboardIR,
  SimulationResult,
} from "@keyboard-studio/contracts";
import { useRulesDemoArtifactStore, type RulesDemoArtifact } from "../../stores/rulesDemoArtifactStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { answerString } from "../../survey/answerString.ts";
import { getPatternLibraryService } from "../../lib/browserPatternLibrary.ts";
import {
  loadDemoSimulate,
  textToDemoKeys,
  type DemoSimulate,
} from "./demoSimulation.ts";
import {
  buildDemoTraceRows,
  demoTraceHasFiredRules,
  extractFiredRule,
  type DemoTraceRow,
} from "./demoTrace.ts";
import { familyOfRule, groupRules } from "./ruleFamilies.ts";
import { buildFiredRuleResolver } from "./firedRuleMapping.ts";
import { humanizeId } from "./ruleNaming.ts";
import {
  ALLOW_BLOCK_QUESTION,
  ALLOW_RISK_COPY,
  BLOCK_RISK_COPY,
  DEFAULT_HOST_LAYOUTS,
  HOST_LAYOUTS_DEMO_NOTE,
  LIKELY_HOSTS_NOTE,
  hostLayoutById,
  resolveLikelyHosts,
  type HostLayoutId,
  type LayoutFamilyAnswer,
} from "./hostLayouts.ts";

export interface DemoPaneProps {
  /** Injected simulate implementation (tests). Defaults to the lazy browser-safe engine. */
  simulateImpl?: DemoSimulate;
  /** Injected compiled bytes (tests) — skips the blob-URL fetch. */
  jsBytes?: Uint8Array | null;
  /** Injected artifact (tests) — skips the rulesDemoArtifactStore. */
  artifact?: RulesDemoArtifact;
  /** Injected IR (tests) — skips the working-copy store. */
  ir?: KeyboardIR | null;
}

/** Cache of compiled-byte fetches, keyed by blob URL. */
const jsBytesCache = new Map<string, Uint8Array>();
/** Cache of resolved pattern titles, keyed by pattern id. */
const patternTitleCache = new Map<string, string>();

export function DemoPane(props: DemoPaneProps = {}) {
  const storeArtifact = useRulesDemoArtifactStore((s) => s.artifact);
  const artifact = props.artifact !== undefined ? props.artifact : storeArtifact;
  const storeIr = useWorkingCopyStore((s) => s.ir);
  const ir = props.ir !== undefined ? props.ir : storeIr;
  const storeBcp47 = useWorkingCopyStore((s) => s.identity?.bcp47);
  const bcp47Tags = useMemo(
    () => (storeBcp47 === undefined || storeBcp47 === null || storeBcp47 === "" ? [] : [storeBcp47]),
    [storeBcp47],
  );
  // 1802 A3.1: the existing `layout_family` answer is the PRIMARY likely-host
  // input; BCP47 inference is the fallback. The answer lives in the persisted
  // identity-phase result (populated when the question is surfaced in the
  // main flow). Unknown values are ignored — never a crash, never a guess.
  const identityPhaseResult = useSurveySessionStore((s) => s.identityPhaseResult);
  const layoutFamily = useMemo<LayoutFamilyAnswer | null>(() => {
    if (identityPhaseResult === null) return null;
    const raw = answerString(identityPhaseResult, "layout_family");
    return raw === "qwerty" || raw === "qwertz" || raw === "azerty" || raw === "non-roman"
      ? raw
      : null;
  }, [identityPhaseResult]);

  const [text, setText] = useState("");
  // The demo set is per-keyboard likely hosts (1802 A3/A3.1): layout_family
  // first, BCP47 region inference second, the five reference hosts when
  // neither signals. Derived silently — no author question for what the data
  // can answer. "blocked" is appended as a demonstration mode. Manual
  // switching stays available via the selector.
  const likelyHosts = useMemo(
    () => resolveLikelyHosts({ layoutFamily, bcp47: bcp47Tags }),
    [layoutFamily, bcp47Tags],
  );
  const orderedHosts = useMemo<HostLayoutId[]>(
    () => [...likelyHosts, "blocked"],
    [likelyHosts],
  );
  const [hostLayout, setHostLayout] = useState<HostLayoutId>(() => likelyHosts[0] ?? DEFAULT_HOST_LAYOUTS[0]!);
  // Re-seed the selection when the likely set changes (e.g. identity set
  // after the pane mounted), unless the author already picked by hand.
  const [handPicked, setHandPicked] = useState(false);
  useEffect(() => {
    if (!handPicked) setHostLayout(likelyHosts[0] ?? DEFAULT_HOST_LAYOUTS[0]!);
  }, [likelyHosts, handPicked]);

  // --- Simulator engine (lazy, once per session; no debounce, no compile) ---
  const [simulate, setSimulate] = useState<DemoSimulate | null>(props.simulateImpl ?? null);
  const [engineError, setEngineError] = useState<string | null>(null);
  useEffect(() => {
    if (props.simulateImpl !== undefined) {
      setSimulate(props.simulateImpl);
      setEngineError(null);
      return;
    }
    let cancelled = false;
    loadDemoSimulate()
      .then((sim) => {
        if (!cancelled) {
          setSimulate(() => sim);
          setEngineError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setEngineError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [props.simulateImpl]);

  // --- Compiled bytes (fetched once per blob URL from the published artifact) ---
  const [fetchedBytes, setFetchedBytes] = useState<Uint8Array | null>(null);
  const [bytesError, setBytesError] = useState<string | null>(null);
  const jsBytes = props.jsBytes !== undefined ? props.jsBytes : fetchedBytes;
  const jsBlobUrl = artifact.jsBlobUrl;
  const artifactStatus = artifact.status;
  useEffect(() => {
    if (props.jsBytes !== undefined) return;
    if (artifactStatus !== "ready" || jsBlobUrl === null) {
      setFetchedBytes(null);
      setBytesError(null);
      return;
    }
    const cached = jsBytesCache.get(jsBlobUrl);
    if (cached !== undefined) {
      setFetchedBytes(cached);
      setBytesError(null);
      return;
    }
    let cancelled = false;
    fetch(jsBlobUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`fetching the compiled keyboard failed: ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        jsBytesCache.set(jsBlobUrl, bytes);
        if (!cancelled) {
          setFetchedBytes(bytes);
          setBytesError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFetchedBytes(null);
          setBytesError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.jsBytes, artifactStatus, jsBlobUrl]);

  // --- Simulation: synchronous per keystroke, NO debounce (SC-006) ---
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  useEffect(() => {
    if (simulate === null || jsBytes === null || text === "") {
      setResult(null);
      setSimError(null);
      return;
    }
    try {
      const keys = textToDemoKeys(text);
      const compiled: CompileResult = {
        success: true,
        artifacts: [
          {
            filename: "keyboard.js",
            url: jsBlobUrl ?? "",
            sizeBytes: jsBytes.length,
            data: jsBytes,
          },
        ],
        diagnostics: [],
        compileMs: 0,
        isWarmCompile: true,
      };
      setResult(simulate(compiled, keys.map((k) => k.input)));
      setSimError(null);
    } catch (err: unknown) {
      setResult(null);
      setSimError(err instanceof Error ? err.message : String(err));
    }
  }, [simulate, jsBytes, text, jsBlobUrl]);

  // --- Fired-rule → IR resolver (compiled ordinal → source line; see
  // firedRuleMapping.ts). The compiled JS source is decoded lazily from the
  // published bytes — no new fetch, no new compile. Without the source (or
  // the IR) every trace is unresolvable and rows use the trace-context
  // fallback; never a misattributed owner, never a bare index.
  const jsSource = useMemo(
    () => (jsBytes !== null ? new TextDecoder().decode(jsBytes) : null),
    [jsBytes],
  );
  const resolveRule = useMemo(() => buildFiredRuleResolver(ir, jsSource), [ir, jsSource]);

  // --- Pattern titles for ownedByPattern rules (cached; humanized id while loading) ---
  const [titleVersion, setTitleVersion] = useState(0);
  const firedPatternIds = useMemo(() => {
    if (result === null) return [];
    const ids = new Set<string>();
    for (const step of result.trace) {
      const fired = extractFiredRule(step);
      if (fired === undefined) continue;
      const rule = resolveRule(fired);
      if (rule?.ownedByPattern) ids.add(rule.ownedByPattern);
    }
    return [...ids].filter((id) => !patternTitleCache.has(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, resolveRule, titleVersion]);
  useEffect(() => {
    if (firedPatternIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      const service = getPatternLibraryService();
      await Promise.all(
        firedPatternIds.map(async (id) => {
          try {
            const record = await service.getById(id);
            patternTitleCache.set(id, record?.title ?? humanizeId(id));
          } catch {
            patternTitleCache.set(id, humanizeId(id));
          }
        }),
      );
      if (!cancelled) setTitleVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [firedPatternIds]);
  const patternTitle = useCallback(
    (id: string) => patternTitleCache.get(id),
    // Re-created when new titles land so row captions refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [titleVersion],
  );

  // --- Rows ---
  const families = useMemo(
    () => groupRules(ir?.groups.flatMap((g) => g.rules) ?? []),
    [ir],
  );
  const familyNameFor = useCallback(
    (rule: IRRule) => familyOfRule(families, rule.nodeId)?.name,
    [families],
  );
  const rows: DemoTraceRow[] = useMemo(() => {
    if (result === null) return [];
    return buildDemoTraceRows({
      keys: textToDemoKeys(text),
      result,
      resolveRule,
      hostLayout,
      patternTitle,
      familyNameFor,
    });
  }, [result, text, resolveRule, hostLayout, patternTitle, familyNameFor]);
  const enrichmentPresent = result !== null && demoTraceHasFiredRules(result);

  const showTrace = artifactStatus === "ready" && rows.length > 0;

  return (
    <section aria-label="Rule demo" data-testid="rules-demo-pane">
      <h3>
        <Trans id="rules.demo.heading">Try the rules</Trans>
      </h3>
      <p>
        <Trans id="rules.demo.lede">
          Type below and watch what each keystroke does — the stored code points, the rendered
          result, and the rule that fired.
        </Trans>
      </p>

      {artifactStatus === "error" && (
        <div role="alert" data-testid="rules-demo-error">
          <p>
            <Trans id="rules.demo.compileError">
              The demo can&apos;t run — the working copy has a compile error. Fix the error and the
              demo will pick up the next successful compile.
            </Trans>
          </p>
          <p>
            <strong>{artifact.errorStep ?? "compile"}</strong>: {artifact.errorMessage}
          </p>
          {artifact.diagnostics.length > 0 && (
            <ul>
              {artifact.diagnostics.map((d, i) => (
                <li key={i}>
                  <code>{d.code}</code> — {d.message}
                  {d.location !== undefined
                    ? ` (${d.location.file}:${d.location.line})`
                    : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {artifactStatus !== "error" && (
        <>
          <p>
            <label>
              <Trans id="rules.demo.inputLabel">Type here, watch what happens</Trans>{" "}
              <input
                type="text"
                data-testid="rules-demo-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="abc…"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </p>

          {artifactStatus === "loading" && (
            <p data-testid="rules-demo-status">
              <Trans id="rules.demo.compiling">Compiling the working copy…</Trans>
            </p>
          )}
          {artifactStatus === "idle" && (
            <p data-testid="rules-demo-status">
              <Trans id="rules.demo.idle">The demo starts once the working copy compiles.</Trans>
            </p>
          )}
          {engineError !== null && (
            <p role="alert" data-testid="rules-demo-status">
              <Trans id="rules.demo.engineFailed">
                The simulator failed to load: {engineError}
              </Trans>
            </p>
          )}
          {bytesError !== null && (
            <p role="alert" data-testid="rules-demo-status">
              <Trans id="rules.demo.bytesFailed">
                The compiled keyboard couldn&apos;t be read: {bytesError}
              </Trans>
            </p>
          )}
          {simError !== null && (
            <p role="alert" data-testid="rules-demo-status">
              <Trans id="rules.demo.simFailed">Simulation failed: {simError}</Trans>
            </p>
          )}

          {artifactStatus === "ready" && artifact.diagnostics.length > 0 && (
            <p data-testid="rules-demo-warnings">
              <Trans id="rules.demo.warnings">
                Compiled with {artifact.diagnostics.length} warning(s):
              </Trans>{" "}
              {artifact.diagnostics.map((d) => d.code).join(", ")}
            </p>
          )}

          {showTrace && (
            <>
              {!enrichmentPresent && (
                <p data-testid="rules-demo-no-enrichment">
                  <Trans id="rules.demo.noEnrichment">
                    The simulator didn&apos;t name fired rules for this run, so rows show
                    before/after output instead. (Pending: the SimulationStep.firedRule
                    enrichment.)
                  </Trans>
                </p>
              )}
              <table data-testid="rules-demo-trace">
                <thead>
                  <tr>
                    <th>
                      <Trans id="rules.demo.colKey">Key</Trans>
                    </th>
                    <th>
                      <Trans id="rules.demo.colStored">Stored</Trans>
                    </th>
                    <th>
                      <Trans id="rules.demo.colRendered">Rendered</Trans>
                    </th>
                    <th>
                      <Trans id="rules.demo.colRule">Rule fired</Trans>
                    </th>
                    <th>
                      <Trans id="rules.demo.colHost">Host consequence</Trans>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.index} data-testid={`rules-demo-row-${row.index}`}>
                      <td>
                        <code>{row.typedChar === " " ? "Space" : row.typedChar}</code>{" "}
                        <small>({row.vkeyLabel})</small>
                        {row.deadkeyArmed && (
                          <div>
                            <small>
                              <Trans id="rules.demo.deadkeyArmed">armed a deadkey</Trans>
                            </small>
                          </div>
                        )}
                      </td>
                      <td>
                        <code>{row.codePoints}</code>
                      </td>
                      <td>{row.rendered === "" ? <em>—</em> : row.rendered}</td>
                      <td>{row.firedCaption ?? row.noRuleText}</td>
                      <td>{row.hostConsequence ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <fieldset>
            <legend>
              <Trans id="rules.demo.hostLegend">What would the host computer have typed?</Trans>
            </legend>
            <p>
              <small>{ALLOW_BLOCK_QUESTION}</small>
            </p>
            <p>
              <label>
                <Trans id="rules.demo.hostLabel">Host layout</Trans>{" "}
                <select
                  data-testid="rules-demo-host-layout"
                  value={hostLayout}
                  onChange={(e) => {
                    setHostLayout(e.target.value as HostLayoutId);
                    setHandPicked(true);
                  }}
                >
                  {orderedHosts.map((id) => {
                    const layout = hostLayoutById(id);
                    return (
                      <option key={layout.id} value={layout.id} title={layout.blurb}>
                        {layout.label}
                      </option>
                    );
                  })}
                </select>
              </label>
            </p>
            <p>
              <small>
                <em>{LIKELY_HOSTS_NOTE}</em>
              </small>
            </p>
            <ul>
              <li>
                <small>{ALLOW_RISK_COPY}</small>
              </li>
              <li>
                <small>{BLOCK_RISK_COPY}</small>
              </li>
            </ul>
            <p>
              <small>
                <em>{HOST_LAYOUTS_DEMO_NOTE}</em>
              </small>
            </p>
          </fieldset>
        </>
      )}
    </section>
  );
}
