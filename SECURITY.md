# Security policy and threat model

## Threat model

On pull requests, filenames and repository contents may be attacker-controlled. Filter configuration and workflow code are trusted because GitHub executes the base repository's workflow for ordinary fork pull requests. The action therefore treats valid UTF-8 paths as data and never evaluates them as shell, expressions, YAML, or command options. Non-UTF-8 paths fail closed. Non-PR events do not inspect changed paths and conservatively enable every filter.

Controls include full-SHA validation, direct process spawning, a fixed Git argument vector, NUL-delimited output, bounded configuration and subprocess output, a timeout, disabled YAML aliases, no network/API access, no credential requirement, and fail-closed errors. Dependency versions are exact and the distributable is committed for review.

Consumers should grant only `contents: read`, set `persist-credentials: false`, and pin this action and checkout to full commit SHAs. They should not interpolate outputs into shell commands without normal shell-safe handling.

## Repository controls

Maintainers should enable immutable GitHub Releases, protect release and major-version tags, require review for changes to `action.yml`, `dist/`, release tooling, and workflows, and enable private vulnerability reporting. GitHub organization or repository policy should require full-length commit SHA pins where practical. These settings are enforced by GitHub rather than files in this repository.

## Reporting vulnerabilities

Please report suspected vulnerabilities privately through GitHub's security advisory interface rather than opening a public issue.
