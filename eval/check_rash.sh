#!/bin/sh
# Validate RASH files against the RASH grammar (vendor/rash/grammar/rash.rng) with xmllint, and say how many pass.
#   sh eval/check_rash.sh                   the official papers in vendor/rash (they must pass: they show the check works) and every eval/corpus/arxiv/*/rash.html
#   sh eval/check_rash.sh file.html ...     those files, with the first error of each failure
cd "$(dirname "$0")/.." || exit 1
rng=vendor/rash/grammar/rash.rng; ok=0; bad=0
for f in ${@:-vendor/rash/examples/*.html vendor/rash/papers/*.html eval/corpus/arxiv/*/rash.html}; do
  if out=$(xmllint --noout --relaxng $rng "$f" 2>&1); then ok=$((ok + 1)); else bad=$((bad + 1)); echo "FAIL $f: $(echo "$out" | grep -v 'fails to validate' | head -1 | cut -c1-200)"; fi
done
echo "$ok valid, $bad invalid"; [ $bad -eq 0 ]
