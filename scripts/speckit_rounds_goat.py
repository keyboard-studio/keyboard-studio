"""
Drive the post-clarify Companion pipeline (plan -> tasks -> implement)
unattended, one FRESH top-level Claude Code session per round -- with GOAT
model routing.

This is the GOAT variant of scripts/speckit_rounds.py. That file is left
untouched; this driver reuses its helpers (status, round_label,
fingerprint, feature_root, run_claude) and adds two routing layers:

1. Pre-model agent router (implement rounds only): the phase heading picks
   which .claude/agents crew member owns the phase -- km-testing for e2e /
   Playwright phases, km-doc for i18n / docs phases, km-frontend for UI,
   km-keyman for .kmn work, km-programmer for engine / compiler code, and
   so on; unclassified phases default to km-programmer. The routed agent's
   name goes into the round prompt as a dispatch directive.
2. Model router: the routed agent's declared frontmatter model is the base
   (else the round-kind tier table: tasks -> haiku, plan -> sonnet,
   implement mechanical -> haiku / deep -> opus / default sonnet).

Routing is deterministic -- no extra model calls, so routing itself is
free. A round that stalls or errors escalates one tier (haiku -> sonnet ->
opus) and the work is retried; any round that makes progress resets to the
base tier. On the second consecutive stall, one read-only top-tier advisor
round gives a verdict from disk state: ADVISOR: UNBLOCK retries the work at
the top tier, anything else stops. The advisor never implements -- at most
one verdict round per stall episode. --model still overrides routing when
given.

Subscription-safe: routing only sets the already-supported `claude
--model` flag, so rounds bill against the Claude subscription, never API
keys. Effort is not routed (no verified headless flag for it): the round
prompt is the effort control -- a clear spec lets the cheap models win.

Usage:
  python3 scripts/speckit_rounds_goat.py [specs/NNN-name] [options]
  python3 scripts/speckit_rounds_goat.py --dry-run

Needs the `claude` CLI on PATH.
"""

import argparse
import functools
import json
import os
import re
import shutil
import subprocess
import sys
import time
import types
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import speckit_rounds as base  # noqa: E402  (untouched classic driver)
from speckit_git import sync_spec  # noqa: E402

# GOAT routing: deterministic per-round model tiers.
# Subscription-safe: only `claude --model` is ever set.
GOAT_TIERS = ["haiku", "sonnet", "opus"]
GOAT_DEEP_RE = re.compile(r"engine|compil|\bIR\b|deriv|migrat|\bguards?\b|kernel|parser|typecheck", re.IGNORECASE)
GOAT_LIGHT_RE = re.compile(r"i18n|catalog|\bcop(y|ies)\b|rename|\bdocs?\b|golden|\blint\b|\bcomments?\b|readme|changelog|deprecat|\bwarnings?\b|a11y", re.IGNORECASE)

# Pre-model agent router: which .claude/agents crew member owns an implement
# phase, by phase-heading keywords. Checked in order; first match wins.
# Unclassified implement phases go to km-programmer, the generalist code
# implementer. plan/tasks rounds are not agent-routed.
GOAT_AGENT_MAP = [
    ("km-testing", re.compile(r"e2e|playwright|smoke|fixture|vitest", re.IGNORECASE)),
    ("km-verification", re.compile(r"\bverif", re.IGNORECASE)),
    ("km-doc", re.compile(r"i18n|\bdocs?\b|readme|changelog|\bcop(y|ies)\b|\bcomments?\b|catalog|message|architect", re.IGNORECASE)),
    ("km-frontend", re.compile(r"frontend|\bUI\b|gallery|component|a11y|accessib|\bstudio\b", re.IGNORECASE)),
    ("km-keyman", re.compile(r"keyman|\bkmn\b|\bkmw\b|kmcmplib|touch layout|\bosk\b", re.IGNORECASE)),
    ("km-output", re.compile(r"output|scaffolder|virtualfs|\bzip\b|artifact", re.IGNORECASE)),
    ("km-validator", re.compile(r"validat", re.IGNORECASE)),
    ("km-qc", re.compile(r"\bqc\b|review|audit", re.IGNORECASE)),
    ("km-simplify", re.compile(r"simplif|refactor|dead code|dedup", re.IGNORECASE)),
    ("km-domain", re.compile(r"linguist|orthograph|\bscript\b", re.IGNORECASE)),
    ("km-programmer", re.compile(r"engine|compil|\bIR\b|deriv|migrat|\bguards?\b|kernel|parser|typecheck|codec|\blint\b", re.IGNORECASE)),
]


def goat_agent(step, phase):
    """Crew agent for this round.

    Implement phases route by phase-heading keywords (first match wins);
    anything unclassified goes to km-programmer, the generalist code
    implementer. plan/tasks rounds get None -- no agent routing there.
    """
    if step != "implement":
        return None
    if phase:
        for agent, rx in GOAT_AGENT_MAP:
            if rx.search(phase):
                return agent
    return "km-programmer"


