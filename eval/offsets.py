"""Where the paged PDF's vertical positions drift from the reference, from the PDFs' own text boxes (pdftotext -bbox). Top-down companion of compare.py.
   python3 eval/offsets.py [style] <page>                       rows where dy (ours - reference) changes by more than 0.7 pt: each is a spacing defect between that row and the one above
   python3 eval/offsets.py [style] <page> <regex> [<regex> ...]  for the rows whose text starts like a regex (headings, "Keywords"): the gap above and below it, reference and ours
   python3 eval/offsets.py [style] pitch <page> <y0> <y1>        the line-to-line distances in a y range (the body line pitch: ours alternates when the line height is snapped)
   python3 eval/offsets.py [style] ratio <page> <y0> <y1>        width of the same words, ours / reference, in a y band: the font size is right at 1.00 (a class's "11pt" is 10.95pt)
Needs `make eval ARGS=<style>` first (the container's pdftotext, like compare.py). Rows are matched by their first three words."""
import re, statistics, subprocess, sys
from outs import OUT, pdf, style_arg

style = style_arg()
args = [a for a in sys.argv[1:] if a != style]
out = OUT / style


def rows(role, page):
    xml = subprocess.run(["podman", "run", "--rm", "-v", f"{out}:/o:Z", "writ-eval", "pdftotext", "-bbox", "-f", str(page), "-l", str(page), f"/o/{pdf(style, role)}", "-"],
                         capture_output=True, text=True, check=True).stdout
    words = [(float(b), float(a), t) for a, b, c, d, t in re.findall(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', xml)]
    grouped = {}
    for y, x, t in words:
        grouped.setdefault(round(y * 0.7), []).append((x, t, y))  # words whose tops are within ~1.4 pt share a row
    return [(sum(w[2] for w in r) / len(r), " ".join(w[1] for w in sorted(r))) for _, r in sorted(grouped.items())]


key = lambda t: " ".join(re.sub(r"\W", "", w) for w in t.split()[:3]).lower()

if args and args[0] == "pitch":
    page, y0, y1 = int(args[1]), float(args[2]), float(args[3])
    for role in ("ref", "paged"):
        ys = [y for y, _ in rows(role, page) if y0 < y < y1]
        d = [round(b - a, 2) for a, b in zip(ys, ys[1:])]
        print(f"{role:6} mean {statistics.mean(d):.2f}  " + " ".join(map(str, d)))
    sys.exit()

if args and args[0] == "ratio":
    page, y0, y1 = int(args[1]), float(args[2]), float(args[3])
    def boxes(role):
        xml = subprocess.run(["podman", "run", "--rm", "-v", f"{out}:/o:Z", "writ-eval", "pdftotext", "-bbox", "-f", str(page), "-l", str(page), f"/o/{pdf(style, role)}", "-"], capture_output=True, text=True, check=True).stdout
        return [(t, float(c) - float(a)) for a, b, c, d, t in re.findall(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', xml) if y0 < float(b) < y1]
    ref = dict(boxes("ref"))
    r = [w / ref[t] for t, w in boxes("paged") if t in ref and len(t) > 3]
    print(f"{len(r)} words in both, median width ratio ours/reference = {statistics.median(r):.3f}" if r else "no words in both in that band")
    sys.exit()

page = int(args[0])
R, P = rows("ref", page), rows("paged", page)
if len(args) > 1:
    for role, L in (("ref", R), ("paged", P)):
        print(role)
        for i, (y, t) in enumerate(L):
            if 0 < i < len(L) - 1 and any(re.match(q, t) for q in args[1:]):
                print(f"  {L[i-1][0]:6.1f} -> {t[:26]:26} {y:6.1f} (+{y-L[i-1][0]:4.1f}) -> {L[i+1][0]:6.1f} (+{L[i+1][0]-y:4.1f})  {L[i+1][1][:12]}")
    sys.exit()

ours = {}
for y, t in P:
    ours.setdefault(key(t), []).append(y)
prev = None
print("   y_ref text                           dy   change")
for y, t in R:
    near = [v for v in ours.get(key(t), []) if abs(v - y) < 14]
    if not near or len(key(t)) < 4:
        continue
    d = min(near, key=lambda v: abs(v - y)) - y
    if prev is not None and abs(d - prev) > 0.7:
        print(f"{y:7.1f} {t[:30]:30} {d:+5.1f}  {d - prev:+5.1f} <<<")
    prev = d
