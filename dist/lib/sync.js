import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { getConfigPaths } from './paths.js';
export const FILE_MAPPINGS = [
    {
        source: 'CLAUDE.md',
        target: 'CLAUDE.md',
        type: 'file',
    },
    {
        source: 'settings.json',
        target: 'settings.json',
        type: 'file',
    },
    {
        source: 'hooks',
        target: 'hooks',
        type: 'directory',
    },
    {
        source: 'skills',
        target: 'skills',
        type: 'directory',
    },
    {
        source: 'agents',
        target: 'agents',
        type: 'directory',
    },
    {
        source: 'commands',
        target: 'commands',
        type: 'directory',
    },
    {
        source: 'keybindings.json',
        target: 'keybindings.json',
        type: 'file',
    },
    {
        source: 'statusline.sh',
        target: 'statusline.sh',
        type: 'file',
    },
    // Plugin manifests only — these describe which plugins are installed and which
    // marketplaces are configured, so a new machine knows what to reinstall. The
    // cloned marketplace repos and caches under plugins/ are machine-local and
    // intentionally not synced.
    {
        source: 'plugins/config.json',
        target: 'plugins/config.json',
        type: 'file',
    },
    {
        source: 'plugins/installed_plugins.json',
        target: 'plugins/installed_plugins.json',
        type: 'file',
    },
    {
        source: 'plugins/known_marketplaces.json',
        target: 'plugins/known_marketplaces.json',
        type: 'file',
    },
];
function fileHash(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
}
/**
 * Compare a directory's contents recursively between source and target.
 * Cheap-but-correct: first compare the sorted set of relative file paths; if
 * the sets differ (a file added or removed on either side) divergence is proven
 * without hashing. Only when the sets match are the shared files hashed and
 * compared, returning false on the first differing hash.
 * @param {string} sourcePath Source directory.
 * @param {string} targetPath Target directory.
 * @returns {Promise<boolean>} True if both directories hold identical contents.
 */
