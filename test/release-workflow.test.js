import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = YAML.parse(fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8"));
const validateRelease = workflow.jobs.release.steps.find((step) => step.name === "Validate release").run;
const calculateVersion = workflow.jobs.release.steps.find((step) => step.name === "Calculate version").run;
const publishRelease = workflow.jobs.release.steps.find((step) => step.name === "Publish GitHub release").run;
const advanceMajor = workflow.jobs.release.steps.find((step) => step.name === "Advance major tag").run;

function calculate(bump, tags = [], currentTags = []) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-version-"));
  const output = path.join(directory, "output");
  execFileSync("git", ["init", "--initial-branch=main", directory]);
  execFileSync("git", ["config", "user.name", "Test"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: directory });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: directory });
  execFileSync("git", ["config", "tag.gpgsign", "false"], { cwd: directory });
  fs.writeFileSync(path.join(directory, "fixture"), "previous");
  execFileSync("git", ["add", "fixture"], { cwd: directory });
  execFileSync("git", ["commit", "-m", "previous"], { cwd: directory });
  for (const tag of tags) execFileSync("git", ["tag", tag], { cwd: directory });
  fs.writeFileSync(path.join(directory, "fixture"), "current");
  execFileSync("git", ["commit", "-am", "current"], { cwd: directory });
  for (const tag of currentTags) execFileSync("git", ["tag", tag], { cwd: directory });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
  execFileSync("bash", ["-euo", "pipefail", "-c", calculateVersion], {
    cwd: directory,
    env: {
      ...process.env,
      BUMP: bump,
      GITHUB_OUTPUT: output,
      GITHUB_SHA: sha
    }
  });
  return fs.readFileSync(output, "utf8").trim();
}

function validateAfterMainAdvances(attempt, { tag = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-validation-"));
  const remote = path.join(directory, "remote.git");
  const checkout = path.join(directory, "checkout");
  execFileSync("git", ["init", "--bare", remote]);
  execFileSync("git", ["init", "--initial-branch=main", checkout]);
  execFileSync("git", ["config", "user.name", "Test"], { cwd: checkout });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: checkout });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: checkout });
  execFileSync("git", ["config", "tag.gpgsign", "false"], { cwd: checkout });
  execFileSync("git", ["remote", "add", "origin", remote], { cwd: checkout });
  fs.writeFileSync(path.join(checkout, "fixture"), "release");
  execFileSync("git", ["add", "fixture"], { cwd: checkout });
  execFileSync("git", ["commit", "-m", "release"], { cwd: checkout });
  const releaseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).trim();
  if (tag) execFileSync("git", ["tag", "v0.1.0"], { cwd: checkout });
  execFileSync("git", ["push", "--set-upstream", "origin", "main", "--tags"], { cwd: checkout });
  fs.writeFileSync(path.join(checkout, "fixture"), "later");
  execFileSync("git", ["commit", "-am", "later"], { cwd: checkout });
  execFileSync("git", ["push", "origin", "main"], { cwd: checkout });
  execFileSync("git", ["checkout", "--detach", releaseSha], { cwd: checkout });
  return () =>
    execFileSync("bash", ["-euo", "pipefail", "-c", validateRelease], {
      cwd: checkout,
      env: {
        ...process.env,
        GITHUB_REF: "refs/heads/main",
        GITHUB_RUN_ATTEMPT: attempt,
        GITHUB_SHA: releaseSha
      }
    });
}

function publish(tag, { existingTag = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-publish-"));
  const calls = path.join(directory, "calls");
  const gh = path.join(directory, "gh");
  execFileSync("git", ["init", "--initial-branch=main", directory]);
  execFileSync("git", ["config", "user.name", "Test"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: directory });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: directory });
  execFileSync("git", ["config", "tag.gpgsign", "false"], { cwd: directory });
  fs.writeFileSync(path.join(directory, "fixture"), "release");
  execFileSync("git", ["add", "fixture"], { cwd: directory });
  execFileSync("git", ["commit", "-m", "release"], { cwd: directory });
  if (existingTag) execFileSync("git", ["tag", tag], { cwd: directory });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
  fs.writeFileSync(
    gh,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "release" && args[1] === "view") process.exit(1);
