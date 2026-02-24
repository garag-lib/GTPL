#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <version>"
  echo "Example: $0 1.1.4"
}

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  usage
  exit 1
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Error: invalid version '$VERSION'"
  echo "Expected something like: 1.1.4 or 1.1.4-rc.1"
  exit 1
fi

TAG="v${VERSION}"
BRANCH="$(git branch --show-current)"
REMOTE_URL="$(git remote get-url origin)"
REPO_WEB_URL="${REMOTE_URL%.git}"
REPO_WEB_URL="${REPO_WEB_URL/git@github.com:/https://github.com/}"

if [[ "$BRANCH" != "main" ]]; then
  echo "Error: you are on branch '$BRANCH'. Switch to 'main' first."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree is not clean. Commit/stash your changes first."
  exit 1
fi

if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  echo "Error: local tag '${TAG}' already exists."
  exit 1
fi

if git ls-remote --tags origin "refs/tags/${TAG}" | grep -q "${TAG}$"; then
  echo "Error: remote tag '${TAG}' already exists."
  exit 1
fi

echo "==> Running tests"
npm test

echo "==> Building dist"
npm run build

echo "==> Bumping package version to ${VERSION}"
npm version "${VERSION}" --no-git-tag-version

echo "==> Committing version bump"
git add package.json package-lock.json
if git diff --cached --quiet; then
  echo "Error: no changes staged after version bump."
  exit 1
fi
git commit -m "chore(release): bump version to ${VERSION}"

echo "==> Pushing main"
git push origin main

echo "==> Creating and pushing tag ${TAG}"
git tag "${TAG}"
git push origin "${TAG}"

echo
echo "Done."
echo "Next step: publish the GitHub Release for ${TAG}:"
echo "${REPO_WEB_URL}/releases/new?tag=${TAG}"
echo
echo "When the release is published, the workflow will upload compiled dist assets (.zip/.tar.gz)."
