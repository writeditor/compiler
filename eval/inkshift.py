"""Vertical shift (pt, ours - reference) of every text line of a page, from ink alone: no font boxes, so Sans, Mono and math lines are as exact as body text.
   python3 eval/inkshift.py [style] <page> [x0 x1]     one row per reference line band: y, shift, and <<< where the shift changes by more than 0.7 pt from the line above
Row ink profiles of both pages at 144 dpi (2 px per pt); each reference band is slid over ours (+-8 pt) for the best fit. Needs `make eval ARGS=<style>` first."""
import re, subprocess, sys
from outs import OUT, pdf, style_arg

style = style_arg()
nums = [float(a) for a in sys.argv[1:] if a.replace(".", "").isdigit()]
page, (x0, x1) = int(nums[0]), (nums[1:3] if len(nums) >= 3 else (0, 10000))
D = 2


def profile(role):
    raw = subprocess.run(["podman", "run", "--rm", "-v", f"{OUT / style}:/o:Z", "writ-eval", "pdftoppm", "-gray", "-r", str(72 * D), "-f", str(page), "-l", str(page), f"/o/{pdf(style, role)}"], capture_output=True, check=True).stdout
    m = re.match(rb"P5\s+(\d+)\s+(\d+)\s+255\s", raw); w, h = int(m[1]), int(m[2]); px = raw[m.end():]
    a, b = int(x0 * D), min(w, int(x1 * D))
    return [sum(px[y * w + x] < 128 for x in range(a, b)) for y in range(h)]


R, P = profile("ref"), profile("paged")
bands, y = [], 0
while y < len(R):
    if R[y]:
        s = y
        while y < len(R) and (R[y] or (y + 1 < len(R) and R[y + 1]) or (y + 2 < len(R) and R[y + 2])): y += 1
        bands.append((s, y))
    y += 1
prev = None
for a, b in bands:
    if b - a < 4: continue
    best = min(range(-8 * D, 8 * D + 1), key=lambda s: sum(abs(R[i] - (P[i + s] if 0 <= i + s < len(P) else 0)) for i in range(a - 2, b + 2)))
    sh = best / D
    print(f"y{a / D:6.1f}-{b / D:6.1f}  shift {sh:+5.1f}{'  <<<' if prev is not None and abs(sh - prev) > 0.7 else ''}")
    prev = sh
