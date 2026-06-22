# TODO

Deferred work, captured for a future session. Nothing here is a regression from
recent changes — these are pre-existing limitations in the original sync model
that surfaced during review and are worth fixing together.

## Make cross-machine sync converge (deletions + dirty-state)

The sync direction is asymmetric: **push** (`syncFromClaudeConfig`) mirrors and
propagates deletions, but **pull** (`syncToClaudeConfig`) only overwrites and
never deletes. As a result, a file/command/manifest deleted on one machine
reappears (stays) on every other machine after pull. `sync status` is also blind
to changes inside directories. This affects every directory mapping
(`hooks/`, `skills/`, `agents/`, `commands/`) and the plugin manifests.

### 1. Pull does not delete files removed upstream — `src/lib/sync.ts` (~line 144)

In `syncToClaudeConfig`, when a mapping's source does not exist it pushes a
`skipped` result and `continue`s, leaving any stale local copy in place.

- [ ] When `sourcePath` is missing but `targetPath` exists, remove the target
      and record a `deleted` action (mirror the logic already in
      `syncFromClaudeConfig`, which handles this correctly).
- [ ] Applies to both file mappings (e.g. `plugins/*.json` manifests,
      `CLAUDE.md`, `settings.json`) and directory mappings.

### 2. Pull merges directories instead of mirroring — `src/lib/sync.ts` (~line 154)

`syncToClaudeConfig` copies directories with `{ overwrite: true }` without
removing the target first, so files deleted upstream survive locally.

- [ ] For `type === 'directory'`, remove the target dir before copying (mirror
      semantics), matching what `syncFromClaudeConfig` does (~line 231).
- [ ] Caution: this is destructive on the **local** `~/.claude` side. Confirm
      the existing `sync pull` confirmation/`--force` flow adequately covers it,
      and that profile **symlinks** under `~/.claude/<dir>` are not blown away
      (these dirs are real in `~/.claude`, but verify the interaction).

### 3. `sync status` always reports directories as "in sync" — `src/lib/sync.ts` (~line 97), surfaced in `src/commands/sync.ts` (~line 261)

`compareFiles` short-circuits directory mappings to `inSync: true` whenever both
sides exist, regardless of contents.

- [ ] Recurse directory mappings and hash/compare the file set (added, removed,
      changed) so `status` reflects real drift for `hooks/`, `skills/`,
      `agents/`, `commands/`.
- [ ] Keep it reasonably cheap (these dirs can be large, e.g. nested skills).

### Tests to add alongside the fixes

- [ ] Pull deletes a file that was removed from the synced repo.
- [ ] Pull mirrors a directory (removes locally-deleted-upstream entries).
- [ ] `sync status` detects an added/removed/changed file inside a directory
      mapping.
- [ ] Round-trip convergence: delete on machine A, push, pull on machine B,
      assert B no longer has the entry (extend `test-integration.sh`).
