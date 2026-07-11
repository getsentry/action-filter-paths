import fs from "node:fs";
import * as core from "@actions/core";
import { parseFilters, matchFilters } from "./filter.js";
import { assertSha, changedPaths } from "./git.js";

function event() {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) return {};
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function resolveRange(payload, baseInput, headInput) {
  const pullRequest = Boolean(payload.pull_request);
  const base = baseInput || payload.pull_request?.base?.sha || payload.before;
  const head = headInput || payload.pull_request?.head?.sha || payload.after;
  return { base: assertSha("base", base), head: assertSha("head", head), pullRequest };
}

function run() {
  try {
    const filters = parseFilters(core.getInput("filters", { required: true }));
    const range = resolveRange(event(), core.getInput("base"), core.getInput("head"));
    const paths = changedPaths(range.base, range.head, { pullRequest: range.pullRequest });
    const results = matchFilters(filters, paths);
    const changes = results.filter(({ matched }) => matched).map(({ name }) => name);
    for (const { name, matched } of results) core.setOutput(name, String(matched));
    core.setOutput("changes", JSON.stringify(changes));
    core.info(`Matched ${changes.length} of ${results.length} filters across ${paths.length} changed paths`);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
