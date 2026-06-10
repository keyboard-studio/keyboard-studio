#!/usr/bin/env python3
"""validate_demos.py -- validate every pattern YAML demo.filled_kmn (and touch layout) via kmc build.

Usage:
    python content/tools/validate_demos.py [--report]

Options:
    --report    Write results to content/validation_report.md in addition to stdout.

Exit code: 0 if all patterns pass, 1 if any fail.

Prerequisites:
    - Python 3.8+ (stdlib only -- no pip install needed)
    - kmc 18+ on PATH (install: npm install -g @keymanapp/kmc)
"""

import datetime
import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))  # content/tools/
CONTENT_DIR = os.path.dirname(SCRIPT_DIR)               # content/
REPO_ROOT = os.path.dirname(CONTENT_DIR)                # repo root
PATTERNS_DIR = os.path.join(CONTENT_DIR, "patterns")
REPORT_PATH = os.path.join(CONTENT_DIR, "validation_report.md")

KMC_CMD = "kmc"
# On Windows, .cmd files require shell=True (or explicit .cmd suffix) to be found
# by subprocess when shell=False.
_SHELL = sys.platform == "win32"


# ---------------------------------------------------------------------------
# YAML block-scalar extraction (stdlib only, no PyYAML)
# ---------------------------------------------------------------------------

def _extract_block_scalar_at_indent(lines, key_line_idx, key_indent):
    """Given the index of the 'key: |' line, collect and return the block content."""
    content_indent = key_indent + 2
    result_lines = []
    for j in range(key_line_idx + 1, len(lines)):
        l = lines[j]
        if not l.strip():
            result_lines.append("")
            continue
        actual_indent = len(l) - len(l.lstrip(" "))
        if actual_indent < content_indent:
            break
        result_lines.append(l[content_indent:])

    # Strip trailing blank lines (the block scalar content should end cleanly)
    while result_lines and result_lines[-1] == "":
        result_lines.pop()
    return "\n".join(result_lines)


def extract_scalar(text, dotted_key):
    """Extract a YAML scalar (block or inline) by a 2-level dotted key path.

    e.g. extract_scalar(text, 'demo.filled_kmn')

    Handles block scalars (|, |-, |+) and inline null values.
    Returns the string content, or None if absent or null.
    Assumes consistent 2-space per nesting level, 2-space content indent on top of key.
    """
    parts = dotted_key.split(".", 1)
    if len(parts) != 2:
        return None
    parent_key, child_key = parts

    lines = text.split("\n")

    # Find the parent key at indent 0
    parent_idx = None
    for i, line in enumerate(lines):
        if line.rstrip() == parent_key + ":":
            parent_idx = i
            break
    if parent_idx is None:
        return None

    # Within the parent block, find the child key at indent 2
    child_indent = 2
    child_prefix = " " * child_indent + child_key + ":"

    for i in range(parent_idx + 1, len(lines)):
        line = lines[i]
        stripped = line.rstrip()

        # If we hit a line at indent 0 that isn't empty, we've left the parent
        if line.strip() and not line.startswith(" "):
            break

        if not stripped.startswith(child_prefix):
            continue

        # Found child key
        value_part = stripped[len(child_prefix):].strip()

        if value_part in ("null", "~"):
            return None

        if value_part.startswith("|"):
            return _extract_block_scalar_at_indent(lines, i, child_indent)

        if value_part == "":
            return None

        return value_part

    return None


# ---------------------------------------------------------------------------
# KMN touch-layout injection
# ---------------------------------------------------------------------------

LAYOUTFILE_RE = re.compile(r"store\s*\(\s*&LAYOUTFILE\s*\)\s*'([^']+)'")


def inject_layoutfile(kmn_text, filename):
    """Add store(&LAYOUTFILE) to KMN text if not already present.

    Inserts after store(&TARGETS) if found, else after store(&VERSION), else at start.
    Returns the modified KMN text and the layout filename to use.
    """
    m = LAYOUTFILE_RE.search(kmn_text)
    if m:
        # Already has LAYOUTFILE -- return the referenced filename
        return kmn_text, m.group(1)

    line = f"store(&LAYOUTFILE) '{filename}'"

    targets_m = re.search(r"^([ \t]*store\s*\(&TARGETS\)[^\n]*)", kmn_text, re.MULTILINE)
    if targets_m:
        pos = targets_m.end()
        return kmn_text[:pos] + "\n" + line + kmn_text[pos:], filename

    version_m = re.search(r"^([ \t]*store\s*\(&VERSION\)[^\n]*)", kmn_text, re.MULTILINE)
    if version_m:
        pos = version_m.end()
        return kmn_text[:pos] + "\n" + line + kmn_text[pos:], filename

    return line + "\n" + kmn_text, filename


