import { simpleGit } from 'simple-git';
import { ClaudeSyncError, ErrorCode } from '../types/index.js';
export function createGit(baseDir) {
    const options = {
        baseDir,
        binary: 'git',
        maxConcurrentProcesses: 6,
    };
    return simpleGit(options);
}
export async function isGitRepo(dir) {
    try {
        const git = createGit(dir);
        return await git.checkIsRepo();
    }
    catch {
        return false;
    }
}
export async function cloneRepo(url, targetDir) {
    try {
        const git = simpleGit();
        await git.clone(url, targetDir);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new ClaudeSyncError(`Failed to clone repository: ${message}`, ErrorCode.CLONE_FAILED, 'Check that the URL is correct and you have access to the repository.');
    }
}
export async function testRemoteConnection(url) {
    try {
        const git = simpleGit();
        await git.listRemote([url]);
        return true;
    }
    catch {
        return false;
    }
}
export async function initRepo(dir) {
    const git = createGit(dir);
    await git.init();
}
export async function resetHard(dir) {
    const git = createGit(dir);
    await git.reset(['--hard', 'HEAD']);
}
export async function cleanUntracked(dir) {
    const git = createGit(dir);
    await git.clean('f', ['-d']);
}
export async function getGitStatus(dir) {
    const git = createGit(dir);
    const isRepo = await isGitRepo(dir);
    if (!isRepo) {
        return {
            isRepo: false,
            isClean: false,
            branch: null,
            remote: null,
            ahead: 0,
            behind: 0,
            modified: [],
            untracked: [],
        };
    }
    const status = await git.status();
    const remotes = await git.getRemotes(true);
    const originRemote = remotes.find((r) => r.name === 'origin');
    return {
        isRepo: true,
        isClean: status.isClean(),
        branch: status.current,
        remote: originRemote?.refs?.fetch || null,
        ahead: status.ahead,
        behind: status.behind,
        modified: [...status.modified, ...status.staged],
        untracked: status.not_added,
    };
}
export async function pull(dir) {
    const git = createGit(dir);
    try {
        const result = await git.pull();
        if (result.summary.changes === 0) {
            return { success: true, message: 'Already up to date.' };
        }
        return {
            success: true,
            message: `Updated: ${result.summary.insertions} insertions, ${result.summary.deletions} deletions`,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('CONFLICT')) {
            throw new ClaudeSyncError('Merge conflict detected', ErrorCode.MERGE_CONFLICT, `Resolve conflicts manually in ${dir} and try again.`);
        }
        throw new ClaudeSyncError(`Git pull failed: ${message}`, ErrorCode.NETWORK_ERROR);
    }
}
export async function commitAndPush(dir, message, push = true) {
    const git = createGit(dir);
    // Stage all changes
    await git.add('-A');
    // Check if there's anything to commit
    const status = await git.status();
    if (status.isClean()) {
        return { committed: false, pushed: false };
    }
    // Commit
    await git.commit(message);
    // Push if requested and remote exists
    if (push) {
        const remotes = await git.getRemotes();
        if (remotes.length > 0) {
            // Only pull --rebase if we have an upstream tracking branch
            if (status.tracking) {
                try {
                    await git.pull(['--rebase']);
                }
                catch (err) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    if (errMsg.includes('CONFLICT') || errMsg.includes('conflict')) {
                        // Check if meta.json is the only conflicting file — auto-resolve it
                        const conflictStatus = await git.status();
                        const conflictFiles = conflictStatus.conflicted;
                        if (conflictFiles.length === 1 && conflictFiles[0] === 'meta.json') {
                            await git.checkout(['--ours', 'meta.json']);
                            await git.add('meta.json');
                            await git.env('GIT_EDITOR', 'true').rebase(['--continue']);
                        }
                        else {
                            await git.rebase(['--abort']);
                            throw new ClaudeSyncError(`Rebase failed due to conflicts: ${errMsg}`, ErrorCode.MERGE_CONFLICT, 'Try running "claude-sync sync pull" to resolve conflicts.');
                        }
                    }
                    else if (errMsg.includes('no such ref') || errMsg.includes("Couldn't find remote ref")) {
                        // Remote branch doesn't exist yet — skip rebase, first push will create it
                    }
                    else {
                        throw new ClaudeSyncError(`Pull --rebase failed: ${errMsg}`, ErrorCode.NETWORK_ERROR, 'Check your network connection and try again.');
                    }
                }
            }
            try {
                // Use -u to set upstream on first push
                await git.push(['-u', 'origin', 'HEAD']);
                return { committed: true, pushed: true };
            }
            catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                throw new ClaudeSyncError(`Push failed: ${errMsg}`, ErrorCode.NETWORK_ERROR, 'Check your network connection and try again.');
            }
        }
    }
    return { committed: true, pushed: false };
}
export async function hasMergeConflicts(dir) {
    const git = createGit(dir);
    const status = await git.status();
    return status.conflicted.length > 0;
}
export async function addRemote(dir, url) {
    const git = createGit(dir);
    await git.addRemote('origin', url);
}
export async function getDiff(dir) {
    const git = createGit(dir);
    return await git.diff();
}
//# sourceMappingURL=git.js.map