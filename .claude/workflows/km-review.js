export const meta = {
  name: "km-review",
  description:
    "Four-primary-reviewer PR review pipeline (km-keyman, km-strategy, km-qc, km-domain); km-verification acts as universal skeptic and km-synthesis as final aggregator. Returns per-reviewer findings, km-verification verdicts on each finding, and a synthesis verdict. Does NOT merge, push, or post GitHub comments — those stay in the main session.",
  whenToUse:
    "Invoke for any keyboard-studio PR that passes the km-triage Phase-2/3 gates and needs substantive crew review. Pass prNumber (required) and optionally depth ('thorough' or 'quick', default 'thorough') and crew ('ENGINE' | 'CONTENT' | 'BOTH', default 'BOTH') to select which specialist primaries run. km-triage additionally passes cached-diff args (diffPath, filesPath, baseOid, headOid), a skipReviewers list, — only on a re-triggered review — an optional lean reviewContext string (the triggering comment text plus the prior verdict summary) that is prepended to each reviewer prompt as advisory 'Prior context', and — only on a commit-driven incremental sweep — an optional priorFindings array ({file, line, title}) of still-open findings from the previous sweep so reviewers can re-list any that the new commits did not address; all of these are optional and the workflow behaves as it always did when they are omitted.",
  phases: [
    {
      title: "Review",
      detail:
        "The primary reviewers selected by the `crew` arg (km-qc for ENGINE; km-keyman + km-strategy + km-domain for CONTENT; all four for BOTH — minus any in skipReviewers) read the PR diff in parallel and each return a structured findings object. km-verification (skeptic) and km-synthesis (aggregator) are never primaries; they wrap whichever primaries ran.",
    },
    {
      title: "Verify",
      detail:
        "km-verification acts as universal skeptic: for every finding produced in the Review phase it returns an independent VERDICT_SCHEMA object (isReal, confidence, rationale, counterpoint, partiallyTrue, severityOverride, reproduceCommand, evidenceSummary), working the L1/L2/L3 cost ladder defined in .claude/agents/km-verification.md.",
    },
    {
      title: "Synthesize",
      detail:
        "km-synthesis aggregates confirmed and refuted findings into a final verdict (APPROVE / REQUEST_CHANGES / NEEDS_HUMAN_INPUT), lists autoFixable items, and flags any findings that need a human decision.",
    },
  ],
};

// This file must stay LF-only: CR characters make the Workflow tool reject
// the script at the approval-dialog check. Pinned via .gitattributes and
// healed at bot startup by scripts/triage-windows.ps1.

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

