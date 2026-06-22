import os from 'os';
import path from 'path';
import fs from 'fs';
import { ClaudeSyncError, ErrorCode } from '../types/index.js';
export function detectPlatform() {
    const platform = os.platform();
    if (platform === 'darwin' || platform === 'linux') {
        return platform;
    }
    throw new ClaudeSyncError(`Unsupported platform: ${platform}`, ErrorCode.UNSUPPORTED_PLATFORM, 'claude-sync supports macOS and Linux only.');
}
export function getClaudeSyncDir() {
    return path.join(detectClaudeConfigDir(), '.claude-sync');
}
export function detectClaudeConfigDir() {
    const home = os.homedir();
    // Primary location (same on both macOS and Linux)
    const primaryPath = path.join(home, '.claude');
    if (fs.existsSync(primaryPath)) {
        return primaryPath;
    }
    // Alternate XDG location (primarily Linux)
    const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    const alternatePath = path.join(xdgConfigHome, 'claude-code');
    if (fs.existsSync(alternatePath)) {
        return alternatePath;
    }
    // Default to primary (will be created if needed)
    return primaryPath;
}
export function getConfigPaths() {
    return {
        claudeSyncDir: getClaudeSyncDir(),
        claudeConfigDir: detectClaudeConfigDir(),
        platform: detectPlatform(),
    };
}
export function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}
//# sourceMappingURL=paths.js.map