@functools.lru_cache(maxsize=None)
def goat_agent_model(agent):
    """The model declared in the agent's frontmatter, or None."""
    path = REPO / ".claude" / "agents" / f"{agent}.md"
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    m = re.search(r"^model:\s*(\S+)\s*$", text, re.MULTILINE)
    return m.group(1) if m else None


def goat_base_tier(step, phase):
    """Tier index for a round kind, before any escalation bump."""
    if step == "plan":
        return 1
    if step == "tasks":
        return 0
    if phase:
        if GOAT_DEEP_RE.search(phase):
            return 2
        if GOAT_LIGHT_RE.search(phase):
            return 0
    return 1


def goat_model(step, phase, bump=0):
    """Model for this round: base tier for the round kind, plus escalation."""
    return GOAT_TIERS[min(goat_base_tier(step, phase) + bump, len(GOAT_TIERS) - 1)]


def goat_round_model(step, phase, bump, agent):
    """Base model for the round, then the GOAT escalation bump.

    A routed agent's declared frontmatter model is the base; otherwise the
    round-kind tier table. --model (handled by the caller) still wins over
    both.
    """
    if agent:
        declared = goat_agent_model(agent)
        base_idx = GOAT_TIERS.index(declared) if declared in GOAT_TIERS else goat_base_tier(step, phase)
    else:
        base_idx = goat_base_tier(step, phase)
    return GOAT_TIERS[min(base_idx + bump, len(GOAT_TIERS) - 1)]


ADVISOR_RE = re.compile(r"^ADVISOR:\s*(UNBLOCK|BLOCKED)\b\s*(.*)$", re.MULTILINE)


def run_advisor(claude, args, root, feature_dir, res):
    """One top-tier verdict round after two consecutive stalls.

    Read-only: the advisor diagnoses from disk and returns a verdict, it
    never implements. Returns (verdict, detail) where verdict is "UNBLOCK",
    "BLOCKED", or "?" when the round itself failed.
    """
    label = res.get("nextActionLabel") or "unknown"
    prompt = (
        "You are a technical advisor, not an implementer. Do not write code, "
        "edit files, or commit anything.\n"
        f"The speckit pipeline for feature '{feature_dir.as_posix()}' has stalled: "
        "two consecutive rounds made no recorded progress. "
        f"Current next action: {label}.\n"
        "1. Run (note PYTHONIOENCODING on Windows):\n"
        f"   PYTHONIOENCODING=utf-8 python3 .specify/extensions/companion/scripts/status-context.py --feature-dir {feature_dir.as_posix()}\n"
        "   and parse the final RESOLUTION line.\n"
        f"2. Read tasks.md and the two most recent logs in {feature_dir.as_posix()}/rounds/.\n"
        "3. Diagnose why no progress was recorded.\n"
        "End your last message with exactly one line:\n"
        "ADVISOR: UNBLOCK <one concrete next action a fresh implement round should take>\n"
        "or\n"
        "ADVISOR: BLOCKED <reason this needs the user>"
    )
    routed = types.SimpleNamespace(
        permission_mode=args.permission_mode,
        model=GOAT_TIERS[-1],
        max_budget_usd=args.max_budget_usd,
    )
    proc = base.run_claude(claude, prompt, routed, root)
    try:
        out = json.loads(proc.stdout)
    except ValueError:
        return "?", f"advisor round: claude exited {proc.returncode} without JSON"
    if out.get("is_error"):
        return "?", f"advisor round ended in error ({out.get('subtype')})"
    text = out.get("result") or ""
    m = ADVISOR_RE.findall(text)
    if not m:
        return "?", "advisor round gave no ADVISOR verdict"
    verdict, detail = m[-1]
    return verdict, detail.strip()


