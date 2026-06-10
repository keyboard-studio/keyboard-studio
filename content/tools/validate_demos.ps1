# validate_demos.ps1 -- thin wrapper around validate_demos.py
# Usage: content/tools/validate_demos.ps1 [--report]
python (Join-Path $PSScriptRoot "validate_demos.py") @args
exit $LASTEXITCODE
