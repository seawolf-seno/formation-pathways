#!/usr/bin/env bash
# Build a Vercel preview (staging data) of a contributor's PR, for seno.
#
# Vercel builds previews only for commits by team members with a Developer
# seat. Contributors are Viewers, so their PRs get no preview of their own.
# This puts the PR's code on a branch `preview/pr-<n>` in this repo with one
# empty commit by you on top. Vercel then builds it as yours, against the
# staging database (Preview has only the staging settings, no secrets).
#
# READ THE PR'S DIFF FIRST: you are deploying their code under your name.
#
#   scripts/preview-pr.sh 57        # build / rebuild the preview
#   scripts/preview-pr.sh 57 --done # delete the preview branch afterwards
set -euo pipefail

n="${1:?usage: scripts/preview-pr.sh <PR number> [--done]}"
branch="preview/pr-$n"

if [[ "${2:-}" == "--done" ]]; then
  git push origin --delete "$branch"
  exit 0
fi

state=$(gh pr view "$n" --json state -q .state)
[[ "$state" == "OPEN" ]] || { echo "PR #$n is $state, not open." >&2; exit 1; }

tmp=$(mktemp -d)
trap 'git worktree remove --force "$tmp" >/dev/null 2>&1 || true' EXIT
git fetch --quiet origin "pull/$n/head"
git worktree add --quiet --detach "$tmp" FETCH_HEAD
git -C "$tmp" commit --quiet --allow-empty -m "Preview of #$n (built by $(git config user.name))"
git -C "$tmp" push --quiet --force origin "HEAD:refs/heads/$branch"
sha=$(git -C "$tmp" rev-parse HEAD)

echo "Pushed $branch ($sha). Waiting for Vercel…"
for _ in $(seq 1 60); do
  url=$(gh api "repos/{owner}/{repo}/deployments?sha=$sha" -q '.[0].statuses_url' 2>/dev/null || true)
  if [[ -n "$url" ]]; then
    env_url=$(gh api "$url" -q '[.[] | select(.state == "success")][0].environment_url // empty' 2>/dev/null || true)
    if [[ -n "$env_url" ]]; then
      echo "Preview: $env_url"
      gh pr comment "$n" --body "Preview on staging (fictional data), built from this PR by @$(gh api user -q .login): $env_url"
      exit 0
    fi
  fi
  sleep 10
done
echo "Still building. Find it under Deployments → $branch on Vercel, or rerun this later." >&2
