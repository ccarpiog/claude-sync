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
export declare function migrateLegacyShellMarkers(): Promise<string[]>;
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
export declare function migrateLegacyLayout(claudeConfigDir: string, claudeSyncDir: string): Promise<MigrationResult>;
//# sourceMappingURL=migrate.d.ts.map