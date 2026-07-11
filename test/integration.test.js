import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("bundled action filters pull requests and enables all filters otherwise", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "action-filter-paths-"));
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  fs.writeFileSync(path.join(repo, "README.md"), "base\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "base");
  const base = git("rev-parse", "HEAD");
  fs.mkdirSync(path.join(repo, "docs"));
  fs.writeFileSync(path.join(repo, "docs", "guide.md"), "guide\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "docs");
  const head = git("rev-parse", "HEAD");

  const eventPath = path.join(repo, "event.json");
  const outputPath = path.join(repo, "output");
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: base }, head: { sha: head } } }));
  fs.writeFileSync(outputPath, "");
  execFileSync(process.execPath, [path.join(root, "dist", "index.js")], {
    cwd: repo,
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      INPUT_FILTERS: "docs: 'docs/**'\nsource: 'src/**'"
    }
  });

  const lines = fs.readFileSync(outputPath, "utf8").trimEnd().split("\n");
  const outputs = {};
  for (let index = 0; index < lines.length; index += 3) {
    const [name, delimiter] = lines[index].split("<<");
    assert.equal(lines[index + 2], delimiter);
    outputs[name] = lines[index + 1];
  }
  assert.deepEqual(outputs, { docs: "true", source: "false", changes: '["docs"]' });

  fs.writeFileSync(eventPath, JSON.stringify({ before: head, after: head }));
  fs.writeFileSync(outputPath, "");
  execFileSync(process.execPath, [path.join(root, "dist", "index.js")], {
    cwd: repo,
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "push",
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      INPUT_FILTERS: "docs: 'docs/**'\nsource: 'src/**'"
    }
  });
  const pushed = fs.readFileSync(outputPath, "utf8");
  assert.match(pushed, /docs<<[^\n]+\ntrue\n/);
  assert.match(pushed, /source<<[^\n]+\ntrue\n/);
  assert.match(pushed, /changes<<[^\n]+\n\["docs","source"\]\n/);
});
