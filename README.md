# Filter paths

`action-filter-paths` is a small, read-only GitHub Action that answers one question: **which named parts of this pull request changed?** It lets repositories skip irrelevant PR jobs without granting a path-filter action API access or trusting filenames as shell input. On every event other than `pull_request`, all filters are enabled so CI is never accidentally skipped.

```yaml
permissions:
  contents: read

jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      docs: ${{ steps.paths.outputs.docs }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: getsentry/action-filter-paths@<full-commit-sha>
        id: paths
        with:
          filters: |
            docs:
              - docs/**
              - README.md
            backend:
              - src/**
              - '!src/frontend/**'
```

Each named filter becomes a boolean string output, `"true"` or `"false"`. The `changes` output is a JSON array of matching filter names in configuration order. A filter matches when at least one changed path matches an inclusion and no exclusion. A filter containing only exclusions starts from all paths.

```yaml
if: needs.changes.outputs.docs == 'true'
```

## Product behavior

- Pull requests compare the merge base with the PR head (`base...head`), so the answer describes the PR rather than unrelated movement on the base branch.
- Every filter returns `true` on pushes, scheduled workflows, manual runs, and other non-PR events. Path filtering is an optimization for pull requests, never a reason to skip non-PR CI.
- Added, copied, deleted, modified, renamed, type-changed, unmerged, and unknown paths participate. Rename detection is disabled deliberately, causing both the old deletion and new addition to be considered.
- Globs use picomatch syntax, match dotfiles, and are evaluated against UTF-8 repository-relative paths using `/` separators. A non-UTF-8 path fails the action.
- Missing history, malformed configuration, invalid SHAs, oversized input, or a failed `git diff` fails the step. The action never silently changes the result to “everything changed” or “nothing changed.”

See [SPEC.md](SPEC.md) for the normative contract and [SECURITY.md](SECURITY.md) for the threat model.

## Why this action

The action intentionally does not call the GitHub API, execute generated shell, accept abbreviated refs, mutate the checkout, or require a token. Its runtime dependencies are bundled into the committed `dist/index.js`; consumers should pin the action to a full commit SHA.

## Development

```sh
npm install
npm test
npm run build
```

Commit `dist/` whenever runtime code or dependencies change.

## Releasing

Run the **Release** workflow from the GitHub Actions tab on `main` and choose a patch, minor, or major version bump. The workflow calculates the next version from the latest stable release tag, verifies tests and the committed bundle, publishes the corresponding GitHub Release, and advances the `vX` convenience tag. With no existing release, the default minor bump publishes `v0.1.0` and creates `v0`. Consumers with strict supply-chain requirements should always pin the immutable full commit SHA.