// FINDINGS_SCHEMA: what each reviewer returns.
// v2: 'file' made optional (P0-1); findingKind/existingFile/proposedTarget
// added for km-synthesis (P0-2); per-reviewer signal fields added (P1-2).
const FINDINGS_SCHEMA = {
  type: "object",
  required: ["verdict", "confidence", "findings"],
  properties: {
    verdict: {
      type: "string",
      enum: ["APPROVE", "REQUEST_CHANGES", "NEEDS_HUMAN_INPUT"],
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    // km-qc only: aggregate quality score 0-100 (P1-2)
    qualityScore: { type: "number", minimum: 0, maximum: 100 },
    findings: {
      type: "array",
      items: {
        type: "object",
        // v2: 'file' removed from required — cross-section and linguistic
        // findings may have no source file (P0-1).
        required: ["title", "severity", "rationale"],
        properties: {
          title: { type: "string" },
          severity: {
            type: "string",
            enum: ["critical", "major", "minor", "suggestion"],
          },
          file: { type: "string" },
          line: { type: "number" },
          // v2 additions (P1-2)
          lineEnd: { type: "number" },
          rationale: { type: "string" },
          suggestedFix: { type: "string" },
          autoFixable: { type: "boolean" },
          // v3 (#941 restore): when this finding needs the tech lead's judgment
          // (it is NOT mechanically fixable and you are emitting
          // NEEDS_HUMAN_INPUT for it), set `question` to the exact question you
          // want the tech lead to answer. It surfaces on the PR for the human
          // to decide. Optional — omit when the finding is mechanical.
          question: { type: "string" },
          // km-synthesis output types (P0-2)
          findingKind: {
            type: "string",
            enum: ["integration", "duplication", "extraction", "general"],
          },
          existingFile: { type: "string" },   // duplication: path already doing this
          proposedTarget: { type: "string" }, // extraction: where helper should land
          // per-reviewer signal fields (P1-2)
          specReference: { type: "string" },  // e.g. "spec.md §10 Check #8"
          checkId: { type: "string" },        // Layer-A check id when applicable
          linguisticCategory: {
            enum: [
              "script-class",
              "diacritic-behavior",
              "normalization",
              "phonetic-mapping",
              "question-prose",
              "pattern-metadata",
              "none",
            ],
          },
          gateId: { type: "string", enum: ["pattern-audit", "none"] },
          evidence: { type: "string" },       // verification run-command and outcome
          testCommand: { type: "string" },    // verification repro command
        },
      },
    },
  },
};

// VERDICT_SCHEMA: what km-verification returns for each finding it scrutinises.
// v2: partiallyTrue, severityOverride, reproduceCommand, evidenceSummary added (P1-1).
const VERDICT_SCHEMA = {
  type: "object",
  required: ["isReal", "confidence", "rationale"],
  properties: {
    isReal: { type: "boolean" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    rationale: { type: "string" },
    counterpoint: { type: "string" },
    // v2 enrichments (P1-1)
    partiallyTrue: { type: "boolean" },
    severityOverride: {
      enum: ["blocker", "major", "minor", "nit", "no_change"],
    },
    reproduceCommand: { type: "string" },
    evidenceSummary: { type: "string" },
  },
};

// SYNTHESIS_SCHEMA: what the final km-synthesis agent returns.
const SYNTHESIS_SCHEMA = {
  type: "object",
  required: ["verdict", "autoFixable", "humanDecisionNeeded", "summary"],
  properties: {
    verdict: {
      type: "string",
      enum: ["APPROVE", "REQUEST_CHANGES", "NEEDS_HUMAN_INPUT"],
    },
    autoFixable: {
      type: "array",
      items: { type: "string" },
      description: "Titles of confirmed findings that km-programmer can fix mechanically.",
    },
    humanDecisionNeeded: {
      type: "array",
      // v3 (#941 restore): each item now carries the escalating reviewer's
      // exact question for the tech lead (copied from the finding's `question`
      // field) alongside its title. `question` is OPTIONAL — omitted when the
      // reviewer emitted no question — so this stays backward-compatible.
      items: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string" },
          question: { type: "string" },
        },
      },
      description:
        "Confirmed findings that need a human judgment call. Each item is { title, question? }: question is the escalating reviewer's exact question for the tech lead when present.",
    },
    summary: { type: "string" },
  },
};

// ---------------------------------------------------------------------------
// Reviewer roster
// ---------------------------------------------------------------------------