# ---------------------------------------------------------------------------
# kmc invocation helpers
# ---------------------------------------------------------------------------

def run_kmc(kmn_path):
    """Run kmc build file <path> --compiler-warnings-as-errors.

    Returns (passed: bool, output: str).
    """
    cmd = [KMC_CMD, "build", "file", kmn_path, "--compiler-warnings-as-errors"]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            shell=_SHELL,
        )
        output = (result.stdout + result.stderr).strip()
        return result.returncode == 0, output
    except FileNotFoundError:
        return False, "[ERROR] kmc not found on PATH. Install with: npm install -g @keymanapp/kmc"
    except subprocess.TimeoutExpired:
        return False, "[ERROR] kmc timed out after 60 seconds"


def validate_filled_kmn(pattern_id, kmn_text):
    """Compile demo.filled_kmn in a temp file. Returns (passed, output)."""
    with tempfile.NamedTemporaryFile(
        suffix=".kmn", mode="w", encoding="utf-8", delete=False
    ) as tmp:
        tmp.write(kmn_text)
        tmp_path = tmp.name
    try:
        return run_kmc(tmp_path)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        # kmc writes a .kmx beside the .kmn -- clean that up too
        kmx = tmp_path.replace(".kmn", ".kmx")
        if os.path.exists(kmx):
            try:
                os.unlink(kmx)
            except OSError:
                pass


def validate_touch_layout(pattern_id, kmn_text, layout_json):
    """Compile demo.filled_kmn paired with touch layout JSON in a temp dir.

    Returns (passed, output).
    """
    tmp_dir = tempfile.mkdtemp(prefix="kbstudio_validate_")
    try:
        # Inject LAYOUTFILE if absent; get the filename to write the JSON to
        layout_filename = "demo.keyman-touch-layout"
        kmn_modified, layout_filename = inject_layoutfile(kmn_text, layout_filename)

        kmn_path = os.path.join(tmp_dir, "demo.kmn")
        layout_path = os.path.join(tmp_dir, layout_filename)

        with open(kmn_path, "w", encoding="utf-8") as f:
            f.write(kmn_modified)
        with open(layout_path, "w", encoding="utf-8") as f:
            f.write(layout_json)

        return run_kmc(kmn_path)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# Main validation loop
# ---------------------------------------------------------------------------

class PatternResult:
    def __init__(self, pattern_id, yaml_path):
        self.pattern_id = pattern_id
        self.yaml_path = yaml_path
        self.kmn_passed = None
        self.kmn_output = ""
        self.touch_passed = None
        self.touch_output = ""

    @property
    def overall_passed(self):
        if self.kmn_passed is None:
            return False
        if self.touch_passed is not None and not self.touch_passed:
            return False
        return self.kmn_passed


