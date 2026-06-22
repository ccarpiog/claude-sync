# CLAUDE-SYNC

**A companion for managing Claude Code profiles and syncing configuration across machines**

> **Fork notice:** claude-sync is a fork of [jean-claude](https://github.com/MikeVeerman/jean-claude) by Mike Veerman. It builds on the original project's profile and Git-syncing features. All credit for the original design goes to the upstream authors — see the [original repository](https://github.com/MikeVeerman/jean-claude) for its history.

## Why?

You've spent hours crafting the perfect `CLAUDE.md`. Your hooks are *chef's kiss*. Your settings are dialed in just right.

Then you sit down at another machine and... nothing. Back to square one. Or you need separate configs for your work and personal Claude accounts, but maintaining them is a pain.

**Claude-sync fixes that.** It manages multiple Claude Code profiles and optionally syncs everything across machines via Git.

## Installation

> **Note:** this fork is **not** published to the npm registry (the `claude-sync`
> package name there belongs to an unrelated project). Install it from GitHub.

Requires **Node 18+** and **git**.

```bash
# Install globally from GitHub (builds automatically on install)
npm install -g github:ccarpiog/claude-sync
```

<details>
<summary>Install from source (for development, or if the one-liner fails)</summary>

```bash
git clone https://github.com/ccarpiog/claude-sync.git
cd claude-sync
npm install        # runs the build via the "prepare" script
npm run build      # (re)compile if needed
npm install -g .   # register the global `claude-sync` command (or: npm link)
```

If you install with `--ignore-scripts`, the `prepare`/build step is skipped and
the `claude-sync` binary won't exist — run `npm run build` manually afterwards.

</details>

Verify the install with `claude-sync --help`.

## Quick Start

```bash
# Initialize claude-sync
claude-sync init

# Create a profile for your work account
claude-sync profile create work

# Launch Claude Code with your work profile
claude-work
```

### Syncing config to a new machine

```bash
# First machine: initialize, then push your config up to a (possibly empty) repo
claude-sync init --sync --url git@github.com:you/claude-config.git
claude-sync sync push

# Other machines: initialize against the same repo, then pull it down
claude-sync init --sync --url git@github.com:you/claude-config.git
claude-sync sync pull
```

> `sync pull` **mirrors** the repo onto `~/.claude`, so it deletes local files
> that aren't in the repo (it lists them and asks first, unless you pass
> `--force`). Rule of thumb: **push from the machine with the changes, pull on
> the others.** When linking a brand-new empty repo, `push` first to populate it
> — don't `pull` onto a machine whose config you want to keep.

## Profiles

Profiles let you run multiple Claude Code configurations side by side — one for your Teams account at work, another for your personal Max subscription, and so on.

```bash
# Create a profile (interactive — prompts for sharing preferences)
claude-sync profile create work

# Create non-interactively
claude-sync profile create work --yes --shell .zshrc

# List your profiles
claude-sync profile list

# Launch Claude Code with a profile
claude-work

# Re-create symlinks if something breaks
claude-sync profile refresh work

# Delete a profile
claude-sync profile delete work
```

### How profiles work

Your main `~/.claude/` stays the source of truth. Profile directories (`~/.claude-<name>/`) are lightweight — they symlink back to your shared files:

| Always shared (symlinked) | Optionally shared         | Profile-specific       |
|---------------------------|---------------------------|------------------------|
| `settings.json`           | `CLAUDE.md`               | Authentication/session |
| `hooks/`                  | `statusline.sh`           |                        |
| `agents/`                 |                            |                        |
| `skills/`                 |                            |                        |
| `commands/`               |                            |                        |
| `plugins/`                |                            |                        |
| `keybindings.json`        |                            |                        |

During profile creation, you're prompted whether to share `CLAUDE.md` and `statusline.sh` or keep them independent per profile. You can also use flags:

```bash
# Share both
claude-sync profile create work --share-claude-md --share-statusline

# Keep both independent
claude-sync profile create work --no-share-claude-md --no-share-statusline
```

Change a setting or add a hook in your main config, and all profiles see it immediately.

Profiles work independently of syncing — you can use them without setting up Git.

## Syncing

Syncing is optional and uses Git to keep your configuration in sync across machines.

### What gets synced?

- `CLAUDE.md` — Your custom instructions
- `settings.json` — Your preferences
- `hooks/` — Your automation scripts
- `skills/` — Your custom skills
- `agents/` — Your custom agents
- `commands/` — Your custom slash commands
- `keybindings.json` — Your keyboard shortcuts
- `statusline.sh` — Your statusline configuration
- `plugins/` manifests — `config.json`, `installed_plugins.json`, and `known_marketplaces.json` only (so a new machine knows what to reinstall; the cloned marketplace repos and caches stay machine-local)
- Profile definitions — So profiles carry over to other machines

### Commands

```bash
# Set up syncing (during init or later)
claude-sync sync setup

# Push your config to Git
claude-sync sync push

# Pull config on another machine
claude-sync sync pull

# Check sync status
claude-sync sync status
```

### Typical workflow

```bash
# Machine 1: Initialize and push
claude-sync init
claude-sync profile create work --yes --shell .zshrc
claude-sync sync push

# Machine 2: Initialize, pull, and go
claude-sync init --sync --url git@github.com:you/claude-config.git
claude-sync sync pull
claude-work  # Profile alias is ready
```

## Command Reference

| Command | Description |
|---------|-------------|
| `claude-sync init` | Initialize claude-sync on this machine |
| `claude-sync init --sync --url <repo>` | Initialize with Git syncing |
| `claude-sync init --no-sync` | Initialize without syncing |
| `claude-sync profile create <name>` | Create a new profile |
| `claude-sync profile list` | List all profiles |
| `claude-sync profile delete <name>` | Delete a profile |
| `claude-sync profile refresh <name>` | Refresh profile symlinks |
| `claude-sync sync setup` | Set up Git-based syncing |
| `claude-sync sync push` | Push config to Git |
| `claude-sync sync pull` | Pull config from Git |
| `claude-sync sync status` | Check sync status |

## Development

### Running Tests

```bash
# Run all tests (unit + integration)
npm test

# Run only unit tests (fast)
npm run test:unit

# Run unit tests in watch mode
npm run test:unit:watch

# Run with coverage report
npm run test:coverage

# Run only integration tests
npm run test:integration
```

#### Unit Tests

Fast, isolated tests for core logic:
- Profile creation, symlinks, and duplicate prevention
- File sync and metadata operations
- Error handling and types
- Utility functions

#### Integration Tests

End-to-end tests that simulate real usage with local git repositories and multiple machines:
- **init**: New repos, existing repos, partial recovery, flag combinations
- **profiles**: Create, list, delete, refresh, duplicate prevention, shared/independent CLAUDE.md and statusline.sh
- **sync setup**: Linking to a Git remote, reconfiguration
- **sync push/pull**: Initial files, modifications, hooks, agents, keybindings, statusline
- **sync status**: Clean state, uncommitted changes, diverged state
- **Multi-machine sync**: Bidirectional sync, three-machine convergence
- **Edge cases**: Empty directories, special characters, large files, concurrent modifications, deprecated command stubs

See [tests/README.md](tests/README.md) for more details.

## Credits

claude-sync is a fork of [jean-claude](https://github.com/MikeVeerman/jean-claude), originally created by Mike Veerman. Many thanks to the original author and contributors for the foundation this project is built on.

---

*Originally named after the famous Belgian martial artist and philosopher, because your config deserves to do the splits between profiles and machines.*