// The four primary reviewers. km-verification and km-synthesis are
// intentionally omitted from this roster — they each have downstream roles
// (universal skeptic on every finding; final aggregator) and reviewing as
// primaries would let them self-review their own findings. Self-review was
// flagged as a structural role-conflict in the v2 smoke-test self-audit on
// PR #197. agentType values match the `name:` field in each
// .claude/agents/km-*.md file — the registry the Agent tool uses (contract
// rule 4).
//
// `crews` maps each primary onto km-triage's team-label crews. km-triage
// selects crew by team label: ENGINE = {km-verification, km-qc, km-synthesis},
// CONTENT = {km-domain, km-keyman, km-strategy}, BOTH = all six. Since
// km-verification and km-synthesis are ALWAYS the skeptic and aggregator (not
// primaries), the reconciliation is: ENGINE contributes km-qc as its only
// primary; CONTENT contributes km-keyman + km-strategy + km-domain; BOTH
// contributes all four. The skeptic + aggregator stages wrap whichever
// primaries ran. See km-triage.md "Crew shape → km-review crew arg" for the
// full mapping table.
const REVIEWERS = [
  {
    key: "keyman",
    agentType: "km-keyman",
    crews: ["CONTENT", "BOTH"],
    lens:
      "Keyman / .kmn / kmcmplib semantics. Validate Pattern schema fields, Layer-A compiler checks, kmnFragment correctness, and keyboards/<id>/ output layout.",
  },
  {
    key: "strategy",
    agentType: "km-strategy",
    crews: ["CONTENT", "BOTH"],
    lens:
      "Spec §7 strategy framework: A1-A7 axes, decision tree, S-01..S-12 catalog, §7.5 self-check. Validate Pattern.strategyId / combinesWith linkage.",
  },
  {
    key: "qc",
    agentType: "km-qc",
    crews: ["ENGINE", "BOTH"],
    lens:
      "Code quality: style consistency, complexity, error handling, test coverage, and pattern-audit section for any shaped bug fixes.",
  },
  {
    key: "domain",
    agentType: "km-domain",
    crews: ["CONTENT", "BOTH"],
    lens:
      "Linguistic correctness: script, layout, normalization, IME-design decisions against best practice for the targeted writing systems.",
  },
];

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function reviewPrompt(reviewer, prNumber, depth, ctx = {}) {
  const { diffPath, filesPath, baseOid, headOid, reviewContext, priorFindings } = ctx;
  const headRef = headOid || "<current head sha>";

  // Optional carried-forward prior findings (#941 restore). km-triage supplies
  // these only on a commit-driven INCREMENTAL sweep; each entry is a lean
  // {file, line, title}. Absent by default, so standalone callers and full
  // reviews are unaffected. On an incremental diff the crew only sees the new
  // commits, so a still-unfixed prior finding on an untouched line would be
  // silently dropped without this list.
  const priorFindingsBlock =
    Array.isArray(priorFindings) && priorFindings.length
      ? `Carried-forward prior findings (from the previous triage sweep — the incremental diff below may NOT cover the lines these sit on):
${priorFindings
          .map(
            (p) =>
              `  - ${p.title ?? "(untitled)"} [${p.file ?? "no-file"}:${p.line ?? "?"}]`
          )
          .join("\n")}

`
      : "";
  const priorFindingsInstruction = priorFindingsBlock
    ? `5. If you are reviewing an INCREMENTAL diff, the "Carried-forward prior findings" listed above are issues flagged in the previous sweep. For EACH, check whether it is still present at the current head (\`git show ${headRef}:<file>\`); if the new commits did NOT address it and it is still present, re-list it in \`findings\` with '(carried from prior review)' appended to \`rationale\` — even if it falls outside the incremental diff.
`
    : "";

  // Optional, lean re-trigger context (km-triage supplies it only on a
  // re-review — the triggering comment text plus the prior verdict summary).
  // Absent by default, so standalone callers and first-time reviews are
  // unaffected. It is advisory background, not a scope expansion.
  const priorContext = reviewContext
    ? `Prior context (advisory — from the re-trigger that scheduled this review; still review only the diff below):
${reviewContext}

`
    : "";

  // When km-triage supplies a cached diff, read it instead of re-running
  // `gh pr diff` (the crew would otherwise refetch the same data N times, and
  // the cache is already scoped to the incremental review range). When no
  // cached diff is supplied — standalone callers — fall back to gh pr diff.
  const diffSteps = diffPath
    ? `1. The PR diff has been fetched once for the whole crew and cached on disk. Read it from:
     ${diffPath}
   File list (paths only) for this review range:
     ${filesPath || "(not provided)"}
   The cached diff may be INCREMENTAL (only the new commits since the last
   triage sweep) or the full PR diff — review exactly what the cache contains
   and do NOT re-review code outside it. Do NOT re-run \`gh pr diff\` or
   \`git diff\` yourself. Generated/oversized files may have their bodies
   excluded from the cached diff (they still appear in the file list); to read
   an excluded or full-context file use \`git show ${headRef}:<path>\` and cite
   real file line numbers, never the cached diff's offsets for that file.`
    : `1. Fetch the PR diff: gh pr diff ${prNumber}`;

  return `${priorContext}You are reviewing PR #${prNumber} in the keyboard-studio monorepo as the ${reviewer.agentType} specialist.

Depth: ${depth}
${baseOid || headOid ? `Range: ${baseOid || "<base>"}..${headOid || "<head>"}\n` : ""}
Your lens for this review:
${reviewer.lens}

Steps:
${diffSteps}
2. Read any files in the diff that fall within your domain.
3. Apply your normal review process per .claude/agents/${reviewer.agentType}.md.
4. Return a structured findings object matching the schema you will be given.
${priorFindingsInstruction}
${priorFindingsBlock}VERIFICATION COST LADDER — when a claim needs a probe to settle it, respect the
L1/L2/L3 ladder defined canonically in .claude/agents/km-verification.md
("Verification cost ladder (L1 / L2 / L3)"): start at L1 (static / read-only —
read, grep, reason, and typecheck/lint scoped to the changed files; no builds,
no test execution), escalate to L2 (build only the touched package(s) + run the
specific unit tests that exercise the change) only when L1 cannot establish
correctness, and to L3 (full suite / cross-package) only with an explicit,
stated justification. Reach for the cheapest tier that answers the question.

SCOPE DISCIPLINE — only review what THIS PR changes:
- Review only files modified in the PR diff (\`gh pr diff ${prNumber}\` output).
- Do NOT follow links, references, or imports out of the diff into other files unless that other file is ALSO in the diff. If a docs change adds a link to file X and X is not in the diff, do not review X — flag it as out-of-scope context only.
- Pre-existing defects in unchanged files are NOT this PR's responsibility. Mention them only as a single advisory finding ("pre-existing: ...", severity: nit) at most, and only if directly relevant to the diff.
- Your job is to gate THIS PR, not to audit the codebase.
   - verdict: APPROVE if no actionable findings; REQUEST_CHANGES if specific issues exist; NEEDS_HUMAN_INPUT if a design call or spec ambiguity blocks you.
   - Every finding MUST include title, severity, and rationale. Include file/line when locatable. The 'file' field is OPTIONAL — omit it when a finding implicates a cross-section coherence issue, a linguistic premise, or a spec-level concern with no single source file.
   - Set autoFixable: true only when the fix is mechanical and unambiguous (rename, remove line, single codepoint swap).
   - When a finding needs the tech lead's judgment (it is NOT mechanically fixable and you are emitting NEEDS_HUMAN_INPUT for it), set that finding's \`question\` field to the exact question you want the tech lead to answer. It surfaces on the PR for the human to decide, so make it specific and self-contained.
   - Schema-forced output: use the per-agent schema fields documented in your .claude/agents/${reviewer.agentType}.md under the "Schema-forced output mode" heading when that heading is present. Set findingKind on every finding when you are km-synthesis; use specReference/checkId for Layer-A citations when you are km-keyman; set linguisticCategory when you are km-domain; emit the pattern-audit gate finding with gateId: 'pattern-audit' when you are km-qc.

Do NOT post GitHub comments, push, or merge. Return only the structured output.`;
}

