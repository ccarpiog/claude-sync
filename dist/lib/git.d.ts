import { SimpleGit } from 'simple-git';
import type { GitStatus } from '../types/index.js';
export declare function createGit(baseDir: string): SimpleGit;
export declare function isGitRepo(dir: string): Promise<boolean>;
export declare function cloneRepo(url: string, targetDir: string): Promise<void>;
export declare function testRemoteConnection(url: string): Promise<boolean>;
export declare function initRepo(dir: string): Promise<void>;
export declare function resetHard(dir: string): Promise<void>;
export declare function cleanUntracked(dir: string): Promise<void>;
export declare function getGitStatus(dir: string): Promise<GitStatus>;
export declare function pull(dir: string): Promise<{
    success: boolean;
    message: string;
}>;
export declare function commitAndPush(dir: string, message: string, push?: boolean): Promise<{
    committed: boolean;
    pushed: boolean;
}>;
export declare function hasMergeConflicts(dir: string): Promise<boolean>;
export declare function addRemote(dir: string, url: string): Promise<void>;
export declare function getDiff(dir: string): Promise<string>;
//# sourceMappingURL=git.d.ts.map