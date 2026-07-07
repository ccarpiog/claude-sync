# Upstream sync log

This fork (`claude-sync`) tracks the original [jean-claude](https://github.com/MikeVeerman/jean-claude)
by Mike Veerman. Because `claude-sync` fully renamed jean-claude → claude-sync
(branding *and* code), we do **not** merge upstream directly — every upstream
change is reviewed and, if wanted, cherry-picked with naming adapted to the
`claude-sync` / `ClaudeSync` / `claudeSync` forms.

## How to do the weekly review

```bash
# One-time: add the upstream remote (skip if already present)
git remote add upstream https://github.com/MikeVeerman/jean-claude.git

git fetch upstream
# List upstream commits we have NOT yet reviewed (everything past the watermark):
git log --oneline <last-reviewed-sha>..upstream/master
```

Review only the commits above the watermark, decide adopt/skip for each, adapt
naming when adopting, then bump the **watermark** below to the new
`upstream/master` tip and append a row to the log.

## Watermark

- **Reviewed upstream/master up to:** `e0f2ebf` (tip as of 2026-07-07)
- **Merge-base with our `main`:** `39a780b`
- Anything in `git log e0f2ebf..upstream/master` is new and still needs review.

## Reviewed commits

### 2026-07-07 — reviewed `39a780b..e0f2ebf` (5 commits)

| Upstream commit | Summary | Decision |
| --- | --- | --- |
| `e0f2ebf` | Merge PR #73 (portable-tilde-paths-v2) | **Adopted** (Feature 1) |
| `5f2d9ee` | Address review feedback: dedicated path helpers, boundary fix, tests | **Adopted** (Feature 1) |
| `2d669a5` | feat: use portable `~` paths in config files for cross-machine sync | **Adopted** (Feature 1) |
| `c7d9baa` | Merge PR #72 (reconcile divergent branches on `sync pull`) | **Skipped** (Feature 2) |
| `ddfd505` | fix(sync): reconcile divergent branches on `sync pull` | **Skipped** (Feature 2) |

**Feature 1 — portable `~` paths (adopted):** cherry-picked as the net effect
(not a raw merge) into `paths.ts` (`expandPath`/`contractPath`), `logger.ts`
(`formatPath` delegates to `contractPath`), `profiles.ts` (`profiles.json`),
and `sync.ts` (`meta.json`). Config files now store `~`-relative paths so they
are portable across machines with different usernames.

**Feature 2 — reconcile divergent branches on `sync pull` (skipped):** upstream
switched `sync pull` to `git pull --rebase` because their bare `git pull`
aborted on divergent history. Our fork already sidesteps that entirely — `sync
pull` does `resetHard` + `cleanUntracked` + `git pull` (the mirror strategy).
Adopting the rebase approach would partially undo that intentional design, so
we deliberately did not take it. Re-evaluate only if our pull strategy changes.