async function directoriesInSync(sourcePath, targetPath) {
    const sourceFiles = (await listFilesRecursive(sourcePath)).sort();
    const targetFiles = (await listFilesRecursive(targetPath)).sort();
    // A different file set already proves divergence — no need to hash.
    if (sourceFiles.length !== targetFiles.length) {
        return false;
    }
    for (let i = 0; i < sourceFiles.length; i++) {
        if (sourceFiles[i] !== targetFiles[i]) {
            return false;
        }
    }
    // Sets match — hash the shared files and compare.
    for (const file of sourceFiles) {
        const sourceHash = fileHash(path.join(sourcePath, file));
        const targetHash = fileHash(path.join(targetPath, file));
        if (sourceHash !== targetHash) {
            return false;
        }
    }
    return true;
} // End of function directoriesInSync()
export async function compareFiles(sourceDir, targetDir) {
    return Promise.all(FILE_MAPPINGS.map(async (mapping) => {
        const sourcePath = path.join(sourceDir, mapping.source);
        const targetPath = path.join(targetDir, mapping.target);
        const sourceExists = fs.existsSync(sourcePath);
        const targetExists = fs.existsSync(targetPath);
        if (!sourceExists && !targetExists) {
            return { mapping, inSync: true, sourceExists, targetExists };
        }
        if (!sourceExists || !targetExists) {
            return { mapping, inSync: false, sourceExists, targetExists };
        }
        if (mapping.type === 'directory') {
            // For directories, recurse and compare the actual file set + contents.
            const inSync = await directoriesInSync(sourcePath, targetPath);
            return { mapping, inSync, sourceExists, targetExists };
        }
        const sourceHash = fileHash(sourcePath);
        const targetHash = fileHash(targetPath);
        return {
            mapping,
            inSync: sourceHash === targetHash,
            sourceExists,
            targetExists,
        };
    }));
} // End of function compareFiles()
async function listFilesRecursive(dir, base = '') {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const relativePath = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            files.push(...await listFilesRecursive(path.join(dir, entry.name), relativePath));
        }
        else {
            files.push(relativePath);
        }
    }
    return files;
}
export async function syncToClaudeConfig(claudeSyncDir, claudeConfigDir, dryRun = false) {
    const results = [];
    // Ensure target directory exists
    if (!dryRun) {
        await fs.ensureDir(claudeConfigDir);
    }
    for (const mapping of FILE_MAPPINGS) {
        const sourcePath = path.join(claudeSyncDir, mapping.source);
        const targetPath = path.join(claudeConfigDir, mapping.target);
        if (!fs.existsSync(sourcePath)) {
            // Source doesn't exist - remove target if it exists so the local config
            // mirrors the synced repo (mirrors syncFromClaudeConfig). All mutations
            // are gated behind !dryRun, but the result is still recorded.
            if (fs.existsSync(targetPath)) {
                if (!dryRun) {
                    await fs.remove(targetPath);
                }
                results.push({
                    file: mapping.source,
                    action: 'deleted',
                    source: sourcePath,
                    target: targetPath,
                });
            }
            else {
                results.push({
                    file: mapping.source,
                    action: 'skipped',
                    source: sourcePath,
                    target: targetPath,
                });
            }
            continue;
        }
        if (mapping.type === 'directory') {
            // List individual files in the source. Capture each file's pre-existing
            // state BEFORE removing the target, otherwise everything would look
            // 'created' after the removal below.
            const files = await listFilesRecursive(sourcePath);
            const fileStates = files.map((file) => {
                const fileTargetPath = path.join(targetPath, file);
                return { file, fileTargetPath, existed: fs.existsSync(fileTargetPath) };
            });
            // Files present locally but absent upstream will be removed by the mirror.
            // Compute them up front so they are reported in both real and dry runs.
            const sourceSet = new Set(files);
            const targetFiles = fs.existsSync(targetPath)
                ? await listFilesRecursive(targetPath)
                : [];
            const removedFiles = targetFiles.filter((file) => !sourceSet.has(file));
            if (!dryRun) {
                // Remove the existing target first so it becomes an exact mirror (files
                // deleted upstream do not survive locally), then copy. fs.remove on a
                // symlink removes the link itself, not its referent, so this is safe
                // even if the target is unexpectedly a symlink — matching the mirror
                // semantics of syncFromClaudeConfig.
                if (fs.existsSync(targetPath)) {
                    await fs.remove(targetPath);
                }
                await fs.copy(sourcePath, targetPath, { overwrite: true });
            }
            for (const file of removedFiles) {
                results.push({
                    file: `${mapping.source}/${file}`,
                    action: 'deleted',
                    source: path.join(sourcePath, file),
                    target: path.join(targetPath, file),
                });
            }
            for (const { file, fileTargetPath, existed } of fileStates) {
                results.push({
                    file: `${mapping.source}/${file}`,
                    action: existed ? 'updated' : 'created',
                    source: path.join(sourcePath, file),
                    target: fileTargetPath,
                });
            } // End of the loop recording per-file results
        }
        else {
            const targetExists = fs.existsSync(targetPath);
            if (!dryRun) {
                // Ensure the parent dir exists for nested file mappings (e.g.
                // plugins/config.json). fs.copy creates parents, but be explicit.
                await fs.ensureDir(path.dirname(targetPath));
                await fs.copy(sourcePath, targetPath);
            }
            results.push({
                file: mapping.source,
                action: targetExists ? 'updated' : 'created',
                source: sourcePath,
                target: targetPath,
            });
        }
    } // End of the loop over FILE_MAPPINGS
    return results;
} // End of function syncToClaudeConfig()
export async function importFromClaudeConfig(claudeConfigDir, claudeSyncDir) {
    const results = [];
    for (const mapping of FILE_MAPPINGS) {
        const sourcePath = path.join(claudeConfigDir, mapping.target);
        const targetPath = path.join(claudeSyncDir, mapping.source);
        if (!fs.existsSync(sourcePath)) {
            continue;
        }
        const targetExists = fs.existsSync(targetPath);
        if (mapping.type === 'directory') {
            await fs.copy(sourcePath, targetPath, { overwrite: true });
        }
        else {
            await fs.copy(sourcePath, targetPath);
        }
        results.push({
            file: mapping.target,
            action: targetExists ? 'updated' : 'copied',
            source: sourcePath,
            target: targetPath,
        });
    }
    return results;
}
export async function syncFromClaudeConfig(claudeConfigDir, claudeSyncDir) {
    const results = [];
    for (const mapping of FILE_MAPPINGS) {
        const sourcePath = path.join(claudeConfigDir, mapping.target);
        const targetPath = path.join(claudeSyncDir, mapping.source);
        if (!fs.existsSync(sourcePath)) {
            // Source doesn't exist - remove target if it exists
            if (fs.existsSync(targetPath)) {
                await fs.remove(targetPath);
                results.push({
                    file: mapping.source,
                    action: 'deleted',
                    source: sourcePath,
                    target: targetPath,
                });
            }
            else {
                results.push({
                    file: mapping.source,
                    action: 'skipped',
                    source: sourcePath,
                    target: targetPath,
                });
            }
            continue;
        }
        const targetExists = fs.existsSync(targetPath);
        if (mapping.type === 'directory') {
            // For directories, remove target first to ensure exact mirror
            if (targetExists) {
                await fs.remove(targetPath);
            }
            await fs.copy(sourcePath, targetPath);
        }
        else {
            await fs.copy(sourcePath, targetPath);
        }
        results.push({
            file: mapping.source,
            action: targetExists ? 'updated' : 'copied',
            source: sourcePath,
            target: targetPath,
        });
    }
    return results;
}
export function createMetaJson(claudeConfigPath) {
    const { platform } = getConfigPaths();
    const hostname = os.hostname();
    const machineId = crypto
        .createHash('md5')
        .update(hostname + platform)
        .digest('hex')
        .slice(0, 8);
    return {
        version: '1.1.0',
        managedBy: 'claude-sync',
        lastSync: null,
        machineId: `${hostname}-${machineId}`,
        platform,
        claudeConfigPath,
    };
}
export async function readMetaJson(claudeSyncDir) {
    const metaPath = path.join(claudeSyncDir, 'meta.json');
    if (!fs.existsSync(metaPath)) {
        return null;
    }
    try {
        return await fs.readJson(metaPath);
    }
    catch {
        return null;
    }
}
export async function writeMetaJson(claudeSyncDir, meta) {
    const metaPath = path.join(claudeSyncDir, 'meta.json');
    await fs.writeJson(metaPath, meta, { spaces: 2 });
}
export async function updateLastSync(claudeSyncDir) {
    const meta = await readMetaJson(claudeSyncDir);
    if (meta) {
        meta.lastSync = new Date().toISOString();
        await writeMetaJson(claudeSyncDir, meta);
    }
}
//# sourceMappingURL=sync.js.map