fs.writeFileSync(process.env.MOCK_CALLS, JSON.stringify(args));
`
  );
  fs.chmodSync(gh, 0o755);
  execFileSync("bash", ["-euo", "pipefail", "-c", publishRelease], {
    cwd: directory,
    env: {
      ...process.env,
      GITHUB_SHA: sha,
      MOCK_CALLS: calls,
      PATH: `${directory}:${process.env.PATH}`,
      TAG: tag
    }
  });
  return { args: JSON.parse(fs.readFileSync(calls, "utf8")), sha };
}

function runCase(tag, releases, { existingMajor = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-workflow-"));
  const calls = path.join(directory, "calls");
  const queries = path.join(directory, "queries");
  const gh = path.join(directory, "gh");
  fs.writeFileSync(
    gh,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("--paginate")) {
  fs.appendFileSync(process.env.MOCK_QUERIES, JSON.stringify(args) + "\\n");
  process.stdout.write(process.env.MOCK_RELEASES);
} else if (args[0] === "api" && args[1]?.includes("/git/ref/tags/")) {
  process.exitCode = process.env.MOCK_EXISTING_MAJOR === "true" ? 0 : 1;
} else {
  fs.appendFileSync(process.env.MOCK_CALLS, JSON.stringify(args) + "\\n");
}
`
  );
  fs.chmodSync(gh, 0o755);
  execFileSync("bash", ["-euo", "pipefail", "-c", advanceMajor], {
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      GITHUB_REPOSITORY: "getsentry/action-filter-paths",
      GITHUB_SHA: "a".repeat(40),
      MOCK_CALLS: calls,
      MOCK_EXISTING_MAJOR: String(existingMajor),
      MOCK_QUERIES: queries,
      MOCK_RELEASES: `${releases.join("\n")}\n`,
      TAG: tag
    }
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(queries, "utf8")), [
    "api",
    "--paginate",
    "repos/getsentry/action-filter-paths/releases?per_page=100",
    "--jq",
    ".[] | select(.draft == false and .prerelease == false) | .tag_name"
  ]);
  return fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse) : [];
}

test("major tag advances only for the latest release in its major line", () => {
  const sha = "a".repeat(40);
  assert.deepEqual(runCase("v1.2.0", ["v1.1.0", "v1.2.0"]), [
    ["api", "--method", "POST", "repos/getsentry/action-filter-paths/git/refs", "-f", "ref=refs/tags/v1", "-f", `sha=${sha}`]
  ]);
  assert.deepEqual(runCase("v1.2.0", ["v1.1.0", "v1.2.0"], { existingMajor: true }), [
    ["api", "--method", "PATCH", "repos/getsentry/action-filter-paths/git/refs/tags/v1", "-f", `sha=${sha}`, "-F", "force=true"]
  ]);
  assert.deepEqual(runCase("v1.1.0", ["v1.1.0", "v1.2.0"]), []);
  assert.deepEqual(runCase("v1.2.0", ["v1.2.0", "v2.0.0"], { existingMajor: true }), [
    ["api", "--method", "PATCH", "repos/getsentry/action-filter-paths/git/refs/tags/v1", "-f", `sha=${sha}`, "-F", "force=true"]
  ]);
});

test("release versions are bumped from stable tags and can be retried", () => {
  assert.equal(calculate("minor"), "tag=v0.1.0");
  assert.equal(calculate("patch", ["v0.1.0", "v0"]), "tag=v0.1.1");
  assert.equal(calculate("minor", ["v0.1.0", "v0.2.0", "v0"]), "tag=v0.3.0");
  assert.equal(calculate("major", ["v0.9.0", "v0"]), "tag=v1.0.0");
  assert.equal(calculate("minor", ["v0.1.0"], ["v0.2.0", "v0"]), "tag=v0.2.0");
});

test("release creation requires new commits", () => {
  const created = publish("v0.2.0");
  assert.deepEqual(created.args, [
    "release",
    "create",
    "v0.2.0",
    "--target",
    created.sha,
    "--fail-on-no-commits",
    "--generate-notes",
    "--title",
    "v0.2.0"
  ]);
  assert.deepEqual(publish("v0.2.0", { existingTag: true }).args, [
    "release",
    "create",
    "v0.2.0",
    "--verify-tag",
    "--fail-on-no-commits",
    "--generate-notes",
    "--title",
    "v0.2.0"
  ]);
});

test("only a tagged rerun may finish after main advances", () => {
  assert.throws(validateAfterMainAdvances("1"));
  assert.throws(validateAfterMainAdvances("2", { tag: false }));
  assert.doesNotThrow(validateAfterMainAdvances("2"));
});
