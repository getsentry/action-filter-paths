#!/usr/bin/env bash

set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "usage: scripts/release.sh X.Y.Z" >&2
  exit 1
fi

tag="v$version"
branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "releases must be created from main, not $branch" >&2
  exit 1
fi

git fetch origin main --tags
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "main must be up to date with origin/main" >&2
  exit 1
fi
if git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null; then
  echo "$tag already exists" >&2
  exit 1
fi

npm ci
npm run check
if [[ -n "$(git status --porcelain)" ]]; then
  echo "working tree must be clean and dist/index.js must be current" >&2
  exit 1
fi

git tag --annotate "$tag" --message "$tag"
git push origin "refs/tags/$tag"
