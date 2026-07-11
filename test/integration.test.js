import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("bundled action filters real pull request and push diffs", () => {
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

  fs.writeFileSync(eventPath, JSON.stringify({ before: base, after: head }));
  fs.writeFileSync(outputPath, "");
  execFileSync(process.execPath, [path.join(root, "dist", "index.js")], {
    cwd: repo,
    env: {
      ...process.env,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      INPUT_FILTERS: "docs: 'docs/**'"
    }
  });
  assert.match(fs.readFileSync(outputPath, "utf8"), /\ntrue\n/);

  fs.writeFileSync(eventPath, JSON.stringify({ before: "0".repeat(40), after: head }));
  fs.writeFileSync(outputPath, "");
  execFileSync(process.execPath, [path.join(root, "dist", "index.js")], {
    cwd: repo,
    env: {
      ...process.env,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      INPUT_FILTERS: "docs: 'docs/**'\nsource: 'src/**'"
    }
  });
  const created = fs.readFileSync(outputPath, "utf8");
  assert.match(created, /docs<<[^\n]+\ntrue\n/);
  assert.match(created, /source<<[^\n]+\nfalse\n/);
  assert.match(created, /changes<<[^\n]+\n\["docs"\]\n/);

  fs.writeFileSync(eventPath, JSON.stringify({ before: head, after: "0".repeat(40) }));
  fs.writeFileSync(outputPath, "");
  execFileSync(process.execPath, [path.join(root, "dist", "index.js")], {
    cwd: repo,
    env: {
      ...process.env,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      INPUT_FILTERS: "docs: 'docs/**'"
    }
  });
  assert.match(fs.readFileSync(outputPath, "utf8"), /docs<<[^\n]+\ntrue\n/);

  fs.writeFileSync(eventPath, JSON.stringify({ before: head, after: head }));
  fs.writeFileSync(outputPath, "");
  execFileSync(process.execPath, [path.join(root, "dist", "index.js")], {
    cwd: repo,
    env: {
      ...process.env,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      INPUT_FILTERS: "docs: 'docs/**'",
      INPUT_BASE: base,
      INPUT_HEAD: head
    }
  });
  assert.match(fs.readFileSync(outputPath, "utf8"), /docs<<[^\n]+\ntrue\n/);
});
