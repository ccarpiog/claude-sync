# TODO

Deferred work, captured for a future session. Nothing here is a regression from
recent changes — these are pre-existing limitations in the original sync model
that surfaced during review and are worth fixing together.

## Make cross-machine sync converge (deletions + dirty-state)

The sync direction was asymmetric: **push** (`syncFromClaudeConfig`) mirrors and
propagates deletions, but **pull** (`syncToClaudeConfig`) only overwrote and
never deleted. As a result, a file/command/manifest deleted on one machine
reappeared (stayed) on every other machine after pull. `sync status` was also
blind to changes inside directories. This affected every directory mapping
(`hooks/`, `skills/`, `agents/`, `commands/`) and the plugin manifests.

**Status:** the three production fixes plus their unit tests are **done**
(commit on `master`). Only the end-to-end round-trip integration test remains.

### 1. Pull does not delete files removed upstream — `src/lib/sync.ts` ✅ DONE

In `syncToClaudeConfig`, when a mapping's source does not exist it pushed a
`skipped` result and `continue`d, leaving any stale local copy in place.

- [x] When `sourcePath` is missing but `targetPath` exists, remove the target
      and record a `deleted` action (mirrors the logic in
      `syncFromClaudeConfig`). All mutations gated behind `!dryRun`; the result
      is still recorded so a dry run reports what would happen.
- [x] Applies to both file mappings (e.g. `plugins/*.json` manifests,
      `CLAUDE.md`, `settings.json`) and directory mappings.

### 2. Pull merges directories instead of mirroring — `src/lib/sync.ts` ✅ DONE

`syncToClaudeConfig` copied directories with `{ overwrite: true }` without
removing the target first, so files deleted upstream survived locally.

- [x] For `type === 'directory'`, remove the target dir before copying (mirror
      semantics), matching `syncFromClaudeConfig`. Per-file `created`/`updated`
      state is captured **before** removal; files present locally but absent
      upstream are now reported as per-file `deleted` actions (in real and dry
      runs).
- [x] Destructiveness is covered by the existing `sync pull` confirmation /
      `--force` flow. Symlink safety: `fs.remove` on a symlink removes the link
      itself (not its referent), so profile symlinks pointing into these dirs
      are unaffected; the dirs in `~/.claude` are real and become exact mirrors.

### 3. `sync status` always reports directories as "in sync" — `src/lib/sync.ts` ✅ DONE

`compareFiles` short-circuited directory mappings to `inSync: true` whenever both
sides existed, regardless of contents.

- [x] `compareFiles` is now async and recurses directory mappings via the new
      `directoriesInSync` helper, so `status` reflects real drift for `hooks/`,
      `skills/`, `agents/`, `commands/`. The one caller in `commands/sync.ts`
      now awaits it.
- [x] Cheap-but-correct: compares the sorted relative-path sets first (a set
      mismatch proves divergence with no hashing), then hashes only the shared
      files.

### Tests to add alongside the fixes

- [x] Pull deletes a file that was removed from the synced repo.
- [x] Pull mirrors a directory (removes locally-deleted-upstream entries) and
      reports the removal as a per-file `deleted` action.
- [x] `compareFiles` detects an added file inside a directory mapping and
      reports `inSync` for identical contents.
- [x] A dry-run pull records `deleted` actions (file + directory mirror) without
      touching the filesystem.
- [x] Round-trip convergence: delete on machine A, push, pull on machine B,
      assert B no longer has the entry. Added `test_deletion_convergence` (plus
      an `assert_file_not_exists` helper) to `test-integration.sh`. It keeps a
      second file in `skills/` so the dir stays non-empty (git ignores empty
      dirs) and asserts the deleted file is present on M2 *before* deletion so
      the absence check can't pass trivially.

### Test fallout fixed by the convergence change

- [x] `test_concurrent_modifications` in `test-integration.sh` was passing only
      because of the old skip-on-missing bug: it relied on an un-pushed local
      `settings.json` surviving a `sync pull --force`. Under mirror-on-pull that
      local-only file is correctly deleted. Rewrote the test to validate genuine
      convergence (shared baseline → divergent edits to different files → push
      each, relying on push's `git pull --rebase` to merge → pull → assert both
      edits present on both machines). The `sync.ts` fix was **not** weakened.

## Follow-up: warn before pull deletes local-only files (safety)

Surfaced by Codex while reviewing the convergence change. `sync pull` now
mirrors the repo onto `~/.claude`, so a file that exists locally but was **never
pushed** is permanently deleted on pull. The existing pull confirmation prompt
(`src/commands/sync.ts` ~line 152) only warns about the **sync repo's** dirty
git state — it does not mention local-only files under `~/.claude` that the
mirror will remove.

- [ ] Before applying the mirror, compute the set of local-only files that would
      be deleted (run `syncToClaudeConfig` with `dryRun` and collect `deleted`
      results) and, when not `--force`, show a count + representative paths and
      require confirmation.
- [ ] At minimum, update the prompt copy to state that un-pushed files under
      `~/.claude` may be permanently deleted.
