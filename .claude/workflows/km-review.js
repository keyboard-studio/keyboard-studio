// ---------------------------------------------------------------------------
// Crew-shape decision (2026-07-02, converging km-triage Phases 4-5 onto this
// workflow): the skeptic+aggregator shape defined here is CANONICAL, and the
// old flat km-triage crews (ENGINE {km-verification, km-qc, km-synthesis} /
// CONTENT {km-domain, km-keyman, km-strategy}) are retired. Rationale:
//   - km-verification reviewing as a primary would let it self-review its own
//     findings when it later acts as universal skeptic; same for km-synthesis
//     as aggregator (structural role-conflict flagged in the v2 smoke-test
//     self-audit on PR #197). The old ENGINE crew had exactly that conflict.
//   - The schemas below are the ONE verdict/fixability vocabulary for both
//     triage and interactive review: APPROVE / REQUEST_CHANGES /
//     NEEDS_HUMAN_INPUT, and autoFixable: boolean (the old fenced-verdict
//     `fixability: auto|needs_human_input` contract is retired with it).
// All four primaries are eligible on every PR regardless of crew; the caller
// passes `crew` as a lens-emphasis hint and `skipReviewers` (from km-triage's
// pre-filters B/C/E) to drop individual primaries by name.
// ---------------------------------------------------------------------------

export const meta = {
  name: "km-review",
  description:
    "Four-primary-reviewer PR review pipeline (km-keyman, km-strategy, km-qc, km-domain); km-verification acts as universal skeptic and km-synthesis as final aggregator. Returns per-reviewer findings, km-verification verdicts on each finding, and a synthesis verdict. Does NOT merge, push, or post GitHub comments — those stay in the main session.",
  whenToUse:
    "The review core for /km-triage Phases 4-5 and for any keyboard-studio PR that needs substantive crew review. Pass prNumber (required) and depth ('thorough' or 'quick', default 'thorough'); triage additionally passes crew, diffPath/filesPath, reviewRange, skipReviewers, previousReviewContext, and leadReplyContext.",
  phases: [
    {
      title: "Review",
      detail:
        "Six specialists (km-keyman, km-verification, km-synthesis, km-strategy, km-qc, km-domain) read the PR diff in parallel and each return a structured findings object.",
    },
    {
      title: "Verify",
      detail:
        "km-verification acts as universal skeptic: for every finding produced in the Review phase it returns an independent VERDICT_SCHEMA object (isReal, confidence, rationale, counterpoint, partiallyTrue, severityOverride, reproduceCommand, evidenceSummary).",
    },
    {
      title: "Synthesize",
      detail:
        "km-synthesis aggregates confirmed and refuted findings into a final verdict (APPROVE / REQUEST_CHANGES / NEEDS_HUMAN_INPUT), lists autoFixable items, and flags any findings that need a human decision.",
    },
  ],
};

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
      items: { type: "string" },
      description: "Titles of confirmed findings that need a human judgment call.",
    },
    summary: { type: "string" },
  },
};

// ---------------------------------------------------------------------------
// Reviewer roster
// ---------------------------------------------------------------------------

