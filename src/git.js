import { spawnSync } from "node:child_process";

const FULL_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const MAX_DIFF_BYTES = 32 * 1024 * 1024;
const MAX_CHANGED_PATHS = 100_000;

export function assertSha(name, value) {
  if (!FULL_SHA.test(value ?? "")) throw new Error(`${name} must be a full commit SHA`);
  return value;
}

export function changedPaths(base, head, { run = spawnSync } = {}) {
  const range = `${base}...${head}`;
  const result = run("git", [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--name-only",
    "-z",
    "--no-renames",
    "--diff-filter=ACDMRTUXB",
    range,
    "--"
  ], {
    encoding: "buffer",
    maxBuffer: MAX_DIFF_BYTES,
    timeout: 60_000,
    windowsHide: true
  });
  if (result.error) throw new Error(`git diff failed: ${result.error.message}`);
  if (result.status !== 0) {
    const stderr = result.stderr?.toString("utf8").trim();
    throw new Error(`git diff failed with exit code ${result.status}${stderr ? `: ${stderr}` : ""}`);
  }
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(result.stdout);
  } catch {
    throw new Error("git diff returned a path that is not valid UTF-8");
  }
  const paths = decoded.split("\0").filter(Boolean);
  if (paths.length > MAX_CHANGED_PATHS) {
    throw new Error(`git diff returned more than ${MAX_CHANGED_PATHS} changed paths`);
  }
  return paths;
}