function verifyPrompt(finding, prNumber, reviewerKey) {
  return `You are km-verification acting as universal skeptic for a single finding from the km-review pipeline.

PR: #${prNumber}
Finding (from ${reviewerKey}):
  Title:     ${finding.title}
  Severity:  ${finding.severity}
  File:      ${finding.file ?? "N/A"}
  Line:      ${finding.line ?? "N/A"}
  Rationale: ${finding.rationale}
  Suggested fix: ${finding.suggestedFix ?? "none"}

Steps:
1. Fetch the relevant file/line from the PR diff or repo to check whether the finding is accurate.
2. Determine whether the issue is real, a false positive, or partially correct.
3. Return a VERDICT_SCHEMA object: isReal, confidence, rationale, counterpoint (if you disagree or see nuance).
   - Schema-forced output: if the finding is real but milder than claimed, set partiallyTrue: true and use severityOverride to indicate the appropriate severity. Place the repro command in reproduceCommand and a one-line outcome in evidenceSummary.
   - Aggregate pass counts for an APPROVE verdict go in the rationale field of your verdict.

VERIFICATION COST LADDER: respect the L1/L2/L3 ladder defined canonically in
.claude/agents/km-verification.md ("Verification cost ladder (L1 / L2 / L3)").
Start at L1 (read / grep / reason, plus typecheck/lint scoped to the changed
files); escalate to L2 (build the touched package(s) + run the specific unit
tests that exercise the change) only when L1 cannot settle the claim; reach L3
(full suite / cross-package) only with a stated justification. Name the tier
you reached in evidenceSummary, and if you ran a probe put the command in
reproduceCommand.

Do NOT post GitHub comments, push, or merge.`;
}