// Four primary reviewers. km-verification and km-synthesis are intentionally
// omitted from this roster — they each have downstream roles (universal
// skeptic on every finding; final aggregator) and reviewing as primaries
// would let them self-review their own findings. Self-review was flagged as
// a structural role-conflict in the v2 smoke-test self-audit on PR #197.
// agentType values match the `name:` field in each .claude/agents/km-*.md
// file — the registry the Agent tool uses (contract rule 4).
const REVIEWERS = [
  {
    key: "keyman",
    agentType: "km-keyman",
    lens:
      "Keyman / .kmn / kmcmplib semantics. Validate Pattern schema fields, Layer-A compiler checks, kmnFragment correctness, and keyboards/<id>/ output layout.",
  },
  {
    key: "strategy",
    agentType: "km-strategy",
    lens:
      "Spec §7 strategy framework: A1-A7 axes, decision tree, S-01..S-12 catalog, §7.5 self-check. Validate Pattern.strategyId / combinesWith linkage.",
  },
  {
    key: "qc",
    agentType: "km-qc",
    lens:
      "Code quality: style consistency, complexity, error handling, test coverage, and pattern-audit section for any shaped bug fixes.",
  },
  {
    key: "domain",
    agentType: "km-domain",
    lens:
      "Linguistic correctness: script, layout, normalization, IME-design decisions against best practice for the targeted writing systems.",
  },
];

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function diffInstructions(prNumber) {
  // Triage passes a diff cached to disk once for the whole crew (km-triage
  // Pre-filter A); standalone invocations fall back to gh pr diff.
  if (!diffPath) {
    return `1. Fetch the PR diff: gh pr diff ${prNumber}`;
  }
  const lines = [
    `1. Read the CACHED diff from disk: ${diffPath}`,
    `   File list for this review range: ${filesPath ?? "(not provided)"}`,
    `   Do NOT re-run \`gh pr diff\` or \`git diff\` yourself — the cache holds the same data.`,
  ];
  if (reviewRange === "incremental" && lastAuditedSha) {
    lines.push(
      `   This is an INCREMENTAL review: the cached diff covers only ${lastAuditedSha}..${headSha ?? "HEAD"}.`,
      `   Do NOT re-review code outside this range — earlier sweeps already reviewed it.`
    );
  }
  if (excludedFiles.length > 0) {
    lines.push(
      `   IMPORTANT — excluded diff bodies: the cached diff omits ${excludedFiles.join(", ")} (generated/oversized/binary).`,
      `   Those files still appear in the file list; to review one, fetch it directly with \`git show ${headSha ?? "<head-sha>"}:<path>\` and cite real file line numbers. Never cite line numbers for an excluded file from the diff.`
    );
  }
  if (headSha) {
    lines.push(
      `   If you need the current state of a whole file (the diff doesn't snapshot contents), use \`git show ${headSha}:<path>\`.`
    );
  }
  return lines.join("\n");
}

function contextBlocks(reviewer) {
  const blocks = [];
  const prev = previousReviewContext[reviewer.key] ?? previousReviewContext[reviewer.agentType];
  if (prev) {
    blocks.push(`=== Previous review context ===
${prev}
=== End previous review context ===

Your job is narrower on a re-review: assess the incremental diff in light of what you already flagged. A prior finding the new commits resolve is NOT re-listed; a prior finding still present at the current head IS re-listed with "(carried from prior review)" in its rationale; new issues are flagged normally. If everything is resolved and nothing new appears, verdict APPROVE.`);
  }
  if (leadReplyContext) {
    blocks.push(`=== Human replies since the last triage action ===
${leadReplyContext}
=== End human replies ===

Treat these replies as new context — they often answer questions the triage previously escalated. A reply that picks an option with a concrete mechanical fix -> finding with autoFixable: true and an exact suggestedFix. A freeform answer that still needs judgment -> keep the finding, autoFixable: false. A reply confirming the existing state is acceptable -> mark resolved (do not re-list). Conversational replies with no operational content are ignored for verdict purposes.`);
  }
  return blocks.length ? blocks.join("\n\n") + "\n\n" : "";
}

