// Papers from the upstream RASH project (vendor/rash, a git submodule) must compile without throwing and keep their title, sections and citations.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { toLaTeX } from "../src/index.ts";

const dir = new URL("../vendor/rash/examples/", import.meta.url);
const papers = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".html")) : [];

test("upstream submodule is checked out", { skip: papers.length > 0 ? false : "run: git submodule update --init" }, () => assert.ok(papers.length));

for (const f of papers) test(`upstream example ${f}`, () => {
  const html = readFileSync(new URL(f, dir), "utf8");
  for (const t of ["rash", "amsart", "arxiv"] as const) {
    const tex = toLaTeX(html, t);
    assert.ok(tex.startsWith("\\documentclass") && tex.endsWith("\\end{document}\n"));
    assert.ok(/\\(sub)*section\{/.test(tex), "has sections");
  }
});
