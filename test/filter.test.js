import assert from "node:assert/strict";
import test from "node:test";
import { parseFilters, matchFilters } from "../src/filter.js";
import { assertSha, changedPaths } from "../src/git.js";

test("parses and matches includes, exclusions, dotfiles, and deletions", () => {
  const filters = parseFilters(`docs:\n  - docs/**\n  - '!docs/private/**'\nconfig: '**/.github/**'\nnot_js: '!**/*.js'`);
  assert.deepEqual(matchFilters(filters, ["docs/guide.md", "docs/private/a.md", "pkg/.github/x.yml"]), [
    { name: "docs", matched: true },
    { name: "config", matched: true },
    { name: "not_js", matched: true }
  ]);
});

test("rejects unsafe shapes and names", () => {
  assert.throws(() => parseFilters("changes: '**'"), /invalid or reserved/);
  assert.throws(() => parseFilters("bad.name: '**'"), /invalid or reserved/);
  assert.throws(() => parseFilters("x: 42"), /non-empty string/);
  assert.throws(() => parseFilters("x: '!'"), /non-empty string/);
});

test("requires full SHAs", () => {
  assert.equal(assertSha("base", "a".repeat(40)), "a".repeat(40));
  assert.throws(() => assertSha("base", "HEAD~1"), /full commit SHA/);
});

test("passes a fixed argument vector to git and reads NUL-delimited paths", () => {
  let invocation;
  const run = (...args) => {
    invocation = args;
    return { status: 0, stdout: Buffer.from("a file\0line\nname\0"), stderr: Buffer.alloc(0) };
  };
  const paths = changedPaths("a".repeat(40), "b".repeat(40), { pullRequest: true, run });
  assert.deepEqual(paths, ["a file", "line\nname"]);
  assert.deepEqual(invocation[1], [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--name-only",
    "-z",
    "--no-renames",
    "--diff-filter=ACDMRTUXB",
    `${"a".repeat(40)}...${"b".repeat(40)}`,
    "--"
  ]);
});

test("fails closed on non-UTF-8 paths", () => {
  const run = () => ({ status: 0, stdout: Buffer.from([0xff, 0]), stderr: Buffer.alloc(0) });
  assert.throws(() => changedPaths("a".repeat(40), "b".repeat(40), { run }), /not valid UTF-8/);
});

test("bounds the number of attacker-controlled changed paths", () => {
  const output = `${"a\0".repeat(100_001)}`;
  const run = () => ({ status: 0, stdout: Buffer.from(output), stderr: Buffer.alloc(0) });
  assert.throws(() => changedPaths("a".repeat(40), "b".repeat(40), { run }), /more than 100000/);
});