def run_routed(claude, prompt, args, root, model):
    """Run one round via the classic driver, with the routed model forced in."""
    routed = types.SimpleNamespace(
        permission_mode=args.permission_mode,
        model=model,
        max_budget_usd=args.max_budget_usd,
    )
    return base.run_claude(claude, prompt, routed, root)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("feature_dir", nargs="?", help="specs/NNN-name (default: .specify/feature.json)")
    ap.add_argument("--permission-mode", default="auto",
                    help="passed to claude (default: auto; acceptEdits will stall on Bash)")
    ap.add_argument("--model", help="explicit model for every round (overrides GOAT routing)")
    ap.add_argument("--max-rounds", type=int, default=25)
    ap.add_argument("--max-budget-usd", type=float, help="per-round cap, passed to claude")
    ap.add_argument("--dry-run", action="store_true", help="print the next round's prompt and stop")
    args = ap.parse_args()

    feature_dir = base.resolve_feature_dir(args.feature_dir)
    claude = shutil.which("claude")
    if not claude and not args.dry_run:
        sys.exit("[ERROR] `claude` CLI not found on PATH")

    skill = base.feature_root(feature_dir) / base.SKILL_PATH
    if not skill.is_file():
        msg = (f"{skill} is missing: rounds run in {base.feature_root(feature_dir)}, "
               "so its branch needs the speckit-round skill (merge main into it)")
        if not args.dry_run:
            sys.exit(f"[ERROR] {msg}")
        print(f"[WARN] {msg}")

    log_dir = base.feature_root(feature_dir) / feature_dir / "rounds"
    stalls, prev_fp = 0, None
    bump = 0  # GOAT escalation level: added to the round's base tier
    advisor_used = False  # one top-tier verdict round per stall episode
    total_cost = 0.0

    for n in range(1, args.max_rounds + 1):
        res = base.status(feature_dir)
        if res.get("complete"):
            print(f"[DONE] pipeline complete after {n - 1} round(s), ${total_cost:.2f}")
            return 0
        step, phase = base.round_label(res, feature_dir)
        if res.get("empty") or step in (None, "specify", "clarify"):
            print(f"[STOP] next step is '{step}': run specify/clarify interactively first")
            return 1
        agent = goat_agent(step, phase)
        model = args.model or goat_round_model(step, phase, bump, agent)
        if args.model and n == 1:
            print("[INFO] --model overrides GOAT routing")

        fp = base.fingerprint(feature_dir, res)
        if fp == prev_fp:
            stalls += 1
            if stalls >= 2:
                if not advisor_used:
                    advisor_used = True
                    print(f"[GOAT] stalled twice; consulting {GOAT_TIERS[-1]} advisor before giving up ...", flush=True)
                    averdict, adetail = run_advisor(claude, args, base.feature_root(feature_dir), feature_dir, res)
                    log_dir.mkdir(exist_ok=True)
                    (log_dir / f"round-{n:02d}-advisor.json").write_text(
                        json.dumps({"verdict": averdict, "detail": adetail}), encoding="utf-8")
                    if averdict == "UNBLOCK":
                        print(f"[GOAT] advisor verdict: UNBLOCK -- {adetail}")
                        stalls = 0
                        bump = len(GOAT_TIERS) - 1
                        continue
                    print(f"[GOAT] advisor verdict: {averdict} -- {adetail}")
                print(f"[STOP] no recorded progress in two rounds (still at {res.get('nextActionLabel')})")
                return 1
            bump = min(bump + 1, len(GOAT_TIERS) - 1)
            print(f"[GOAT] no recorded progress; next round escalates to {goat_round_model(step, phase, bump, agent)}")
        else:
            stalls = 0
            bump = 0
            advisor_used = False
        prev_fp = fp

        prompt = f"Invoke the speckit-round skill with argument: {feature_dir.as_posix()}"
        if agent:
            prompt += (f" Route this phase through the {agent} agent (.claude/agents/{agent}.md): "
                       f"dispatch the phase's work per that agent definition.")
        label = f"{step}" + (f" / {phase}" if phase else "")
        agent_tag = f"agent: {agent}, " if agent else ""
        if args.dry_run:
            print(f"[INFO] next round: {label}\n[INFO] {agent_tag}model: {model}\n[INFO] prompt: {prompt}")
            return 0

        print(f"[INFO] round {n}: {label} ({agent_tag}model: {model}) ...", flush=True)
        started = time.time()
        proc = run_routed(claude, prompt, args, base.feature_root(feature_dir), model)
        log_dir.mkdir(exist_ok=True)
        (log_dir / f"round-{n:02d}-{step}.json").write_text(proc.stdout or proc.stderr, encoding="utf-8")
        # Publish the spec folder on the feature branch after every round, whatever happened
        # (scripts/speckit_git.py). Feature code is committed by the round.
        print(f"      spec sync: {sync_spec(feature_dir, f'docs(spec): spec {feature_dir.name.split('-')[0]} round {n} -- {label}')}")

        try:
            out = json.loads(proc.stdout)
        except ValueError:
            print(f"[FAIL] round {n}: claude exited {proc.returncode} without JSON\n{proc.stderr[-2000:]}")
            return 1
        cost = out.get("total_cost_usd") or 0.0
        total_cost += cost
        text = out.get("result") or ""
        m = base.ROUND_RE.findall(text)
        verdict, detail = m[-1] if m else ("?", text.strip().splitlines()[-1:] or [""])
        if isinstance(detail, list):
            detail = detail[0] if detail else ""
        print(f"      {verdict} in {time.time() - started:.0f}s, {out.get('num_turns')} turns, "
              f"${cost:.2f} -- {detail}")

        if out.get("is_error"):
            if bump < len(GOAT_TIERS) - 1:
                bump += 1
                print(f"[GOAT] round {n} errored on {model}; escalating to {goat_round_model(step, phase, bump, agent)} and retrying")
                continue
            print(f"[FAIL] round {n} ended in error ({out.get('subtype')}); see {log_dir}")
            return 1
        if verdict == "BLOCKED":
            print(f"[STOP] blocked: {detail}")
            return 1

    print(f"[STOP] --max-rounds {args.max_rounds} reached, ${total_cost:.2f}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
