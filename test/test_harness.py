"""The tester's per-style plumbing: venue.json manifests and the new-style scaffold."""
import json, subprocess, sys
from conftest import ROOT

STYLES = (ROOT / "node_modules/@writeditor/styles").resolve()
SCAFFOLD = ROOT / "eval/new_style.py"


def test_every_venue_manifest_names_its_sample():
    manifests = sorted(STYLES.glob("src/*/venue.json"))
    assert manifests, "no venue.json found: the tester would know no style"
    for m in manifests:
        assert isinstance(json.loads(m.read_text()).get("sample"), str), m


def scaffold(root, *args):
    return subprocess.run([sys.executable, str(SCAFFOLD), *args, "--root", str(root)], capture_output=True, text=True)


def test_new_style_scaffold_creates_registers_and_gitignores(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src/index.ts").write_text('import { rash } from "./rash/index.ts";\nimport { arxiv } from "./arxiv/index.ts";\n\nexport const STYLES = { rash, arxiv } as const;\n')
    (tmp_path / ".gitignore").write_text("node_modules/\n")
    r = scaffold(tmp_path, "sn", "Springer Nature")
    assert r.returncode == 0, r.stderr
    for f in ["style.css", "index.ts", "venue.json", "SOURCE.txt"]:
        assert (tmp_path / "src/sn" / f).is_file(), f
    assert not (tmp_path / "src/sn/editor.css").exists(), "the editor takes the style as it is"
    assert ".paper-pdf" not in (tmp_path / "src/sn/style.css").read_text().split("*/")[-1], "bare RASH selectors"
    assert 'css: scoped(CSS["sn/style"])' in (tmp_path / "src/sn/index.ts").read_text()
    index = (tmp_path / "src/index.ts").read_text()
    assert 'import { sn } from "./sn/index.ts";' in index and "STYLES = { rash, arxiv, sn }" in index
    assert "src/sn/class/*" in (tmp_path / ".gitignore").read_text()
    assert 'name: "Springer Nature"' in (tmp_path / "src/sn/index.ts").read_text()
    assert scaffold(tmp_path, "sn", "again").returncode != 0, "never overwrite an existing style"
    (tmp_path / "src/xo").mkdir()
    (tmp_path / "src/xo/export.xsl").write_text("<x/>")
    assert scaffold(tmp_path, "xo", "XSLT only").returncode == 0, "a folder that only has export.xsl is filled in"
    assert (tmp_path / "src/xo/export.xsl").read_text() == "<x/>" and (tmp_path / "src/xo/style.css").is_file()
    assert scaffold(tmp_path, "Bad-Id", "x").returncode != 0, "ids are lowercase letters and digits"