def validate_all(write_report=False):
    yaml_paths = sorted(
        glob.glob(os.path.join(PATTERNS_DIR, "**", "*.yaml"), recursive=True)
    )
    if not yaml_paths:
        print("[WARN] No pattern YAML files found under", PATTERNS_DIR)
        return True

    results = []
    any_fail = False

    for yaml_path in yaml_paths:
        rel = os.path.relpath(yaml_path, REPO_ROOT).replace("\\", "/")
        with open(yaml_path, encoding="utf-8") as f:
            text = f.read()

        # Derive pattern id from filename
        pattern_id = os.path.splitext(os.path.basename(yaml_path))[0]

        result = PatternResult(pattern_id, rel)

        # --- filled_kmn ---
        kmn_text = extract_scalar(text, "demo.filled_kmn")
        if not kmn_text:
            print(f"[SKIP] {rel}: no demo.filled_kmn found")
            results.append(result)
            continue

        # --- touch layout (touch_layout_fragment or touch_layout) ---
        layout_json = extract_scalar(text, "demo.touch_layout_fragment")
        if layout_json is None:
            layout_json = extract_scalar(text, "demo.touch_layout")

        # If the KMN already references a LAYOUTFILE, the standalone compile will
        # fail because the layout file won't be present in the temp dir. Skip the
        # standalone test and let the paired test (below) serve as the KMN check.
        has_layoutfile = bool(LAYOUTFILE_RE.search(kmn_text))

        if not has_layoutfile:
            passed, output = validate_filled_kmn(pattern_id, kmn_text)
            result.kmn_passed = passed
            result.kmn_output = output

            if passed:
                print(f"[PASS] {rel}: filled_kmn")
            else:
                print(f"[FAIL] {rel}: filled_kmn")
                if output:
                    for line in output.splitlines():
                        print(f"       {line}")
                any_fail = True
        elif has_layoutfile and layout_json is None:
            # Drift guard: the KMN references &LAYOUTFILE but the demo section
            # carries no touch layout. This is a legitimate pattern-authoring
            # error (not a false positive) — a paired test is required when
            # &LAYOUTFILE is present, and the SKIP path above only fires when
            # layout_json IS present. So this branch is only reached when both
            # conditions are true: KMN needs a layout file AND the demo omits it.
            print(f"[FAIL] {rel}: filled_kmn references &LAYOUTFILE but demo has no touch_layout or touch_layout_fragment")
            result.kmn_passed = False
            result.kmn_output = "LAYOUTFILE drift: &LAYOUTFILE referenced but no paired layout JSON in demo"
            any_fail = True

        if layout_json is not None:
            t_passed, t_output = validate_touch_layout(pattern_id, kmn_text, layout_json)
            result.touch_passed = t_passed
            result.touch_output = t_output

            if t_passed:
                print(f"[PASS] {rel}: touch_layout")
            else:
                print(f"[FAIL] {rel}: touch_layout")
                if t_output:
                    for line in t_output.splitlines():
                        print(f"       {line}")
                any_fail = True

            # Paired test also validates the KMN for LAYOUTFILE patterns
            if has_layoutfile:
                result.kmn_passed = t_passed
                result.kmn_output = "(covered by touch_layout test)"

        results.append(result)

    if write_report:
        _write_report(results)

    return not any_fail


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------

def _kmc_version():
    try:
        r = subprocess.run(
            [KMC_CMD, "--version"],
            capture_output=True, text=True, timeout=10,
            shell=_SHELL,
        )
        v = (r.stdout + r.stderr).strip()
        return v if v else "unknown"
    except Exception:
        return "unknown"


def _write_report(results):
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    kmc_ver = _kmc_version()

    lines = [
        "# Pattern Demo Validation Report",
        "",
        f"> Auto-generated by `content/tools/validate_demos.py` on {now}  ",
        f"> kmc version: {kmc_ver}  ",
        "> Re-run: `python content/tools/validate_demos.py --report`",
        "",
        "| Pattern | KMN | Touch layout | Overall |",
        "| ------- | --- | ------------ | ------- |",
    ]

    for r in results:
        kmn_cell = "PASS" if r.kmn_passed else ("FAIL" if r.kmn_passed is False else "skip")
        touch_cell = (
            "PASS" if r.touch_passed is True
            else "FAIL" if r.touch_passed is False
            else "n/a"
        )
        overall_cell = "PASS" if r.overall_passed else "FAIL"
        lines.append(f"| `{r.pattern_id}` | {kmn_cell} | {touch_cell} | {overall_cell} |")

    lines.append("")

    # Summary counts
    total = len(results)
    passed = sum(1 for r in results if r.overall_passed)
    failed = total - passed
    lines += [
        f"**{passed}/{total} patterns passing** ({failed} failing)",
        "",
    ]

    # Failure details
    failures = [r for r in results if not r.overall_passed]
    if failures:
        lines.append("## Failure Details")
        lines.append("")
        for r in failures:
            lines.append(f"### `{r.pattern_id}`")
            if r.kmn_passed is False and r.kmn_output:
                lines.append("")
                lines.append("**KMN compile output:**")
                lines.append("```")
                lines.extend(r.kmn_output.splitlines())
                lines.append("```")
            if r.touch_passed is False and r.touch_output:
                lines.append("")
                lines.append("**Touch layout compile output:**")
                lines.append("```")
                lines.extend(r.touch_output.splitlines())
                lines.append("```")
            lines.append("")

    content = "\n".join(lines) + "\n"
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"\n[OK] Report written to {os.path.relpath(REPORT_PATH, REPO_ROOT)}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    write_report = "--report" in sys.argv
    ok = validate_all(write_report=write_report)
    sys.exit(0 if ok else 1)
