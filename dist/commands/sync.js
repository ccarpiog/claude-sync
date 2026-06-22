import { Command } from 'commander';
import fs from 'fs-extra';
import os from 'os';
import chalk from 'chalk';
import { logger, formatPath } from '../utils/logger.js';
import { getConfigPaths } from '../lib/paths.js';
import { isGitRepo, getGitStatus, commitAndPush, pull, hasMergeConflicts, resetHard, cleanUntracked } from '../lib/git.js';
import { syncFromClaudeConfig, syncToClaudeConfig, updateLastSync, compareFiles, readMetaJson } from '../lib/sync.js';
import { setupGitSync } from '../lib/sync-setup.js';
import { confirm } from '../utils/prompts.js';
import { ClaudeSyncError, ErrorCode } from '../types/index.js';
function generateCommitMessage() {
    const hostname = os.hostname();
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    return `Update from ${hostname} at ${timestamp}`;
}
const syncSetupCommand = new Command('setup')
    .description('Set up Git-based syncing for your configuration')
    .option('--url <repo-url>', 'Repository URL (skip interactive prompt)')
    .action(async (options) => {
    const { claudeSyncDir } = getConfigPaths();
    if (!fs.existsSync(claudeSyncDir)) {
        throw new ClaudeSyncError('claude-sync is not initialized', ErrorCode.NOT_INITIALIZED, 'Run "claude-sync init" first.');
    }
    await setupGitSync(claudeSyncDir, options.url);
    console.log('');
    logger.dim('Next steps:');
    logger.list([
        'Run "claude-sync sync push" to push your config to Git',
        'Run "claude-sync sync pull" on other machines to sync',
    ]);
});
export async function handleSyncPush() {
    const { claudeSyncDir, claudeConfigDir } = getConfigPaths();
    // Verify initialized
    if (!fs.existsSync(claudeSyncDir)) {
        throw new ClaudeSyncError('claude-sync is not initialized', ErrorCode.NOT_INITIALIZED, 'Run "claude-sync init" first.');
    }
    if (!(await isGitRepo(claudeSyncDir))) {
        throw new ClaudeSyncError(`${formatPath(claudeSyncDir)} is not a Git repository`, ErrorCode.NOT_GIT_REPO, 'Run "claude-sync sync setup" to configure syncing.');
    }
    // Step 1: Copy files from ~/.claude to ~/.claude-sync
    logger.step(1, 2, `Syncing from ${formatPath(claudeConfigDir)}...`);
    const syncResults = await syncFromClaudeConfig(claudeConfigDir, claudeSyncDir);
    const synced = syncResults.filter((r) => r.action !== 'skipped');
    if (synced.length > 0) {
        synced.forEach((r) => {
            console.log(`  ${chalk.blue('synced')}  ${r.file}`);
        });
    }
    // Step 2: Check git status
    const gitStatus = await getGitStatus(claudeSyncDir);
    if (gitStatus.isClean) {
        logger.success('Nothing to push - everything is in sync.');
        return;
    }
    // Show changes
    logger.dim('Changes to push:');
    if (gitStatus.modified.length > 0) {
        gitStatus.modified.forEach((f) => {
            console.log(`  ${chalk.yellow('modified')}  ${f}`);
        });
    }
    if (gitStatus.untracked.length > 0) {
        gitStatus.untracked.forEach((f) => {
            console.log(`  ${chalk.green('new file')}  ${f}`);
        });
    }
    // Commit message
    const commitMessage = generateCommitMessage();
    // Commit and push
    logger.step(2, 2, 'Committing and pushing...');
    const result = await commitAndPush(claudeSyncDir, commitMessage, true);
    // Update last sync
    await updateLastSync(claudeSyncDir);
    // Summary
    console.log('');
    if (result.committed) {
        logger.success('Changes committed');
    }
    if (result.pushed) {
        logger.success('Pushed to remote');
    }
    else if (!gitStatus.remote) {
        logger.warn('No remote configured - changes committed locally only');
        logger.dim(`Add a remote with: git -C ${formatPath(claudeSyncDir)} remote add origin <url>`);
    }
}
const syncPushCommand = new Command('push')
    .description('Commit and push config changes to Git')
    .action(handleSyncPush);
