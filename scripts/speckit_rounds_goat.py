"""
Drive the post-clarify Companion pipeline (plan -> tasks -> implement)
unattended, one FRESH top-level Claude Code session per round -- with GOAT
model routing.

This is the GOAT variant of scripts/speckit_rounds.py. That file is left
untouched; this driver reuses its helpers (status, round_label,
fingerprint, feature_root, run_claude) and adds only the routing layer:

  tasks step      -> haiku   (mechanical decomposition of an approved plan)
  plan step       -> sonnet  (high-leverage reasoning; escalates if stuck)
  implement phase -> haiku for mechanical phases (i18n, copy, rename, docs,
                     golden, lint), opus for deep phases (engine, compiler,
                     IR, derivation, migration), sonnet otherwise.

Routing is deterministic -- no extra model calls, so routing itself is
free. A round that stalls or errors escalates one tier (haiku -> sonnet ->
opus) and the work is retried; any round that makes progress resets to the
base tier. --model still overrides routing when given.

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
        model = args.model or goat_model(step, phase, bump)
        if args.model and n == 1:
            print("[INFO] --model overrides GOAT routing")

        fp = base.fingerprint(feature_dir, res)
        if fp == prev_fp:
            stalls += 1
            if stalls >= 2:
                print(f"[STOP] no recorded progress in two rounds (still at {res.get('nextActionLabel')})")
                return 1
            bump = min(bump + 1, len(GOAT_TIERS) - 1)
            print(f"[GOAT] no recorded progress; next round escalates to {goat_model(step, phase, bump)}")
        else:
            stalls = 0
            bump = 0
        prev_fp = fp

        prompt = f"Invoke the speckit-round skill with argument: {feature_dir.as_posix()}"
        label = f"{step}" + (f" / {phase}" if phase else "")
        if args.dry_run:
            print(f"[INFO] next round: {label}\n[INFO] model: {model}\n[INFO] prompt: {prompt}")
            return 0

        print(f"[INFO] round {n}: {label} (model: {model}) ...", flush=True)
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
                print(f"[GOAT] round {n} errored on {model}; escalating to {goat_model(step, phase, bump)} and retrying")
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