function synthesizePrompt(prNumber, verifyEnvelopes) {
  // v2: synthesize consumes the full per-reviewer verify envelopes, including
  // reviewerVerdict carried forward from the review stage (P0-3).
  const reviewSummary = verifyEnvelopes
    .map(
      (e) =>
        `${e.reviewerKey}: verdict=${e.reviewerVerdict ?? "null"}, findings=${e.verifiedFindings?.length ?? 0}${e.error ? ` [ERROR: ${e.error}]` : ""}`
    )
    .join("\n");

  const confirmedCount = verifyEnvelopes
    .flatMap((e) => e.verifiedFindings ?? [])
    .filter((v) => v.verdict?.isReal).length;
  const refutedCount = verifyEnvelopes
    .flatMap((e) => e.verifiedFindings ?? [])
    .filter((v) => v.verdict && !v.verdict.isReal).length;

  return `You are km-synthesis performing final aggregation for PR #${prNumber}.

Reviewer summary (includes per-reviewer verdict and any crash envelopes):
${reviewSummary}

Verification summary:
  Confirmed findings: ${confirmedCount}
  Refuted (false positives): ${refutedCount}

Full per-reviewer verify envelopes (JSON):
${JSON.stringify(verifyEnvelopes, null, 2)}

Steps:
1. For each envelope, note reviewerVerdict (the reviewer's own APPROVE/REQUEST_CHANGES/NEEDS_HUMAN_INPUT). Envelopes with an 'error' field indicate a crashed reviewer slot — treat as ESCALATED_ON_ERROR and exclude from the verdict calculation.
2. Filter to confirmed findings (isReal === true) across all non-crashed envelopes.
3. Use findingKind to categorize findings: 'integration' = fit/coherence, 'duplication' = redundant code (see existingFile), 'extraction' = factor-out opportunity (see proposedTarget), 'general' = catch-all.
4. Determine the overall verdict:
   - CONTRADICTORY-DISSENT GUARD (check this FIRST): if any non-crashed reviewer returned reviewerVerdict REQUEST_CHANGES or NEEDS_HUMAN_INPUT but contributed ZERO confirmed findings (isReal === true), that is a self-contradictory reviewer output — do NOT let it resolve to APPROVE. Escalate to NEEDS_HUMAN_INPUT and, for EACH such slot, add a humanDecisionNeeded entry { title: "Contradictory verdict from <reviewerKey>", question: "Reviewer <reviewerKey> returned <verdict> with no findings; needs a human to reconcile." }.
   - APPROVE only if zero confirmed findings AND no ESCALATED_ON_ERROR slots AND the contradictory-dissent guard did not fire.
   - NEEDS_HUMAN_INPUT if any confirmed finding is not autoFixable and requires a design/spec judgment, OR if any reviewer slot was ESCALATED_ON_ERROR, OR the contradictory-dissent guard fired.
   - REQUEST_CHANGES otherwise.
5. Partition confirmed findings into autoFixable[] (an array of finding TITLE strings) and humanDecisionNeeded[] by their autoFixable flag. Each humanDecisionNeeded item is an object { title, question? }: copy the escalated finding's \`question\` field into \`question\` when the reviewer set one (the reviewer's exact question for the tech lead), and omit \`question\` when the finding has none. Contradictory-dissent guard entries from step 4 also go in humanDecisionNeeded with their generated question.
6. Write a concise summary (<=200 words) suitable for the check_run output_text.
7. Return the SYNTHESIS_SCHEMA object.

Do NOT post GitHub comments, push, or merge.`;
}

