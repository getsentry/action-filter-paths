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
const advanceMajor = workflow.jobs.release.steps.find((step) => step.name === "Advance major tag").run;

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