function reviewPrompt(reviewer, prNumber, depth) {
  return `You are reviewing PR #${prNumber} in the keyboard-studio monorepo as the ${reviewer.agentType} specialist.

Depth: ${depth}
Crew emphasis: ${crew} (route your attention accordingly; your lens still applies to the whole diff)

Your lens for this review:
${reviewer.lens}

${contextBlocks(reviewer)}Steps:
${diffInstructions(prNumber)}
2. Read any files in the diff that fall within your domain.
3. Apply your normal review process per .claude/agents/${reviewer.agentType}.md.
4. Return a structured findings object matching the schema you will be given.

SCOPE DISCIPLINE — only review what THIS PR changes:
- Review only files modified in the PR diff.
- Do NOT follow links, references, or imports out of the diff into other files unless that other file is ALSO in the diff. If a docs change adds a link to file X and X is not in the diff, do not review X — flag it as out-of-scope context only.
- Pre-existing defects in unchanged files are NOT this PR's responsibility. Mention them only as a single advisory finding ("pre-existing: ...", severity: nit) at most, and only if directly relevant to the diff.
- Your job is to gate THIS PR, not to audit the codebase.
   - verdict: APPROVE if no actionable findings; REQUEST_CHANGES if specific issues exist; NEEDS_HUMAN_INPUT if a design call or spec ambiguity blocks you.
   - Every finding MUST include title, severity, and rationale. Include file/line when locatable. The 'file' field is OPTIONAL — omit it when a finding implicates a cross-section coherence issue, a linguistic premise, or a spec-level concern with no single source file.
   - Set autoFixable: true only when the fix is mechanical and unambiguous (rename, remove line, single codepoint swap).
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
   Apply the verification cost ladder from .claude/agents/km-verification.md: start at L1
   (grep/Read the cited lines, targeted single-test probes) and escalate only if L1 cannot
   answer; state in your rationale which tier you used and, if above L1, why.
2. Determine whether the issue is real, a false positive, or partially correct.
3. Return a VERDICT_SCHEMA object: isReal, confidence, rationale, counterpoint (if you disagree or see nuance).
   - Schema-forced output: if the finding is real but milder than claimed, set partiallyTrue: true and use severityOverride to indicate the appropriate severity. Place the repro command in reproduceCommand and a one-line outcome in evidenceSummary.
   - Aggregate pass counts for an APPROVE verdict go in the rationale field of your verdict.

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
   - APPROVE if zero confirmed findings and no ESCALATED_ON_ERROR slots.
   - NEEDS_HUMAN_INPUT if any confirmed finding is not autoFixable and requires a design/spec judgment, OR if any reviewer slot was ESCALATED_ON_ERROR.
   - REQUEST_CHANGES otherwise.
5. Partition confirmed findings into autoFixable[] and humanDecisionNeeded[] by their autoFixable flag.
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
  // the four concurrent reviewer items (contract rule 7).
  // P0-4: wrap in try/catch so a thrown reviewer returns an error envelope
  // rather than null — synthesis can see WHY a slot is empty.
  try {
    const result = await agent(reviewPrompt(reviewer, prNumber, depth), {
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
  // across all four primary reviewer lanes (contract rule 7).
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
  // Triage-integration args (all optional; standalone runs omit them):
  crew = "both",                 // 'engine' | 'content' | 'both' — lens-emphasis hint only
  diffPath = null,               // cached diff from km-triage Pre-filter A (cache-diff.js)
  filesPath = null,              // cached file list (full, exclusions NOT applied)
  headSha = null,                // current head SHA, for `git show <sha>:<path>`
  reviewRange = "full",          // 'full' | 'incremental'
  lastAuditedSha = null,         // start of the incremental range
  excludedFiles = [],            // paths whose diff bodies were excluded from the cache
  skipReviewers = [],            // reviewer keys or agentType names dropped by pre-filters B/C/E
  previousReviewContext = {},    // { [reviewerKeyOrAgentType]: string } prior-verdict summaries
  leadReplyContext = null,       // human comments since the last triage mention/escalation
} = parsedArgs;
if (!prNumber) {
  throw new Error(
    `km-review requires args.prNumber. typeof args=${typeof args}, ` +
    `args=${JSON.stringify(args)}, decodeRounds=${decodeRounds}, ` +
    `parsedArgs=${JSON.stringify(parsedArgs)}`
  );
}

// Apply the caller's skip list (km-triage pre-filters B/C/E). Accept both
// the short key ('qc') and the agentType ('km-qc'). km-verification and
// km-synthesis are pipeline roles, not primaries — a skip request naming
// them is ignored (log it so the audit shows the request was seen).
const skipSet = new Set(skipReviewers);
const activeReviewers = REVIEWERS.filter(
  (r) => !skipSet.has(r.key) && !skipSet.has(r.agentType)
);
const skippedReviewers = REVIEWERS.filter(
  (r) => skipSet.has(r.key) || skipSet.has(r.agentType)
).map((r) => r.agentType);
const unskippableRequested = skipReviewers.filter(
  (s) => ["km-verification", "km-synthesis", "verification", "synthesis"].includes(s)
);
if (unskippableRequested.length > 0) {
  log(
    `skipReviewers named pipeline roles that cannot be skipped: ${unskippableRequested.join(", ")} (they are skeptic/aggregator, not primaries)`
  );
}
if (skippedReviewers.length > 0) {
  log(`primaries skipped by caller pre-filters: ${skippedReviewers.join(", ")}`);
}
if (activeReviewers.length === 0) {
  throw new Error(
    "km-review: skipReviewers removed every primary reviewer — the caller's empty-crew guard should have fired before invoking the workflow"
  );
}

// Run the review + verify pipeline across the active primary reviewers.
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
// km-triage's Phase-5 action mapping consumes synthesis.verdict, confirmed
// (with per-finding autoFixable/suggestedFix), and verifyEnvelopes (one
// audit-log verdicts[] entry per envelope).
return {
  prNumber,
  crew,
  skippedReviewers,
  verifyEnvelopes,
  confirmed: allVerifiedFindings.filter((v) => v.verdict?.isReal),
  refuted: allVerifiedFindings.filter((v) => v.verdict && !v.verdict.isReal),
  synthesis,
};
