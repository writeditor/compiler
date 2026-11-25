"""Third-party files are not in git, and they are required: tests and the scorer need them.
Lists what is missing and where each one comes from; exit 1 if any is. Run by `make test` and `make eval` first."""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STYLES = (ROOT / "node_modules/@writeditor/styles").resolve()
required = [(ROOT / "test/chr-sample.html", ROOT / "test/SOURCE.txt")]
for m in sorted(STYLES.glob("src/*/venue.json")):
    required.append((m.parent / json.loads(m.read_text())["sample"], m.parent / "SOURCE.txt"))
# a scaffolded venue.json still names the placeholder sample: say so before anything runs
for m in sorted(STYLES.glob("src/*/venue.json")):
    if "REPLACE-WITH-SAMPLE" in m.read_text():
        print(f"{m}: name the official sample .tex in \"sample\" (and put the class in class/, the sample in sample/; see SOURCE.txt)", file=sys.stderr)
        sys.exit(1)
missing = [(f, s) for f, s in required if not f.is_file()]
for f, s in missing:
    print(f"missing {f}\n  get it as described in {s}", file=sys.stderr)
sys.exit(1 if missing else 0)
