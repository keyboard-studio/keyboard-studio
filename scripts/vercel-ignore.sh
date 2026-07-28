#!/usr/bin/env bash
#
# Vercel "Ignored Build Step" decision script.
#
# Vercel runs this at the repository root before every deploy and reads its
# EXIT CODE (not its stdout):
#
#   exit 0  -> SKIP the build (Vercel cancels the deploy)
#   exit 1  -> PROCEED with the build (any non-zero proceeds)
#
# Policy: CONSERVATIVE. Default to BUILDING whenever we are unsure. We only
# skip a deploy when EVERY changed path in the push is pure documentation or
# spec prose — docs/, specs/, or top-level markdown (*.md / README*). Anything
# that can affect the shipped studio bundle (content/**, pnpm-lock.yaml, and
# everything under packages/, utilities/, scripts/, .github/, plus root config
# files like vercel.json / package.json / *.config.*) forces a build.
#
# If the diff cannot be computed (shallow clone, first commit), we BUILD.

set -u

# Compute the changed files for this push. If HEAD^ is unavailable (shallow
# checkout or the very first commit), git errors and we fall through to build.
if ! changed="$(git diff --name-only HEAD^ HEAD 2>/dev/null)"; then
  echo "vercel-ignore: cannot compute HEAD^..HEAD diff -> BUILD"
  exit 1
fi

# No files resolved is unexpected -> build rather than skip.
if [ -z "${changed}" ]; then
  echo "vercel-ignore: empty diff -> BUILD"
  exit 1
fi

# A path is doc-only (safe to skip) if it lives under docs/ or specs/, or is a
# TOP-LEVEL markdown / README file. Any other path — including every nested
# path outside docs/ and specs/ — is treated as build-affecting.
is_doc_only() {
  case "$1" in
    docs/* | specs/*) return 0 ;;  # documentation / spec trees
    */*) return 1 ;;               # any other nested path -> build
    *.md | README*) return 0 ;;    # top-level markdown / README
    *) return 1 ;;                 # top-level config, lockfiles, etc. -> build
  esac
}

while IFS= read -r file; do
  [ -z "${file}" ] && continue
  if ! is_doc_only "${file}"; then
    echo "vercel-ignore: build-affecting change (${file}) -> BUILD"
    exit 1
  fi
done <<EOF
${changed}
EOF

echo "vercel-ignore: docs/specs-only changeset -> SKIP build"
exit 0
