"""Where the tester put things: eval/out/<style>/<role>/ (role = ref | ts | paged | upstream), screenshots in eval/out/<style>/rulers/. Shared by compare.py, ruler.py and rules.py."""
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out"
ROLES = ("ref", "ts", "paged")  # the official sample by plain LaTeX, our LaTeX, our PDF


def style_arg(i=1):
    """The style id from argv[i], else the only style that has output."""
    if len(sys.argv) > i and not sys.argv[i].replace(".", "").isdigit():
        return sys.argv[i]
    found = sorted(d.name for d in OUT.iterdir() if d.is_dir() and any(d.glob("ref/*.pdf"))) if OUT.is_dir() else []
    if len(found) != 1:
        sys.exit(f"give the style: one of {found or 'none yet, run `make eval ARGS=<style>` first'}")
    return found[0]


def pdf(style, role):
    """Path (below eval/out/<style>/) of the `role` PDF of the style's official sample, or a path as given."""
    if role not in ROLES:
        return role
    hits = sorted(p.name for p in (OUT / style / role).glob("*.pdf"))
    if len(hits) != 1:
        sys.exit(f"expected one PDF in {OUT / style / role}, found {hits or 'none'}; run `make eval ARGS={style}`")
    return f"{role}/{hits[0]}"
