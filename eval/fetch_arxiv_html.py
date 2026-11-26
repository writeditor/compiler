"""Download the arXiv HTML version (LaTeXML) of cs.DL papers licensed CC BY, plus their images, one folder per paper.
   python3 -I eval/fetch_arxiv_html.py                                  the papers listed in eval/corpus-arxiv.tsv (the committed corpus: same papers on every machine)
   python3 -I eval/fetch_arxiv_html.py --select [count=45] [from=2026-09-01]   pick the corpus again (rewrites eval/corpus-arxiv.tsv; the newest papers change over time)
Selection rule (stated in the paper): arXiv's cs.DL set (primary and cross-listed), licence exactly Creative Commons Attribution (creativecommons.org/licenses/by/*; not -SA, -NC, -ND, CC0 or arXiv's default licence), updated since `from`, newest first, the first `count` whose /html/<id> page exists.
Output: eval/corpus-arxiv.tsv (committed: id, licence, authors, title: what CC BY attribution needs) and eval/corpus/arxiv/<id>/ (gitignored). A folder without `.complete` is a partial download of this script and is redone.
Images: <img src> and <object data> files, and a PNG next to each SVG (needs ImageMagick `magick`).
Politeness: one request every 3 s, a generic user agent. Downloaded pages are untrusted data: nothing here runs them, they are only written to disk and scanned for <img src>."""
import html, re, shutil, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIST = HERE / "corpus-arxiv.tsv"
SELECT = sys.argv[1:2] == ["--select"] or not LIST.exists()
args = [a for a in sys.argv[1:] if a != "--select"]
N = int(args[0]) if args else 45
FROM = args[1] if len(args) > 1 else "2026-09-01"
OUT = HERE / "corpus" / "arxiv"
UA = {"User-Agent": "corpus-fetch/1.0"}


def get(url):
    time.sleep(3)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
        return r.geturl(), r.read()


def assets(d, page, base):
    """Images of a paper: <img src> and <object data> (arXiv draws many figures as external .svg). An SVG also gets a PNG next to it (name + .png): Writ keeps raster images only. Files already there are kept."""
    n = 0
    for src in dict.fromkeys(re.findall(rb'<(?:img[^>]+src|object[^>]+data)="([^":]+\.(?:png|jpg|jpeg|gif|svg))"', page)):
        s = src.decode()
        if ".." in s or s.startswith("/"): continue  # stays inside the paper's own folder
        f = d / s
        try:
            if not f.exists():
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_bytes(get(urllib.parse.urljoin(base, s))[1]); n += 1
            if s.endswith(".svg") and not Path(str(f) + ".png").exists():  # white background, 144 dpi, at most 1400 px: Writ keeps an image only if it is small
                subprocess.run(["magick", "-background", "white", "-density", "144", str(f), "-resize", "1400x1400>", "-flatten", str(f) + ".png"], check=True, capture_output=True, timeout=120)
        except Exception as e:
            print(f"{d.name}: image {s}: {e}")
    return n


# 1. the CC BY papers of cs.DL (OAI-PMH, arXiv format: it carries the licence), or the committed list
papers, url = {}, f"https://oaipmh.arxiv.org/oai?verb=ListRecords&set=cs:cs:DL&metadataPrefix=arXiv&from={FROM}" if SELECT else None
if not SELECT:
    papers = {l.split("\t")[0]: tuple(l.split("\t")[1:4]) for l in LIST.read_text().splitlines() if l.strip()}
    N = len(papers)
while url:
    xml = get(url)[1].decode()
    for rec in re.findall(r"<record>.*?</record>", xml, re.S):
        lic = (re.search(r"<license>([^<]*)", rec) or [0, ""])[1]
        if re.fullmatch(r"https?://creativecommons\.org/licenses/by/\d(\.\d)?/?", lic):
            names = [" ".join(filter(None, [f, k])) for k, f in re.findall(r"<keyname>([^<]*)</keyname>\s*(?:<forenames>([^<]*)</forenames>)?", rec)]
            papers[re.search(r"<id>([^<]*)", rec)[1]] = (lic, "; ".join(html.unescape(n) for n in names), " ".join(html.unescape(re.search(r"<title>(.*?)</title>", rec, re.S)[1]).split()))
    tok = re.search(r"<resumptionToken[^>]*>([^<]+)", xml)
    url = "https://oaipmh.arxiv.org/oai?verb=ListRecords&resumptionToken=" + urllib.parse.quote(tok[1]) if tok else None
print(f"{len(papers)} CC BY papers in cs.DL since {FROM}" if SELECT else f"{len(papers)} papers in {LIST.name}")

# 2. their HTML versions, newest first
got = []
for i in sorted(papers, reverse=True):
    if len(got) == N:
        break
    d = OUT / i
    if (d / ".complete").exists():  # complete before: only look for images it lacks (this script learned <object> after the first run)
        assets(d, (d / "index.html").read_bytes(), "https://arxiv.org/html/")
        got.append(i); continue
    if d.exists():
        shutil.rmtree(d)  # a partial download of an earlier run of this script
    try:
        url, page = get(f"https://arxiv.org/html/{i}")
    except urllib.error.HTTPError as e:
        print(f"{i}: no HTML ({e.code})"); continue
    d.mkdir(parents=True)
    (d / "index.html").write_bytes(page)
    n = assets(d, page, url)
    (d / ".complete").write_text("")
    got.append(i); print(f"{i}: {len(page) // 1024} KiB, {n} images ({len(got)}/{N})", flush=True)
for d in OUT.iterdir() if SELECT else []:  # downloads that are not in the selection (an earlier run without the licence filter)
    if d.name not in got:
        shutil.rmtree(d); print(f"removed {d.name}: not in the CC BY selection")
if SELECT: LIST.write_text("".join(f"{i}\t{papers[i][0]}\t{papers[i][1]}\t{papers[i][2]}\n" for i in got))
print(f"{len(got)} papers; list with licence and authors in eval/corpus-arxiv.tsv")
