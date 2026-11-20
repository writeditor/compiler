"""y position and thickness (pt) of the horizontal rules near the top of page 1, from pixels. python3 eval/rules.py <ref|ts|paged|pdf-name> [style]"""
import re, subprocess, sys
from outs import OUT, pdf, style_arg
style = style_arg(2)
out = OUT / style
dpi = 288
raw = subprocess.run(["podman", "run", "--rm", "-v", f"{out}:/o:Z", "writ-eval", "pdftoppm", "-gray", "-r", str(dpi), "-f", "1", "-l", "1", "-x", str(int(80 * dpi / 72)), "-y", str(int(40 * dpi / 72)), "-W", str(int(300 * dpi / 72)), "-H", str(int(130 * dpi / 72)), f"/o/{pdf(style, sys.argv[1])}"], capture_output=True, check=True).stdout
m = re.match(rb"P5\s+(\d+)\s+(\d+)\s+255\s", raw); w, h = int(m[1]), int(m[2]); px = raw[m.end():]
dark = [sum(px[y * w + x] < 128 for x in range(w)) > 0.9 * w for y in range(h)]  # a rule is dark across (almost) the whole crop
runs, y = [], 0
while y < h:
    if dark[y]:
        s = y
        while y < h and dark[y]: y += 1
        runs.append((40 + s * 72 / dpi, (y - s) * 72 / dpi))
    y += 1
print(" | ".join(f"rule at y={a:.1f}pt thickness {b:.2f}pt" for a, b in runs) or "no rule found")