export async function handleSyncPull(options = {}) {
    const { claudeSyncDir, claudeConfigDir } = getConfigPaths();
    // Verify initialized
    if (!fs.existsSync(claudeSyncDir)) {
        throw new ClaudeSyncError('claude-sync is not initialized', ErrorCode.NOT_INITIALIZED, 'Run "claude-sync init" first.');
    }
    if (!(await isGitRepo(claudeSyncDir))) {
        throw new ClaudeSyncError(`${formatPath(claudeSyncDir)} is not a Git repository`, ErrorCode.NOT_GIT_REPO, 'Run "claude-sync sync setup" to configure syncing.');
    }
    // Check if remote is configured
    const gitStatus = await getGitStatus(claudeSyncDir);
    if (!gitStatus.remote) {
        throw new ClaudeSyncError('No remote configured', ErrorCode.NO_REMOTE, 'Run "claude-sync sync setup" to set up a remote repository.');
    }
    // Warn about uncommitted changes before discarding
    const hasChanges = gitStatus.modified.length > 0 || gitStatus.untracked.length > 0;
    if (hasChanges && !options.force) {
        logger.warn('Uncommitted local changes will be discarded:');
        gitStatus.modified.forEach(f => console.log(`  ${chalk.yellow('modified')}  ${f}`));
        gitStatus.untracked.forEach(f => console.log(`  ${chalk.green('untracked')}  ${f}`));
        console.log('');
        const proceed = await confirm('Discard these changes and pull?', false);
        if (!proceed) {
            logger.dim('Pull cancelled. Commit or back up your changes first.');
            return;
        }
    }
    // Reset any local changes, clean untracked files, and pull
    logger.step(1, 2, 'Pulling from Git...');
    await resetHard(claudeSyncDir);
    await cleanUntracked(claudeSyncDir);
    const pullResult = await pull(claudeSyncDir);
    logger.success(pullResult.message);
    // Check for merge conflicts (shouldn't happen after reset, but just in case)
    if (await hasMergeConflicts(claudeSyncDir)) {
        throw new ClaudeSyncError('Merge conflicts detected', ErrorCode.MERGE_CONFLICT, `Resolve conflicts in ${formatPath(claudeSyncDir)} and run pull again.`);
    }
    // Preview the apply (dry run) to surface local files that the mirror will
    // delete because they are absent from the synced repo. These include files
    // removed upstream AND local-only files that were never pushed, so warn before
    // touching ~/.claude — the earlier confirmation only covered the repo's git
    // state, not the live config.
    const preview = await syncToClaudeConfig(claudeSyncDir, claudeConfigDir, true);
    const deletions = preview.filter((r) => r.action === 'deleted');
    const hasIncomingContent = preview.some((r) => r.action === 'created' || r.action === 'updated');
    if (deletions.length > 0) {
        // If the synced repo has nothing to apply (only deletions), it is almost
        // certainly an empty/blank repo and the user meant to PUSH from this machine
        // rather than pull — pulling would wipe the local config. Flag that clearly.
        if (!hasIncomingContent) {
            logger.warn('The synced repository has no configuration to apply — it looks empty.');
            logger.dim('If this is a fresh repo, run "claude-sync sync push" from this machine to populate it instead.');
            console.log('');
        }
        logger.warn(`${deletions.length} local item(s) will be deleted (absent from the synced repo):`);
        deletions.forEach((d) => console.log(`  ${chalk.red('-')} ${d.file}`));
        console.log('');
        if (!options.force) {
            const proceed = await confirm('Delete these local files and apply?', false);
            if (!proceed) {
                logger.dim('Applied to the repo but not to your config. Re-run "claude-sync sync pull" to apply.');
                return;
            }
        }
    } // End of the local-deletion warning block
    // Apply to ~/.claude
    logger.step(2, 2, `Applying to ${formatPath(claudeConfigDir)}...`);
    const results = await syncToClaudeConfig(claudeSyncDir, claudeConfigDir);
    const applied = results.filter((r) => r.action !== 'skipped');
    // Update last sync time
    await updateLastSync(claudeSyncDir);
    // Summary
    console.log('');
    logger.success(`Applied ${applied.length} file(s)`);
    applied.forEach((r) => {
        const icon = r.action === 'created' ? chalk.green('+') : chalk.yellow('~');
        console.log(`  ${icon} ${r.file}`);
    });
}
const syncPullCommand = new Command('pull')
    .description('Pull latest config from Git and apply to Claude Code')
    .option('--force', 'Skip confirmation when discarding local changes')
    .action((options) => handleSyncPull(options));
