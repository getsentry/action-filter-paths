# Behavior specification

## Goals

The product provides deterministic, least-privilege path classification for GitHub Actions. It optimizes for a contract that is easy to audit and difficult to misuse, not for GitHub API features or an expansive filtering language.

## Inputs and outputs

`filters` is required YAML. Its root must be a mapping whose keys match `[A-Za-z_][A-Za-z0-9_-]*`; `changes` is reserved. Each value is a non-empty string or list of non-empty strings. Patterns beginning with `!` are exclusions.

For every configured key the action emits exactly one boolean string output. `changes` is a compact JSON array of matched keys in source order. An empty diff emits `false` for every filter and `[]` for `changes`.

## Matching

The changed-path set comes from `git diff --no-ext-diff --no-textconv --name-only -z --no-renames --diff-filter=ACDMRTUXB`. NUL delimiting preserves spaces, quotes, glob characters, leading dashes, and newlines in filenames. Git is spawned directly with a fixed argument structure; no input is interpreted by a shell, external diff command, or text-conversion driver.

For `pull_request` events the range is `pull_request.base.sha...pull_request.head.sha`. Paths must be valid UTF-8. A path matches a filter when it matches any positive pattern (or the filter has no positive patterns) and matches no negative pattern. Filter results are independent.

For every other event, all configured filters match. The action does not inspect push ranges or working-tree state because its only filtering purpose is to avoid unnecessary pull-request work.

## Operational contract

The checkout must contain both commits and their merge base when applicable; `actions/checkout` with `fetch-depth: 0` is the portable recommendation. The action is read-only and requires no permissions beyond those needed to check out repository contents. Limits are 64 KiB of YAML, 256 filters, 4,096 total patterns, 100,000 changed paths, 32 MiB of diff output, and 60 seconds for the diff.

All invalid or indeterminate states, including non-UTF-8 filenames, fail the action with a diagnostic. This fail-closed rule prevents an incomplete checkout or malformed rule from incorrectly skipping required CI.

## Non-goals

The action does not fetch commits, query pull-request files, evaluate arbitrary predicates, emit per-filter file lists, inspect push ranges, or support working-tree changes. Those behaviors do not contribute to safe pull-request job gating.
