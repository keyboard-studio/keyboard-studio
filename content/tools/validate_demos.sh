#!/usr/bin/env bash
# validate_demos.sh -- thin wrapper around validate_demos.py
# Usage: bash content/tools/validate_demos.sh [--report]
set -euo pipefail
python3 "$(dirname "$0")/validate_demos.py" "$@"
