import fs from 'fs-extra';
import path from 'path';
import os from 'os';

/**
 * Filesystem markers left behind by the pre-rename "jean-claude" releases.
 * The managed config repo lived in `.jean-claude`, and each profile alias was
 * tagged in the shell rc file with a `# jean-claude profile:` comment. The alias
 * command lines themselves are unchanged by the rename (they were always
 * `claude-<name>`), so only the comment marker needs rewriting.
 */
const LEGACY_DIR_NAME = '.jean-claude';
const LEGACY_PROFILE_MARKER = '# jean-claude profile:';
const PROFILE_MARKER = '# claude-sync profile:';
const SHELL_CONFIG_FILES = ['.zshrc', '.bashrc', '.bash_profile'];

export interface MigrationResult {
  movedDir: boolean;
  updatedShellFiles: string[];
}

/**
 * Rewrites stale `# jean-claude profile:` alias markers in the user's shell rc
 * files to the current `# claude-sync profile:` marker, so the alias
 * install/remove logic can find and manage them. The alias lines below each
 * marker are left untouched because they are already correct.
 * @returns the names of the shell config files that were updated
 */
export async function migrateLegacyShellMarkers(): Promise<string[]> {
  const home = os.homedir();
  const updated: string[] = [];

  for (const file of SHELL_CONFIG_FILES) {
    const rcPath = path.join(home, file);
    if (!(await fs.pathExists(rcPath))) {
      continue;
    }
    const content = await fs.readFile(rcPath, 'utf-8');
    if (!content.includes(LEGACY_PROFILE_MARKER)) {
      continue;
    }
    const rewritten = content.split(LEGACY_PROFILE_MARKER).join(PROFILE_MARKER);
    await fs.writeFile(rcPath, rewritten);
    updated.push(file);
  }

  return updated;
} // End of migrateLegacyShellMarkers()

/**
 * One-time migration from the legacy "jean-claude" layout to "claude-sync".
 * Moves the `.jean-claude` config repo to `.claude-sync` (only when the new
 * location does not already exist, so it never clobbers a real repo) and
 * rewrites stale shell alias markers. Safe to call on every `init`: it is a
 * no-op once there is nothing left to migrate.
 * @param claudeConfigDir the resolved Claude config dir (e.g. `~/.claude`)
 * @param claudeSyncDir the target managed dir (e.g. `~/.claude/.claude-sync`)
 * @returns what was migrated, for reporting to the user
 */
export async function migrateLegacyLayout(
  claudeConfigDir: string,
  claudeSyncDir: string
): Promise<MigrationResult> {
  const result: MigrationResult = { movedDir: false, updatedShellFiles: [] };

  const legacyDir = path.join(claudeConfigDir, LEGACY_DIR_NAME);
  if ((await fs.pathExists(legacyDir)) && !(await fs.pathExists(claudeSyncDir))) {
    await fs.move(legacyDir, claudeSyncDir);
    result.movedDir = true;
  }

  result.updatedShellFiles = await migrateLegacyShellMarkers();

  return result;
} // End of migrateLegacyLayout()
