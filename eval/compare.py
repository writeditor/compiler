"""Lines of one page of the reference and the paged PDF side by side, and the font check. Top-down tool: fix the first row that differs, re-run.
   python3 eval/compare.py [style] [y-limit] [page]      (needs `make eval ARGS=<style>` first; reads eval/out/<style>/; style may be left out when only one has output)"""
import re, statistics, subprocess, sys
from outs import OUT, pdf, style_arg

style = style_arg()
nums = [float(a) for a in sys.argv[1:] if a.replace(".", "").isdigit()]  # [y-limit [page]], the style id (if given) is the other argument
limit = nums[0] if nums else 460
page = int(nums[1]) if len(nums) > 1 else 1
out = OUT / style


def words(pdf, page=1):
    xml = subprocess.run(["podman", "run", "--rm", "-v", f"{out}:/o:Z", "writ-eval", "pdftotext", "-bbox", "-f", str(page), "-l", str(page), f"/o/{pdf}", "-"],
                         capture_output=True, text=True, check=True).stdout
    return [(m[4], *map(float, m[:4])) for m in re.findall(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', xml)
            for m in [(m[0], m[1], m[2], m[3], m[4])]] if False else \
           [(t, float(a), float(b), float(c), float(d)) for a, b, c, d, t in re.findall(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', xml)]


def lines(ws):
    rows = {}
    for t, x0, y0, x1, y1 in ws:
        rows.setdefault(round(y0 * 2) / 2, []).append((t, x0, y0, x1, y1))
    return [(y, r[0][0] if len(r) < 2 else " ".join(w[0] for w in r[:3]), min(w[1] for w in r), max(w[3] for w in r), len(r)) for y, r in sorted(rows.items())]


ref, got = words(pdf(style, "ref"), page), words(pdf(style, "paged"), page)
print(f"{'REFERENCE':44}| PAGED")
for a, b in zip([l for l in lines(ref) if l[0] < limit], [l for l in lines(got) if l[0] < limit + 20]):
    d = f"dy {b[0] - a[0]:+5.1f}  dx0 {b[2] - a[2]:+5.1f}  dx1 {b[3] - a[3]:+5.1f}  words {b[4] - a[4]:+d}"
    print(f"y{a[0]:6.1f} x{a[2]:4.0f}-{a[3]:4.0f} {a[1][:22]:22}| y{b[0]:6.1f} x{b[2]:4.0f}-{b[3]:4.0f} {b[1][:22]:22} {d}")

# Font: the same word should be as wide in both. Median ratio of widths of words (5+ letters, in both PDFs, body area).
w = lambda ws: {t: x1 - x0 for t, x0, y0, x1, y1 in ws if len(t) >= 5 and t.isalpha() and y0 > 400}
a, b = w(ref), w(got)
ratios = [b[t] / a[t] for t in a if t in b and a[t] > 0]
print(f"\nfont: {len(ratios)} words in both, median width ratio paged/ref = {statistics.median(ratios):.3f}" if ratios else "\nfont: no common words")
