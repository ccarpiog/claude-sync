import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger.js';
import { confirm, input } from '../utils/prompts.js';
import { isGitRepo, createGit, initRepo, addRemote, testRemoteConnection, cloneRepo } from './git.js';
import { readMetaJson } from './sync.js';
import { ClaudeSyncError, ErrorCode } from '../types/index.js';
/**
 * Warn the user when the remote they are linking does not look like a
 * claude-sync config repo, so a later `sync pull` cannot silently overwrite or
 * delete their Claude Code configuration. A repo that claude-sync created (has a
 * `meta.json` with `managedBy: 'claude-sync'`) is trusted. A repo with no
 * content at all — only a `.git/` (e.g. a freshly-created remote whose single
 * commit holds no files) — is a safe first-push target and is NOT a cause for
 * alarm, so it gets a friendly hint instead of a scary warning. Only a
 * non-empty repo that is missing the claude-sync marker triggers the prompt.
 * @param {string} dir The cloned working tree of the remote.
 * @returns {Promise<void>} Resolves when validated; throws if the user declines.
 */
async function warnIfNotClaudeSyncRepo(dir) {
    const meta = await readMetaJson(dir);
    if (meta?.managedBy === 'claude-sync')
        return;
    // Any entry other than .git counts as content (.gitignore, LICENSE, a stray
    // dir, …) — be conservative and warn if anything could be overwritten.
    const contents = (await fs.readdir(dir)).filter((entry) => entry !== '.git');
    if (contents.length === 0) {
        logger.dim('Remote repository is empty — it will be populated on your first "sync push".');
        return;
    }
    logger.warn('This repository is not empty and does not look like a claude-sync config repo.');
    logger.dim('Pulling from it could overwrite or delete your Claude Code configuration.');
    const proceed = await confirm('Continue anyway?', false);
    if (!proceed) {
        throw new ClaudeSyncError('Setup cancelled — repository validation failed', ErrorCode.INVALID_CONFIG, 'Use a repository created by "claude-sync init" with syncing enabled.');
    }
} // End of function warnIfNotClaudeSyncRepo()
/**
 * Interactive Git remote setup flow.
 * Used by both `claude-sync init` (when user opts in) and `claude-sync sync setup`.
 */
export async function setupGitSync(claudeSyncDir, urlArg) {
    const isRepo = await isGitRepo(claudeSyncDir);
    if (isRepo) {
        // Already a git repo — check if remote is configured
        const git = createGit(claudeSyncDir);
        const remotes = await git.getRemotes(true);
        if (remotes.length > 0) {
            const origin = remotes.find(r => r.name === 'origin');
            const currentUrl = origin?.refs?.fetch || 'unknown';
            logger.success('Syncing is already configured.');
            logger.dim(`Current remote: ${currentUrl}`);
            if (!urlArg) {
                return;
            }
            const newUrl = urlArg.trim();
            if (newUrl && newUrl !== currentUrl) {
                await git.remote(['set-url', 'origin', newUrl]);
                logger.success('Remote URL updated.');
            }
            else {
                logger.dim('Remote URL unchanged.');
            }
            return;
        }
    }
    let repoUrl = urlArg;
    if (!repoUrl) {
        // Explain what's needed
        console.log('');
        logger.dim('Paste the URL of your existing config repo, or create a new');
        logger.dim('empty repo (e.g. "my-claude-config") on GitHub/GitLab.');
        console.log('');
        repoUrl = await input('Repository URL:');
    }
    if (!repoUrl.trim()) {
        throw new ClaudeSyncError('No repository URL provided', ErrorCode.INVALID_CONFIG, 'Provide a Git repository URL (e.g. git@github.com:user/repo.git).');
    }
    // Test connection to remote
    logger.step(1, 2, 'Testing connection to repository...');
    const canConnect = await testRemoteConnection(repoUrl);
    if (!canConnect) {
        throw new ClaudeSyncError('Cannot connect to repository', ErrorCode.NETWORK_ERROR, 'Check that the URL is correct and you have access.');
    }
    logger.success('Connection successful');
    // Set up the git repo
    logger.step(2, 2, 'Setting up local repository...');
    if (isRepo) {
        // Already a git repo but no remote — just add the remote
        await addRemote(claudeSyncDir, repoUrl);
        logger.success('Remote added to existing repository');
    }
    else {
        // Not a git repo — need to set up git
        const dirContents = await fs.readdir(claudeSyncDir);
        if (dirContents.length === 0) {
            // Empty directory — clone directly
            try {
                await cloneRepo(repoUrl, claudeSyncDir);
                const cloneGit = createGit(claudeSyncDir);
                const hasCommits = await cloneGit.log().then(log => log.total > 0).catch(() => false);
                if (hasCommits) {
                    await warnIfNotClaudeSyncRepo(claudeSyncDir);
                    logger.success('Cloned existing config from repository');
                }
                else {
                    logger.success('Initialized new repository');
                }
            }
            catch (error) {
                if (error instanceof ClaudeSyncError && error.code !== ErrorCode.CLONE_FAILED)
                    throw error;
                await initRepo(claudeSyncDir);
                await addRemote(claudeSyncDir, repoUrl);
                logger.success('Initialized new repository');
            }
        }
        else {
            // Non-empty directory (e.g. has meta.json) — clone to temp, move .git over
            const tmpDir = path.join(os.tmpdir(), `claude-sync-clone-${Date.now()}`);
            try {
                await cloneRepo(repoUrl, tmpDir);
                const tmpGit = createGit(tmpDir);
                const hasCommits = await tmpGit.log().then(log => log.total > 0).catch(() => false);
                if (hasCommits) {
                    await warnIfNotClaudeSyncRepo(tmpDir);
                    await fs.move(path.join(tmpDir, '.git'), path.join(claudeSyncDir, '.git'));
                    const git = createGit(claudeSyncDir);
                    await git.reset(['HEAD']);
                    logger.success('Cloned existing config from repository');
                }
                else {
                    // Empty remote — take the .git (has origin configured), skip reset
                    await fs.move(path.join(tmpDir, '.git'), path.join(claudeSyncDir, '.git'));
                    logger.success('Initialized new repository');
                }
            }
            catch (error) {
                if (error instanceof ClaudeSyncError && error.code !== ErrorCode.CLONE_FAILED)
                    throw error;
                await initRepo(claudeSyncDir);
                await addRemote(claudeSyncDir, repoUrl);
                logger.success('Initialized new repository');
            }
            finally {
                await fs.remove(tmpDir);
            }
        }
    }
}
//# sourceMappingURL=sync-setup.js.map