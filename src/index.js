import fs from "node:fs";
import * as core from "@actions/core";
import { parseFilters, matchFilters } from "./filter.js";
import { assertSha, changedPaths } from "./git.js";

function event() {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) return {};
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function run() {
  try {
    const filters = parseFilters(core.getInput("filters", { required: true }));
    const pullRequest = process.env.GITHUB_EVENT_NAME === "pull_request";
    let paths = [];
    let results;
    if (pullRequest) {
      const payload = event();
      const base = assertSha("pull request base", payload.pull_request?.base?.sha);
      const head = assertSha("pull request head", payload.pull_request?.head?.sha);
      paths = changedPaths(base, head);
      results = matchFilters(filters, paths);
    } else {
      results = filters.map(({ name }) => ({ name, matched: true }));
    }
    const changes = results.filter(({ matched }) => matched).map(({ name }) => name);
    for (const { name, matched } of results) core.setOutput(name, String(matched));
    core.setOutput("changes", JSON.stringify(changes));
    core.info(
      pullRequest
        ? `Matched ${changes.length} of ${results.length} filters across ${paths.length} changed paths`
        : `Enabled all ${results.length} filters for non-pull-request event`
    );
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
