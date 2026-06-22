import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { getConfigPaths, getClaudeSyncDir } from './paths.js';
import { ClaudeSyncError, ErrorCode } from '../types/index.js';
const PROFILES_FILE = 'profiles.json';
/**
 * Items that get symlinked from the main ~/.claude/ into profile directories.
 * Everything else in the profile dir is profile-specific.
 */
export const SHARED_ITEMS = [
    { name: 'settings.json', type: 'file' },
    { name: 'hooks', type: 'directory' },
    { name: 'agents', type: 'directory' },
    { name: 'skills', type: 'directory' },
    { name: 'commands', type: 'directory' },
    { name: 'plugins', type: 'directory' },
    { name: 'keybindings.json', type: 'file' },
];
function getProfilesPath() {
    return path.join(getClaudeSyncDir(), PROFILES_FILE);
}
export async function loadProfiles() {
    const profilesPath = getProfilesPath();
    if (await fs.pathExists(profilesPath)) {
        return await fs.readJson(profilesPath);
    }
    return { profiles: {} };
}
export async function saveProfiles(config) {
    const profilesPath = getProfilesPath();
    const tmpPath = `${profilesPath}.${process.pid}.tmp`;
    await fs.writeJson(tmpPath, config, { spaces: 2 });
    await fs.rename(tmpPath, profilesPath);
}
export function getProfileConfigDir(name) {
    const home = os.homedir();
    return path.join(home, `.claude-${name}`);
}
export async function createProfile(name, options = {}) {
    const { shareStatusline = false, shareClaudeMd = false } = options;
    const config = await loadProfiles();
    if (config.profiles[name]) {
        throw new ClaudeSyncError(`Profile "${name}" already exists`, ErrorCode.ALREADY_EXISTS, `Use 'claude-sync profile list' to see existing profiles.`);
    }
    const configDir = getProfileConfigDir(name);
    const alias = `claude-${name}`;
    // Atomic directory creation — avoids TOCTOU race between exists-check and mkdir
    try {
        await fs.mkdir(configDir, { recursive: false });
    }
    catch (err) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'EEXIST') {
            throw new ClaudeSyncError(`Profile directory ${configDir} already exists on disk`, ErrorCode.ALREADY_EXISTS, `Remove it manually or choose a different profile name.`);
        }
        throw err;
    }
    // Create symlinks for shared items
    const { claudeConfigDir } = getConfigPaths();
    await createSymlinks(claudeConfigDir, configDir);
    // Optionally symlink statusline.sh from main config
    if (shareStatusline) {
        const sourcePath = path.join(claudeConfigDir, 'statusline.sh');
        const targetPath = path.join(configDir, 'statusline.sh');
        if (await fs.pathExists(sourcePath)) {
            await fs.symlink(sourcePath, targetPath);
        }
    }
    // Handle CLAUDE.md: symlink from main config or create independent file
    const claudeMdPath = path.join(configDir, 'CLAUDE.md');
    const claudeMdSource = path.join(claudeConfigDir, 'CLAUDE.md');
    if (shareClaudeMd && (await fs.pathExists(claudeMdSource))) {
        await fs.symlink(claudeMdSource, claudeMdPath);
    }
    else {
        await fs.writeFile(claudeMdPath, `# Claude Code Configuration (${name} profile)\n\nThis file is loaded by Claude Code at the start of every session.\n`);
    }
    // Save profile to registry
    const profile = {
        alias,
        configDir,
    };
    config.profiles[name] = profile;
    await saveProfiles(config);
    return profile;
}
export async function createSymlinks(sourceDir, targetDir) {
    const created = [];
    for (const item of SHARED_ITEMS) {
        const sourcePath = path.join(sourceDir, item.name);
        const targetPath = path.join(targetDir, item.name);
        // Only symlink if source exists
        if (!(await fs.pathExists(sourcePath))) {
            continue;
        }
        // Remove existing target if any (shouldn't happen on create, but safe)
        if (await fs.pathExists(targetPath)) {
            await fs.remove(targetPath);
        }
        await fs.symlink(sourcePath, targetPath);
        created.push(item.name);
    }
    return created;
}
export async function refreshSymlinks(name) {
    const config = await loadProfiles();
    const profile = config.profiles[name];
    if (!profile) {
        throw new ClaudeSyncError(`Profile "${name}" not found`, ErrorCode.NOT_INITIALIZED, `Use 'claude-sync profile list' to see existing profiles.`);
    }
    const { claudeConfigDir } = getConfigPaths();
    return createSymlinks(claudeConfigDir, profile.configDir);
}
export async function deleteProfile(name) {
    const config = await loadProfiles();
    const profile = config.profiles[name];
    if (!profile) {
        throw new ClaudeSyncError(`Profile "${name}" not found`, ErrorCode.NOT_INITIALIZED, `Use 'claude-sync profile list' to see existing profiles.`);
    }
    // Remove profile directory
    if (await fs.pathExists(profile.configDir)) {
        await fs.remove(profile.configDir);
    }
    // Remove from registry
    delete config.profiles[name];
    await saveProfiles(config);
    return profile;
}
export function getShellAliasLine(profile) {
    return `alias ${profile.alias}='CLAUDE_CONFIG_DIR="${profile.configDir}" claude'`;
}
export function getShellAliasBlock(name, profile) {
    return `\n# claude-sync profile: ${name}\n${getShellAliasLine(profile)}\n`;
}
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function profileAliasRegex(name) {
    return new RegExp(`\\n# claude-sync profile: ${escapeRegExp(name)}\\n[^\\n]+\\n`, 'g');
}
export async function installShellAlias(name, profile, shellConfigFile) {
    const rcPath = path.join(os.homedir(), shellConfigFile);
    const block = getShellAliasBlock(name, profile);
    // Check if alias already exists
    if (await fs.pathExists(rcPath)) {
        const content = await fs.readFile(rcPath, 'utf-8');
        if (content.includes(`claude-sync profile: ${name}`)) {
            const updated = content.replace(profileAliasRegex(name), block);
            await fs.writeFile(rcPath, updated);
            return;
        }
    }
    // Append alias block
    await fs.appendFile(rcPath, block);
}
export async function removeShellAlias(name, shellConfigFile) {
    const rcPath = path.join(os.homedir(), shellConfigFile);
    if (!(await fs.pathExists(rcPath))) {
        return false;
    }
    const content = await fs.readFile(rcPath, 'utf-8');
    if (!content.includes(`claude-sync profile: ${name}`)) {
        return false;
    }
    const updated = content.replace(profileAliasRegex(name), '\n');
    await fs.writeFile(rcPath, updated);
    return true;
}
export function detectShellConfigFiles() {
    const home = os.homedir();
    const options = [];
    if (fs.existsSync(path.join(home, '.zshrc'))) {
        options.push({ name: '.zshrc (zsh)', value: '.zshrc' });
    }
    if (fs.existsSync(path.join(home, '.bashrc'))) {
        options.push({ name: '.bashrc (bash)', value: '.bashrc' });
    }
    if (fs.existsSync(path.join(home, '.bash_profile'))) {
        options.push({ name: '.bash_profile (bash)', value: '.bash_profile' });
    }
    // Always offer these even if they don't exist yet
    if (!options.some((o) => o.value === '.zshrc')) {
        options.push({ name: '.zshrc (zsh) - will be created', value: '.zshrc' });
    }
    if (!options.some((o) => o.value === '.bashrc')) {
        options.push({
            name: '.bashrc (bash) - will be created',
            value: '.bashrc',
        });
    }
    return options;
}
//# sourceMappingURL=profiles.js.map