# Filter paths

`action-filter-paths` is a small, read-only GitHub Action that answers one question: **which named parts of this repository changed?** It is designed for repositories that want to skip irrelevant CI jobs without granting a path-filter action API access or trusting filenames as shell input.

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
- Pushes compare the event's `before` and `after` commits (`before..after`). For branch creation or deletion, GitHub's all-zero endpoint is replaced with Git's empty tree. Callers may supply full `base` and `head` SHAs explicitly for other events.
- Added, copied, deleted, modified, renamed, type-changed, unmerged, and unknown paths participate. Rename detection is disabled deliberately, causing both the old deletion and new addition to be considered.
- Globs use picomatch syntax, match dotfiles, and are evaluated against UTF-8 repository-relative paths using `/` separators. A non-UTF-8 path fails the action.
- Missing history, malformed configuration, invalid SHAs, oversized input, or a failed `git diff` fails the step. The action never silently changes the result to “everything changed” or “nothing changed.”

See [SPEC.md](SPEC.md) for the normative contract and [SECURITY.md](SECURITY.md) for the threat model.

## Why this action

The action intentionally does not call the GitHub API, execute generated shell, accept abbreviated refs, mutate the checkout, or require a token. Its runtime dependencies are bundled into the committed `dist/index.js`; consumers should pin the action to a full commit SHA.

## Compatibility with `dorny/paths-filter`

This action supports the common subset used by repositories such as Junior: inline named picomatch globs, a `"true"` or `"false"` output for each filter, and the JSON `changes` output. Migrating that subset requires a full-history checkout and a pinned action reference; existing filter names and positive glob patterns can remain unchanged.

It is not a drop-in replacement for all `dorny/paths-filter@v3` features. It deliberately omits GitHub API and token use, automatic history fetching, branch or tag refs, alternate working directories, filter configuration files, YAML aliases, change-status predicates, per-filter counts and file lists, and predicate quantifiers. Negative patterns use one unambiguous rule: a path must match any inclusion and no exclusion. This differs from dorny's default `some` quantifier when a filter mixes positive and negative rules.

## Development

```sh
npm install
npm test
npm run build
```

Commit `dist/` whenever runtime code or dependencies change.

## Releasing

From a clean, up-to-date `main` checkout, run `scripts/release.sh X.Y.Z`. The script verifies tests and the committed bundle before pushing `vX.Y.Z`. The release workflow verifies it again, publishes a GitHub Release, and advances the `vX` convenience tag. Consumers with strict supply-chain requirements should always pin the immutable full commit SHA.
