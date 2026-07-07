import type { ConfigPaths } from '../types/index.js';
export declare function detectPlatform(): 'darwin' | 'linux';
export declare function getClaudeSyncDir(): string;
export declare function detectClaudeConfigDir(): string;
export declare function getConfigPaths(): ConfigPaths;
export declare function ensureDir(dirPath: string): void;
/**
 * Expand a leading ~ to the user's home directory.
 * Inverse of contractPath; used when reading config files from disk.
 * Passes through absolute paths, relative paths, and falsy values unchanged.
 */
export declare function expandPath(p: string): string;
/**
 * Replace the user's home directory prefix with ~ so config files stay
 * portable across machines. Only contracts at a path boundary: a sibling
 * directory like /Users/usershared is left untouched, since ~shared/...
 * would not survive the round-trip through expandPath.
 */
export declare function contractPath(p: string): string;
//# sourceMappingURL=paths.d.ts.map