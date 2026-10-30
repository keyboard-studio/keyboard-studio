// ReviewScreen — the /review route host.
//
// A standalone page: picker → running → report. It reads no authoring store
// and writes none — the whole screen is structurally read-only (the spec 057
// US2 precedent: isolation by absence, not by flag).
//
// Shareable report links carry ?source=&path=&sha=(&pr=); on load the screen
// resolves the target from the index (repo sources) or the params (PRs) and
// jumps straight to the run.

import { useEffect, useMemo, useState } from "react";
import type { CriteriaResult } from "../criteria/criteriaTypes.ts";
import { ACCENT, BG_CARD, BORDER, FONT, TEXT_DIM } from "../ui/theme.ts";
import { ReviewPicker } from "./ReviewPicker.tsx";
import { ReviewReport } from "./ReviewReport.tsx";
import { useReviewIndex } from "./useReviewIndex.ts";
import { useReviewJudge } from "./useReviewJudge.ts";
import { useReviewSnapshot } from "./useReviewSnapshot.ts";
import {
  REVIEW_SOURCES,
  type ReviewSourceId,
  type ReviewTarget,
} from "./reviewSources.ts";

type Phase = "pick" | "running" | "report";

export function targetFromParams(
  params: URLSearchParams,
  index: ReturnType<typeof useReviewIndex>["index"],
): ReviewTarget | null {
  const source = params.get("source") as ReviewSourceId | null;
  const path = params.get("path");
  const sha = params.get("sha");
  if (!source || !path || !sha) return null;
  if (!REVIEW_SOURCES.some((s) => s.id === source)) return null;
  if (!/^[0-9a-f]{40}$/.test(sha)) return null;
  if (path.includes("..")) return null;
  const keyboardId = path.split("/").pop() ?? path;

  if (source === "ks-repo" || source === "km-repo") {
    const key = source === "ks-repo" ? "ks" : "km";
    const repo = index?.repos[key];
    const entry = repo?.keyboards.find((k) => k.path === path);
    return {
      source,
      owner: repo?.owner ?? (source === "ks-repo" ? "keyboard-studio" : "keymanapp"),
      repo: "keyboards",
      path,
      keyboardId,
      displayName: entry?.displayName ?? keyboardId,
      sha,
    };
  }
  const prNumber = params.get("pr");
  const prNum = prNumber !== null ? Number(prNumber) : NaN;
  return {
    source,
    owner: source === "ks-prs" ? "keyboard-studio" : "keymanapp",
    repo: "keyboards",
    path,
    keyboardId,
    displayName: keyboardId,
    sha,
    ...(Number.isInteger(prNum) ? { prNumber: prNum } : {}),
  };
}

export function ReviewScreen() {
  const { index, error: indexError } = useReviewIndex();
  const [phase, setPhase] = useState<Phase>("pick");
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  const [result, setResult] = useState<CriteriaResult | null>(null);
  const [judgedAt, setJudgedAt] = useState<string>("");
  const [runNonce, setRunNonce] = useState(0);

  // Deep link: ?source=&path=&sha=(&pr=) jumps straight to the run.
  useEffect(() => {
    if (!index || target) return;
    const t = targetFromParams(new URLSearchParams(window.location.search), index);
    if (t) {
      setTarget(t);
      setPhase("running");
    }
  }, [index, target]);

  const activeTarget = phase === "running" || phase === "report" ? target : null;
  const snapshot = useReviewSnapshot(activeTarget, runNonce);
  const judge = useReviewJudge(
    activeTarget,
    snapshot.kind === "ready" ? snapshot.snapshot : null,
    runNonce,
  );

  useEffect(() => {
    if (phase === "running" && judge.kind === "ready") {
      setResult(judge.result);
      setJudgedAt(new Date().toISOString());
      setPhase("report");
    }
  }, [phase, judge]);

  const startRun = (t: ReviewTarget) => {
    setTarget(t);
    setResult(null);
    setPhase("running");
    setRunNonce((n) => n + 1);
  };

  const runningDetail = useMemo(() => {
    if (snapshot.kind === "loading") {
      const total = snapshot.total || "…";
      return `Fetching snapshot — ${snapshot.loaded}/${total} files`;
    }
    if (snapshot.kind === "error") return `Snapshot failed: ${snapshot.message}`;
    if (judge.kind === "judging") return "Running the criteria battery…";
    if (judge.kind === "timeout")
      return "The battery timed out — the snapshot may be adversarial or enormous.";
    if (judge.kind === "error") return `Battery failed: ${judge.message}`;
    return "Preparing…";
  }, [snapshot, judge]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--app-bg)",
        color: "var(--app-text)",
        fontFamily: FONT,
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div
          style={{
            background: "#042C54",
            color: "#fff",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 16,
          }}
        >
          <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, opacity: 0.75 }}>
            kbstudio.langtech.cloud/review
          </div>
          <h1 style={{ margin: "6px 0 4px", fontSize: 20 }}>Keyboard Health Check</h1>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.85, maxWidth: 640 }}>
            Run the studio&apos;s criteria battery against an existing keyboard,
            exactly as published. Nothing is modified, adapted, or uploaded — the
            keyboard is judged from a read-only snapshot.
          </p>
        </div>

        {indexError && (
          <p style={{ color: "var(--sil-red-dark, #A6121F)" }}>
            Couldn&apos;t load the keyboard index: {indexError}
          </p>
        )}

        {phase === "pick" && index && (
          <ReviewPicker index={index} onRun={startRun} />
        )}
        {phase === "pick" && !index && !indexError && (
          <p style={{ color: TEXT_DIM }}>Loading the keyboard index…</p>
        )}

        {phase === "running" && target && (
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: "16px 18px",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>
              Checking{" "}
              <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
                {target.keyboardId}
              </span>
            </h3>
            <p style={{ fontSize: 13, color: TEXT_DIM }}>{runningDetail}</p>
            {(snapshot.kind === "error" ||
              judge.kind === "error" ||
              judge.kind === "timeout") && (
              <button
                type="button"
                onClick={() => setPhase("pick")}
                style={{
                  background: "none",
                  border: "none",
                  color: ACCENT,
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: FONT,
                  padding: 0,
                }}
              >
                ← Back to the picker
              </button>
            )}
            <p style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 0 }}>
              Read-only run — the snapshot is never written to, adapted, or
              re-scaffolded.
            </p>
          </div>
        )}

        {phase === "report" && target && result && (
          <ReviewReport
            key={`${target.sha}-${runNonce}`}
            target={target}
            result={result}
            skipped={snapshot.kind === "ready" ? snapshot.snapshot.skipped : []}
            judgedAt={judgedAt}
            onRerun={() => startRun(target)}
            onBack={() => {
              setPhase("pick");
              setTarget(null);
              setResult(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