// ---------------------------------------------------------------------------
// Pipeline stages
// Note on phase() vs opts.phase inside pipeline stages (contract rule 7):
// phase() sets a *global* current phase. Inside a pipeline stage that runs
// concurrently across multiple items, calling phase() from each item would
// race. We therefore pass opts.phase explicitly on every agent() call inside
// the stage callbacks instead of calling phase() there. The final
// phase('Synthesize') call before the single synthesis agent is safe because
// nothing else races against it at that point.
// ---------------------------------------------------------------------------

async function reviewStage(_, reviewer, _index) {
  // NOTE: opts.phase used here instead of phase() to avoid race across
  // the concurrent reviewer items (contract rule 7).
  // P0-4: wrap in try/catch so a thrown reviewer returns an error envelope
  // rather than null — synthesis can see WHY a slot is empty.
  try {
    const result = await agent(reviewPrompt(reviewer, prNumber, depth, reviewCtx), {
      agentType: reviewer.agentType,
      label: `Review: ${reviewer.key}`,
      phase: "Review",
      schema: FINDINGS_SCHEMA,
    });
    // agent() returns null if user skips mid-run (contract rule 4).
    // null here means "user skipped" — distinct from a crash envelope below.
    return { key: reviewer.key, agentType: reviewer.agentType, result };
  } catch (e) {
    log(`reviewer ${reviewer.key} threw in reviewStage: ${e.message}`);
    return {
      key: reviewer.key,
      agentType: reviewer.agentType,
      result: null,
      error: e.message,
    };
  }
}

