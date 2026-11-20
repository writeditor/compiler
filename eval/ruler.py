"""Side-by-side crop of one page of the reference and the paged PDF with rulers in points (page coordinates) and 50pt guides.
   .venv/bin/python eval/ruler.py [style] [page [y0 y1 [x0 x1]]]    -> eval/out/<style>/rulers/p<page>-<y0>-<y1>.png
   Read it like a drawing: the same y on both rulers is the same place on the page."""
import io, subprocess, sys
from outs import OUT, pdf, style_arg
from PIL import Image, ImageDraw

style = style_arg()
nums = [float(a) for a in sys.argv[1:] if a.replace(".", "").isdigit()]  # [page [y0 y1 [x0 x1]]]
page = int(nums[0]) if nums else 1
y0, y1 = (nums[1], nums[2]) if len(nums) > 2 else (60.0, 260.0)
x0, x1 = (nums[3], nums[4]) if len(nums) > 4 else (60.0, 552.0)
out = OUT / style
S, M = 3, 34  # pixels per point, ruler margin in pixels


def crop(pdf):
    raw = subprocess.run(["podman", "run", "--rm", "-v", f"{out}:/o:Z", "writ-eval", "pdftoppm", "-r", str(72 * S), "-f", str(page), "-l", str(page),
                          "-x", str(int(x0 * S)), "-y", str(int(y0 * S)), "-W", str(int((x1 - x0) * S)), "-H", str(int((y1 - y0) * S)), f"/o/{pdf}"], capture_output=True, check=True).stdout
    return Image.open(io.BytesIO(raw)).convert("RGB")


def panel(img, title):
    p = Image.new("RGB", (img.width + M, img.height + M + 16), "white")
    p.paste(img, (M, M + 16))
    d = ImageDraw.Draw(p)
    d.text((M, 2), title, fill="black")
    for y in range(int(y0) // 5 * 5, int(y1) + 1, 5):
        if y < y0: continue
        py = M + 16 + (y - y0) * S
        major = y % 50 == 0
        d.line([(M - (14 if major else (9 if y % 10 == 0 else 4)), py), (M, py)], fill="black")
        if major:
            d.text((1, py - 5), str(y), fill="black")
            d.line([(M, py), (p.width, py)], fill=(255, 170, 170))  # 50pt guide
    for x in range(int(x0) // 5 * 5, int(x1) + 1, 5):
        if x < x0: continue
        px = M + (x - x0) * S
        major = x % 50 == 0
        d.line([(px, M + 16 - (14 if major else (9 if x % 10 == 0 else 4))), (px, M + 16)], fill="black")
        if major:
            d.text((px - 8, 16), str(x), fill="black")
            d.line([(px, M + 16), (px, p.height)], fill=(170, 170, 255))
    return p


a, b = panel(crop(pdf(style, "ref")), "REFERENCE (LaTeX)"), panel(crop(pdf(style, "paged")), "PAGED")
sheet = Image.new("RGB", (a.width + b.width + 10, a.height), "white")
sheet.paste(a, (0, 0)); sheet.paste(b, (a.width + 10, 0))
(out / "rulers").mkdir(exist_ok=True)
dest = out / "rulers" / f"p{page}-{int(y0)}-{int(y1)}.png"
sheet.save(dest)
print(dest)
