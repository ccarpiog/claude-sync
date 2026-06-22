import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  FILE_MAPPINGS,
  compareFiles,
  createMetaJson,
  readMetaJson,
  writeMetaJson,
  updateLastSync,
  syncFromClaudeConfig,
  syncToClaudeConfig,
} from '../../../src/lib/sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('sync.ts', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-sync-test-'));
  });

  afterEach(async () => {
    // Clean up
    await fs.remove(tempDir);
  });

  describe('FILE_MAPPINGS', () => {
    const sources = FILE_MAPPINGS.map(m => m.source);

    it('syncs custom slash commands', () => {
      expect(sources).toContain('commands');
    });

    it('syncs plugin manifests but not the cloned repos/caches', () => {
      expect(sources).toContain('plugins/config.json');
      expect(sources).toContain('plugins/installed_plugins.json');
      expect(sources).toContain('plugins/known_marketplaces.json');
      // The whole plugins/ directory must NOT be synced — only its manifests.
      expect(sources).not.toContain('plugins');
    });
  });

  describe('compareFiles', () => {
    it('should return comparison results for all file mappings', async () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');

      const results = await compareFiles(sourceDir, targetDir);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      results.forEach(result => {
        expect(result).toHaveProperty('mapping');
        expect(result).toHaveProperty('inSync');
        expect(result).toHaveProperty('sourceExists');
        expect(result).toHaveProperty('targetExists');
      });
    });

    it('should include a statusline.sh mapping in results', async () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');

      const results = await compareFiles(sourceDir, targetDir);

      const statuslineResult = results.find(r => r.mapping.source === 'statusline.sh');
      expect(statuslineResult).toBeDefined();
      expect(statuslineResult!.mapping.target).toBe('statusline.sh');
      expect(statuslineResult!.mapping.type).toBe('file');
    });

    it('should detect when files are missing in both locations', async () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');

      const results = await compareFiles(sourceDir, targetDir);

      // All files should be missing and considered in sync
      results.forEach(result => {
        expect(result.sourceExists).toBe(false);
        expect(result.targetExists).toBe(false);
        expect(result.inSync).toBe(true);
      });
    });

    it('should detect an added file inside a directory mapping (not inSync)', async () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');

      // Both sides share one file, but the source has an extra file.
      await fs.ensureDir(path.join(sourceDir, 'commands'));
      await fs.ensureDir(path.join(targetDir, 'commands'));
      await fs.writeFile(path.join(sourceDir, 'commands', 'a.md'), 'a');
      await fs.writeFile(path.join(targetDir, 'commands', 'a.md'), 'a');
      await fs.writeFile(path.join(sourceDir, 'commands', 'b.md'), 'b');

      const results = await compareFiles(sourceDir, targetDir);
      const commandsResult = results.find(r => r.mapping.source === 'commands');

      expect(commandsResult).toBeDefined();
      expect(commandsResult!.inSync).toBe(false);
    });

    it('should report inSync:true when directory contents are identical', async () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');

      await fs.ensureDir(path.join(sourceDir, 'commands'));
      await fs.ensureDir(path.join(targetDir, 'commands'));
      await fs.writeFile(path.join(sourceDir, 'commands', 'a.md'), 'a');
      await fs.writeFile(path.join(targetDir, 'commands', 'a.md'), 'a');

      const results = await compareFiles(sourceDir, targetDir);
      const commandsResult = results.find(r => r.mapping.source === 'commands');

      expect(commandsResult).toBeDefined();
      expect(commandsResult!.inSync).toBe(true);
    });
  });

  describe('metadata operations', () => {
    describe('createMetaJson', () => {
      it('should create valid metadata', () => {
        const claudeConfigPath = '/home/user/.claude';
        const meta = createMetaJson(claudeConfigPath);

        expect(meta).toHaveProperty('version');
        expect(meta).toHaveProperty('lastSync');
        expect(meta).toHaveProperty('machineId');
        expect(meta).toHaveProperty('platform');
        expect(meta).toHaveProperty('claudeConfigPath');

        expect(meta.version).toBe('1.1.0');
        expect(meta.lastSync).toBeNull();
        expect(meta.claudeConfigPath).toBe(claudeConfigPath);
        expect(meta.machineId).toContain('-'); // Format: hostname-hash
        expect(['linux', 'darwin']).toContain(meta.platform);
      });

      it('should generate consistent machineId for same hostname', () => {
        const meta1 = createMetaJson('/test/path');
        const meta2 = createMetaJson('/test/path');

        // Should be the same since hostname and platform are the same
        expect(meta1.machineId).toBe(meta2.machineId);
      });

      it('should include managedBy field set to claude-sync', () => {
        const meta = createMetaJson('/test/path');

        expect(meta).toHaveProperty('managedBy');
        expect(meta.managedBy).toBe('claude-sync');
      });
    });

    describe('writeMetaJson and readMetaJson', () => {
      it('should write and read metadata correctly', async () => {
        const meta = createMetaJson('/test/path');
        const claudeSyncDir = path.join(tempDir, '.claude-sync');
        await fs.ensureDir(claudeSyncDir);

        await writeMetaJson(claudeSyncDir, meta);

        const metaPath = path.join(claudeSyncDir, 'meta.json');
        expect(await fs.pathExists(metaPath)).toBe(true);

        const readMeta = await readMetaJson(claudeSyncDir);
        expect(readMeta).toEqual(meta);
      });

      it('should return null when meta.json does not exist', async () => {
        const claudeSyncDir = path.join(tempDir, '.claude-sync');
        await fs.ensureDir(claudeSyncDir);

        const meta = await readMetaJson(claudeSyncDir);
        expect(meta).toBeNull();
      });
    });

    describe('updateLastSync', () => {
      it('should update the lastSync timestamp', async () => {
        const meta = createMetaJson('/test/path');
        const claudeSyncDir = path.join(tempDir, '.claude-sync');
        await fs.ensureDir(claudeSyncDir);
        await writeMetaJson(claudeSyncDir, meta);

        expect(meta.lastSync).toBeNull();

        await updateLastSync(claudeSyncDir);

        const updatedMeta = await readMetaJson(claudeSyncDir);
        expect(updatedMeta?.lastSync).not.toBeNull();
        if (updatedMeta?.lastSync) {
          expect(new Date(updatedMeta.lastSync).getTime()).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('syncFromClaudeConfig', () => {
    it('should copy files from Claude config to claude-sync repo', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const claudeSyncDir = path.join(tempDir, '.claude-sync');

      await fs.ensureDir(claudeDir);
      await fs.ensureDir(claudeSyncDir);

      // Create test files
      await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), '# Instructions');
      await fs.writeFile(path.join(claudeDir, 'settings.json'), '{"theme":"dark"}');

      const results = await syncFromClaudeConfig(claudeDir, claudeSyncDir);

      // Should have synced files
      expect(results.length).toBeGreaterThan(0);
      expect(await fs.pathExists(path.join(claudeSyncDir, 'CLAUDE.md'))).toBe(true);
      expect(await fs.pathExists(path.join(claudeSyncDir, 'settings.json'))).toBe(true);

      const claudeMd = await fs.readFile(path.join(claudeSyncDir, 'CLAUDE.md'), 'utf-8');
      expect(claudeMd).toBe('# Instructions');
    });

    it('should copy statusline.sh from Claude config', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const claudeSyncDir = path.join(tempDir, '.claude-sync');

      await fs.ensureDir(claudeDir);
      await fs.ensureDir(claudeSyncDir);

      await fs.writeFile(path.join(claudeDir, 'statusline.sh'), '#!/bin/bash\necho "status"');

      const results = await syncFromClaudeConfig(claudeDir, claudeSyncDir);

      expect(await fs.pathExists(path.join(claudeSyncDir, 'statusline.sh'))).toBe(true);
      const content = await fs.readFile(path.join(claudeSyncDir, 'statusline.sh'), 'utf-8');
      expect(content).toBe('#!/bin/bash\necho "status"');

      const statuslineResult = results.find(r => r.file === 'statusline.sh');
      expect(statuslineResult).toBeDefined();
    });

    it('should sync hooks directory', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const claudeSyncDir = path.join(tempDir, '.claude-sync');

      await fs.ensureDir(path.join(claudeDir, 'hooks'));
      await fs.ensureDir(claudeSyncDir);

      await fs.writeFile(path.join(claudeDir, 'hooks', 'test.sh'), '#!/bin/bash\necho "test"');

      const results = await syncFromClaudeConfig(claudeDir, claudeSyncDir);

      expect(await fs.pathExists(path.join(claudeSyncDir, 'hooks', 'test.sh'))).toBe(true);
    });

    it('should sync only plugin manifests, not the cloned repos/caches', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const claudeSyncDir = path.join(tempDir, '.claude-sync');

      await fs.ensureDir(path.join(claudeDir, 'plugins'));
      await fs.ensureDir(claudeSyncDir);

      // Portable manifests (should sync)
      await fs.writeFile(path.join(claudeDir, 'plugins', 'config.json'), '{}');
      await fs.writeFile(
        path.join(claudeDir, 'plugins', 'installed_plugins.json'),
        '{"a":1}'
      );
      await fs.writeFile(
        path.join(claudeDir, 'plugins', 'known_marketplaces.json'),
        '{"m":1}'
      );
      // Machine-local artifacts living next to the manifests (must NOT sync)
      await fs.ensureDir(path.join(claudeDir, 'plugins', 'repos', 'some-repo'));
      await fs.writeFile(
        path.join(claudeDir, 'plugins', 'repos', 'some-repo', 'big.bin'),
        'x'
      );
      await fs.writeFile(
        path.join(claudeDir, 'plugins', 'install-counts-cache.json'),
        '{}'
      );

      await syncFromClaudeConfig(claudeDir, claudeSyncDir);

      // Manifests copied, with the nested plugins/ parent created implicitly
      expect(
        await fs.pathExists(path.join(claudeSyncDir, 'plugins', 'config.json'))
      ).toBe(true);
      expect(
        await fs.pathExists(
          path.join(claudeSyncDir, 'plugins', 'installed_plugins.json')
        )
      ).toBe(true);
      expect(
        await fs.pathExists(
          path.join(claudeSyncDir, 'plugins', 'known_marketplaces.json')
        )
      ).toBe(true);
      // Siblings left behind
      expect(
        await fs.pathExists(path.join(claudeSyncDir, 'plugins', 'repos'))
      ).toBe(false);
      expect(
        await fs.pathExists(
          path.join(claudeSyncDir, 'plugins', 'install-counts-cache.json')
        )
      ).toBe(false);
    });
  });

  describe('syncToClaudeConfig', () => {
    it('should copy files from claude-sync repo to Claude config', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const claudeSyncDir = path.join(tempDir, '.claude-sync');

      await fs.ensureDir(claudeDir);
      await fs.ensureDir(claudeSyncDir);

      await fs.writeFile(path.join(claudeSyncDir, 'CLAUDE.md'), '# Remote Instructions');
      await fs.writeFile(path.join(claudeSyncDir, 'settings.json'), '{"theme":"light"}');

      const results = await syncToClaudeConfig(claudeSyncDir, claudeDir);

      expect(await fs.pathExists(path.join(claudeDir, 'CLAUDE.md'))).toBe(true);
      expect(await fs.pathExists(path.join(claudeDir, 'settings.json'))).toBe(true);

      const claudeMd = await fs.readFile(path.join(claudeDir, 'CLAUDE.md'), 'utf-8');
      expect(claudeMd).toBe('# Remote Instructions');
    });

    it('should copy statusline.sh to Claude config', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const claudeSyncDir = path.join(tempDir, '.claude-sync');

      await fs.ensureDir(claudeDir);
      await fs.ensureDir(claudeSyncDir);

      await fs.writeFile(path.join(claudeSyncDir, 'statusline.sh'), '#!/bin/bash\necho "status"');

      const results = await syncToClaudeConfig(claudeSyncDir, claudeDir);

      expect(await fs.pathExists(path.join(claudeDir, 'statusline.sh'))).toBe(true);
      const content = await fs.readFile(path.join(claudeDir, 'statusline.sh'), 'utf-8');
      expect(content).toBe('#!/bin/bash\necho "status"');

      const statuslineResult = results.find(r => r.file === 'statusline.sh');
      expect(statuslineResult).toBeDefined();
    });

    it('should overwrite existing files', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const claudeSyncDir = path.join(tempDir, '.claude-sync');

      await fs.ensureDir(claudeDir);
      await fs.ensureDir(claudeSyncDir);

      await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), '# Old');
      await fs.writeFile(path.join(claudeSyncDir, 'CLAUDE.md'), '# New');

      await syncToClaudeConfig(claudeSyncDir, claudeDir);

      const claudeMd = await fs.readFile(path.join(claudeDir, 'CLAUDE.md'), 'utf-8');
      expect(claudeMd).toBe('# New');
    });

    it('should delete a local file that was removed from the synced repo', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const claudeSyncDir = path.join(tempDir, '.claude-sync');

      await fs.ensureDir(claudeDir);
      await fs.ensureDir(claudeSyncDir);

      // CLAUDE.md exists locally but NOT in the synced repo.
      await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), '# Stale');

      const results = await syncToClaudeConfig(claudeSyncDir, claudeDir);

      // Local file removed, action recorded as 'deleted'.
      expect(await fs.pathExists(path.join(claudeDir, 'CLAUDE.md'))).toBe(false);
      const deleted = results.find(r => r.file === 'CLAUDE.md');
      expect(deleted).toBeDefined();
      expect(deleted!.action).toBe('deleted');
    });

    it('should mirror a directory, deleting files removed upstream', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const claudeSyncDir = path.join(tempDir, '.claude-sync');

      await fs.ensureDir(path.join(claudeDir, 'commands'));
      await fs.ensureDir(path.join(claudeSyncDir, 'commands'));

      // Local has an extra file that no longer exists upstream.
      await fs.writeFile(path.join(claudeDir, 'commands', 'keep.md'), 'keep');
      await fs.writeFile(path.join(claudeDir, 'commands', 'stale.md'), 'stale');
      await fs.writeFile(path.join(claudeSyncDir, 'commands', 'keep.md'), 'keep');

      const results = await syncToClaudeConfig(claudeSyncDir, claudeDir);

      expect(await fs.pathExists(path.join(claudeDir, 'commands', 'keep.md'))).toBe(true);
      expect(await fs.pathExists(path.join(claudeDir, 'commands', 'stale.md'))).toBe(false);

      // The removed file is reported as a per-file 'deleted' action.
      const deleted = results.find(r => r.file === 'commands/stale.md');
      expect(deleted).toBeDefined();
      expect(deleted!.action).toBe('deleted');
    });

    it('should report a directory mirror deletion in dryRun without removing the file', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const claudeSyncDir = path.join(tempDir, '.claude-sync');

      await fs.ensureDir(path.join(claudeDir, 'commands'));
      await fs.ensureDir(path.join(claudeSyncDir, 'commands'));
      await fs.writeFile(path.join(claudeDir, 'commands', 'stale.md'), 'stale');
      await fs.writeFile(path.join(claudeSyncDir, 'commands', 'keep.md'), 'keep');

      const results = await syncToClaudeConfig(claudeSyncDir, claudeDir, true);

      // Deletion reported, but the stale file is left in place by the dry run.
      const deleted = results.find(r => r.file === 'commands/stale.md');
      expect(deleted).toBeDefined();
      expect(deleted!.action).toBe('deleted');
      expect(await fs.pathExists(path.join(claudeDir, 'commands', 'stale.md'))).toBe(true);
    });

    it('should record a deleted action in dryRun without removing the file', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const claudeSyncDir = path.join(tempDir, '.claude-sync');

      await fs.ensureDir(claudeDir);
      await fs.ensureDir(claudeSyncDir);

      await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), '# Stale');

      const results = await syncToClaudeConfig(claudeSyncDir, claudeDir, true);

      // Action reported but the file is left untouched.
      const deleted = results.find(r => r.file === 'CLAUDE.md');
      expect(deleted).toBeDefined();
      expect(deleted!.action).toBe('deleted');
      expect(await fs.pathExists(path.join(claudeDir, 'CLAUDE.md'))).toBe(true);
    });
  });
});