async function verifyStage(reviewerEnvelope, reviewer, _index) {
  // reviewerEnvelope is the output of reviewStage for this reviewer.
  // If the reviewer was skipped by the user (null result, no error), skip
  // verification — this is "user skipped", not a crash.
  if (!reviewerEnvelope?.result && !reviewerEnvelope?.error) {
    return null; // user-skipped lane: still null at pipeline level
  }
  // If the review stage itself crashed, propagate as an error envelope.
  if (reviewerEnvelope?.error) {
    return {
      reviewerKey: reviewer.key,
      reviewerVerdict: "ESCALATED_ON_ERROR",
      confidence: "low",
      verifiedFindings: [],
      error: reviewerEnvelope.error,
    };
  }
  if (!reviewerEnvelope?.result?.findings?.length) {
    // Reviewer returned successfully with zero findings — APPROVE envelope.
    return {
      reviewerKey: reviewer.key,
      reviewerVerdict: reviewerEnvelope.result?.verdict ?? "APPROVE",
      confidence: reviewerEnvelope.result?.confidence ?? "high",
      verifiedFindings: [],
    };
  }

  // NOTE: opts.phase used here too — these run concurrently per reviewer
  // across all selected primary reviewer lanes (contract rule 7).
  // Rule 6: parallel() thunk failure resolves to null; filter before use.
  // P0-4: wrap each thunk in try/catch so a thrown verifier returns an error
  // envelope rather than null — distinct from a user-skipped null.
  const verdicts = await parallel(
    reviewerEnvelope.result.findings.map((finding, fi) => async () => {
      try {
        const verdict = await agent(
          verifyPrompt(finding, prNumber, reviewer.key),
          {
            agentType: "km-verification",
            // NOTE: vary label by index rather than Math.random() (rule 2 bans
            // Math.random() at the script-body level; inside async thunks it
            // would also break resume determinism).
            label: `Verify: ${reviewer.key}[${fi}]`,
            phase: "Verify",
            schema: VERDICT_SCHEMA,
          }
        );
        return { finding, verdict };
      } catch (e) {
        log(`reviewer ${reviewer.key} threw in verifyStage[${fi}]: ${e.message}`);
        return {
          finding,
          verdict: null,
          error: e.message,
        };
      }
    })
  );

  const verifiedFindings = verdicts.filter(Boolean); // rule 6: drop nulls from user-skipped parallel thunks

  // v2 (P0-3): return full envelope preserving reviewerVerdict from review stage.
  return {
    reviewerKey: reviewer.key,
    reviewerVerdict: reviewerEnvelope.result?.verdict ?? "APPROVE",
    confidence: reviewerEnvelope.result?.confidence ?? "medium",
    verifiedFindings,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

// Required-arg guard — prNumber must be supplied.
// Workflow runtime may pass args as a parsed object, a JSON string, or even
// a double-JSON-encoded string. Decode repeatedly until we hit a non-string.
let parsedArgs = args;
let decodeRounds = 0;
while (typeof parsedArgs === "string" && decodeRounds < 3) {
  try {
    parsedArgs = JSON.parse(parsedArgs);
  } catch {
    break;
  }
  decodeRounds++;
}
parsedArgs = parsedArgs ?? {};
const {
  prNumber,
  depth = "thorough",
  crew: crewArg,
  skipReviewers = [],
  diffPath,
  filesPath,
  baseOid,
  headOid,
  reviewContext,
  priorFindings,
} = parsedArgs;
if (!prNumber) {
  throw new Error(
    `km-review requires args.prNumber. typeof args=${typeof args}, ` +
    `args=${JSON.stringify(args)}, decodeRounds=${decodeRounds}, ` +
    `parsedArgs=${JSON.stringify(parsedArgs)}`
  );
}

// Crew selection (additive, backward-compatible): with no crew arg the default
// is BOTH, i.e. all four primaries — exactly the pre-crew behavior, so existing
// standalone callers are unaffected. An unrecognized crew value degrades to
// BOTH with a log note rather than erroring. skipReviewers (agentType strings)
// lets km-triage's per-specialist pre-filters (C/B/E) drop individual primaries
// from within the selected crew; empty by default.
const CREW = String(crewArg ?? "BOTH").toUpperCase();
if (!["ENGINE", "CONTENT", "BOTH"].includes(CREW)) {
  log(`km-review: unrecognized crew '${crewArg}', defaulting to BOTH`);
}
const crewKey = ["ENGINE", "CONTENT", "BOTH"].includes(CREW) ? CREW : "BOTH";
const skip = new Set(skipReviewers);
const activeReviewers = REVIEWERS.filter(
  (r) => r.crews.includes(crewKey) && !skip.has(r.agentType)
);

// Shared per-review context handed to every reviewer prompt (cached diff +
// OIDs). Undefined fields simply omit the corresponding prompt sections, so
// standalone callers that pass none fall back to `gh pr diff`.
const reviewCtx = { diffPath, filesPath, baseOid, headOid, reviewContext, priorFindings };

// Run the review + verify pipeline across the selected primary reviewers.
// pipeline(items, stage1, stage2) — no barrier between stages per item;
// stage2 signature is (prevResult, originalItem, index) (contract rule 5).
const perReviewerResults = await pipeline(activeReviewers, reviewStage, verifyStage);

// v2 (P0-3/P0-4): collect full verify envelopes, distinguishing:
//   - null  → user-skipped lane (pipeline level null from verifyStage)
//   - { reviewerKey, reviewerVerdict, verifiedFindings }  → normal envelope
//   - { reviewerKey, reviewerVerdict: 'ESCALATED_ON_ERROR', error }  → crash
const verifyEnvelopes = perReviewerResults.filter(Boolean);

// Flatten all verified findings for the legacy confirmed/refuted split on return.
const allVerifiedFindings = verifyEnvelopes.flatMap((e) => e.verifiedFindings ?? []);

// Final synthesis — single agent, no concurrency race, phase() is safe here.
phase("Synthesize");
const synthesis = await agent(
  synthesizePrompt(prNumber, verifyEnvelopes),
  {
    agentType: "km-synthesis",
    label: "Synthesize",
    phase: "Synthesize",
    schema: SYNTHESIS_SCHEMA,
  }
);

// Return value consumed by the main session for auto-fix decision,
// check_run publish, and @-mention. Those steps stay in the main session.
return {
  prNumber,
  verifyEnvelopes,
  confirmed: allVerifiedFindings.filter((v) => v.verdict?.isReal),
  refuted: allVerifiedFindings.filter((v) => v.verdict && !v.verdict.isReal),
  synthesis,
};