export async function handleSyncStatus() {
    const { claudeSyncDir, claudeConfigDir } = getConfigPaths();
    // Verify initialized
    if (!fs.existsSync(claudeSyncDir)) {
        throw new ClaudeSyncError('claude-sync is not initialized', ErrorCode.NOT_INITIALIZED, 'Run "claude-sync init" first.');
    }
    const isRepo = await isGitRepo(claudeSyncDir);
    const gitStatus = isRepo ? await getGitStatus(claudeSyncDir) : null;
    const meta = await readMetaJson(claudeSyncDir);
    const fileComparison = await compareFiles(claudeSyncDir, claudeConfigDir);
    // Pretty output
    logger.heading('claude-sync Status');
    console.log('');
    logger.table([
        ['Repository', formatPath(claudeSyncDir)],
        ['Claude Config', formatPath(claudeConfigDir)],
        ['Platform', meta?.platform || 'unknown'],
    ]);
    // Git status
    console.log('');
    logger.dim('Git Status');
    if (!isRepo) {
        console.log(`  ${chalk.red('✗')} Not a Git repository`);
        logger.dim('  Run "claude-sync sync setup" to enable syncing.');
    }
    else if (gitStatus) {
        console.log(`  ${chalk.dim('Branch:')}  ${gitStatus.branch || 'unknown'}`);
        console.log(`  ${chalk.dim('Remote:')}  ${gitStatus.remote || chalk.yellow('none')}`);
        if (gitStatus.isClean) {
            console.log(`  ${chalk.green('✓')} Working tree clean`);
        }
        else {
            console.log(`  ${chalk.yellow('!')} ${gitStatus.modified.length + gitStatus.untracked.length} uncommitted change(s)`);
        }
        if (gitStatus.ahead > 0) {
            console.log(`  ${chalk.blue('↑')} ${gitStatus.ahead} commit(s) ahead`);
        }
        if (gitStatus.behind > 0) {
            console.log(`  ${chalk.yellow('↓')} ${gitStatus.behind} commit(s) behind`);
        }
    }
    // File sync status
    console.log('');
    logger.dim(isRepo ? 'Sync Status' : 'File Status');
    fileComparison.forEach((c) => {
        let status;
        let icon;
        if (!c.sourceExists) {
            status = chalk.dim('not configured');
            icon = chalk.dim('-');
        }
        else if (!c.targetExists) {
            status = chalk.yellow('not applied');
            icon = chalk.yellow('!');
        }
        else if (c.inSync) {
            status = chalk.green('in sync');
            icon = chalk.green('✓');
        }
        else {
            status = chalk.yellow('differs');
            icon = chalk.yellow('!');
        }
        console.log(`  ${icon} ${c.mapping.source.padEnd(15)} ${chalk.dim('→')} ${c.mapping.target.padEnd(15)} ${status}`);
    });
    // Last sync
    if (meta?.lastSync) {
        console.log('');
        logger.dim(`Last sync: ${new Date(meta.lastSync).toLocaleString()}`);
    }
}
const syncStatusCommand = new Command('status')
    .description('Show sync status')
    .action(handleSyncStatus);
export const syncCommand = new Command('sync')
    .description('Manage Git-based syncing of your configuration')
    .addCommand(syncSetupCommand)
    .addCommand(syncPushCommand)
    .addCommand(syncPullCommand)
    .addCommand(syncStatusCommand);
//# sourceMappingURL=sync.js.map