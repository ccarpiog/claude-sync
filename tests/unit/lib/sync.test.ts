import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import {
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

  describe('compareFiles', () => {
    it('should return comparison results for all file mappings', () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');

      const results = compareFiles(sourceDir, targetDir);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      results.forEach(result => {
        expect(result).toHaveProperty('mapping');
        expect(result).toHaveProperty('inSync');
        expect(result).toHaveProperty('sourceExists');
        expect(result).toHaveProperty('targetExists');
      });
    });

    it('should include a statusline.sh mapping in results', () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');

      const results = compareFiles(sourceDir, targetDir);

      const statuslineResult = results.find(r => r.mapping.source === 'statusline.sh');
      expect(statuslineResult).toBeDefined();
      expect(statuslineResult!.mapping.target).toBe('statusline.sh');
      expect(statuslineResult!.mapping.type).toBe('file');
    });

    it('should detect when files are missing in both locations', () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');

      const results = compareFiles(sourceDir, targetDir);

      // All files should be missing and considered in sync
      results.forEach(result => {
        expect(result.sourceExists).toBe(false);
        expect(result.targetExists).toBe(false);
        expect(result.inSync).toBe(true);
      });
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
  });
});
