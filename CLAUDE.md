# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

claude-sync is a CLI that manages multiple Claude Code **profiles** and optionally **syncs** Claude Code configuration across machines via Git. It is a fork of [jean-claude](https://github.com/MikeVeerman/jean-claude) by Mike Veerman.

**Naming note:** the original `jean-claude` name has been fully renamed to `claude-sync` throughout — branding *and* code (CLI program name, `ClaudeSyncError`, `getClaudeSyncDir`, the managed `.claude-sync/` directory, etc.). The only remaining `jean-claude` references are deliberate upstream attribution (in `README.md`, `package.json`, and this file's links to the original repo). When adding new identifiers, use the `claude-sync` / `ClaudeSync` / `claudeSync` forms.

## Commands

```bash
npm run build              # Compile TS → dist/ (tsc -p tsconfig.build.json)
npm run dev -- <args>      # Run CLI from source without building (tsx src/index.ts)
npm run lint               # eslint src
npm run lint:fix

npm test                   # Unit + integration (full suite)
npm run test:unit          # Vitest unit tests only (fast)
npm run test:unit:watch
npm run test:coverage
npm run test:integration   # Bash end-to-end suite (./test-integration.sh)

# Run a single unit test file / test by name
npx vitest run tests/unit/lib/sync.test.ts
npx vitest run -t "creates a profile"
```

Node 22 is pinned via `mise.toml`. The codebase is **ESM** (`"type": "module"`, `module: NodeNext`): relative imports in `.ts` source must use `.js` extensions (e.g. `import { run } from './cli.js'`).

## Architecture

The CLI entry is `src/index.ts` → `src/cli.ts`. `createProgram()` wires up three top-level Commander commands — `init`, `sync`, `profile` — plus hidden, deprecated `pull`/`push`/`status` stubs that print a warning and delegate to their `sync ...` equivalents. `run()` is the single global error boundary: it catches `ClaudeSyncError` and prints `message` + `suggestion`, lets Commander's help/version "errors" exit cleanly, and shows generic errors (full stack only when `DEBUG=1`).

**Two directories, two mechanisms.** The whole tool revolves around two locations resolved in `src/lib/paths.ts`:

- `~/.claude/` (or XDG `claude-code/`) — the live Claude Code config, the **source of truth**. `detectClaudeConfigDir()`.
- `~/.claude/.claude-sync/` — a Git repository (a hidden subdir of the config dir) that mirrors a subset of that config for syncing. `getClaudeSyncDir()`.

These back two largely independent features:

1. **Sync** (`src/lib/sync.ts`, `src/commands/sync.ts`) — copies files between `~/.claude/` and the `.claude-sync/` git repo, driven by the `FILE_MAPPINGS` list.
   - `sync push`: `syncFromClaudeConfig` copies `~/.claude/` → `.claude-sync/`, then commits & pushes (`src/lib/git.ts`).
   - `sync pull`: **`resetHard` + `cleanUntracked` + `git pull`** (local changes in the repo are discarded, not merged), then `syncToClaudeConfig` copies `.claude-sync/` → `~/.claude/`. This destructive reset is intentional — `--force` skips the confirmation prompt.
   - `meta.json` (`createMetaJson`/`readMetaJson`) tracks `lastSync`, machine id, and platform inside `.claude-sync/`.

2. **Profiles** (`src/lib/profiles.ts`, `src/commands/profile.ts`) — lets several Claude configs coexist. A profile lives in `~/.claude-<name>/` and **symlinks** the `SHARED_ITEMS` (settings.json, hooks/, agents/, skills/, commands/, plugins/, keybindings.json) back to `~/.claude/`, so edits to the main config propagate instantly. A `claude-<name>` shell alias (written into `.zshrc`/`.bashrc`) launches Claude Code with `CLAUDE_CONFIG_DIR` pointed at the profile dir. `profiles.json` (in `.claude-sync/`) is the registry.

**The two lists don't match, by design** (`SHARED_ITEMS` in `profiles.ts`, `FILE_MAPPINGS` in `sync.ts`) — keep both in mind whenever changing what's managed:
- `CLAUDE.md` and `statusline.sh` are synced (`FILE_MAPPINGS`) but **not** symlinked (`SHARED_ITEMS`). For profiles they are *optionally* shared via `--share-claude-md` / `--share-statusline`; otherwise each profile gets an independent copy.
- `plugins/` is symlinked **whole** (so all profiles on a machine share installed plugins) but only its **manifest files** (`plugins/config.json`, `plugins/installed_plugins.json`, `plugins/known_marketplaces.json`) are synced across machines — the cloned marketplace repos and caches under `plugins/` are machine-local installed artifacts, like `node_modules`. Note `FILE_MAPPINGS` entries can be nested file paths (e.g. `plugins/config.json`), not just top-level names.

**Errors:** throw `ClaudeSyncError(message, ErrorCode, suggestion?)` (`src/types/index.ts`) rather than bare `Error` — the suggestion is surfaced to the user by the central handler. Platform support is macOS/Linux only (`detectPlatform`).

## Testing layout

- `tests/unit/**/*.test.ts` — Vitest, mocked filesystem/git. This is the `include` glob; only these run as unit tests.
- `test-integration.sh` and `tests/e2e/*.sh` — Bash end-to-end tests that exercise real git repos and simulate multiple machines (init, profiles, push/pull, multi-machine convergence, edge cases). `lib/git.ts`, `lib/paths.ts`, and the command handlers are covered here rather than in unit tests. See `tests/README.md`.
