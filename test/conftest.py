"""Helpers: the compiler is TypeScript, so every call goes through test/bridge.ts."""
import json, pathlib, subprocess
import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
SAMPLE = (ROOT / "test/sample.html").read_text()


class UnknownTemplateError(Exception):
    pass


def third_party(path):
    """A third-party file that is not in git. Required: a missing one fails the test and says where to get it."""
    path = ROOT / path
    if not path.is_file():
        pytest.fail(f"missing {path}: get it as described in {path.parent / 'SOURCE.txt'}")
    return path


def tex(html, template=None, box=False):
    r = subprocess.run(["node", str(ROOT / "test/bridge.ts")], input=json.dumps({"html": html, "template": template, "box": box}),
                       capture_output=True, text=True, cwd=ROOT, check=True)
    out = json.loads(r.stdout)
    if "error" in out:
        raise (UnknownTemplateError if out["error"] == "UnknownTemplateError" else RuntimeError)(out["message"])
    return out["tex"]


def page(body, head=""):
    return f"<html><head><title>T</title>{head}</head><body>{body}</body></html>"


def sec(inner):
    return page(f"<section><h1>S</h1>{inner}</section>")


def has(text, *parts):
    for p in parts:
        assert p in text, p
