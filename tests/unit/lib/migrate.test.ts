import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  migrateLegacyLayout,
  migrateLegacyShellMarkers,
} from '../../../src/lib/migrate.js';

describe('migrate.ts', () => {
  let tempDir: string;
  let claudeConfigDir: string;
  let claudeSyncDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-sync-migrate-'));
    claudeConfigDir = path.join(tempDir, '.claude');
    claudeSyncDir = path.join(claudeConfigDir, '.claude-sync');
    await fs.ensureDir(claudeConfigDir);
    // Redirect os.homedir() so shell-rc lookups happen inside tempDir
    vi.spyOn(os, 'homedir').mockReturnValue(tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(tempDir);
  });

  describe('migrateLegacyLayout', () => {
    it('moves a legacy .jean-claude directory to .claude-sync', async () => {
      const legacyDir = path.join(claudeConfigDir, '.jean-claude');
      await fs.ensureDir(legacyDir);
      await fs.writeFile(path.join(legacyDir, 'meta.json'), '{"v":1}');

      const result = await migrateLegacyLayout(claudeConfigDir, claudeSyncDir);

      expect(result.movedDir).toBe(true);
      expect(await fs.pathExists(legacyDir)).toBe(false);
      const meta = await fs.readFile(path.join(claudeSyncDir, 'meta.json'), 'utf-8');
      expect(meta).toBe('{"v":1}');
    });

    it('never clobbers an existing .claude-sync directory', async () => {
      const legacyDir = path.join(claudeConfigDir, '.jean-claude');
      await fs.ensureDir(legacyDir);
      await fs.writeFile(path.join(legacyDir, 'meta.json'), '{"from":"legacy"}');
      await fs.ensureDir(claudeSyncDir);
      await fs.writeFile(path.join(claudeSyncDir, 'meta.json'), '{"from":"new"}');

      const result = await migrateLegacyLayout(claudeConfigDir, claudeSyncDir);

      expect(result.movedDir).toBe(false);
      // Existing repo is untouched, legacy left in place
      const meta = await fs.readFile(path.join(claudeSyncDir, 'meta.json'), 'utf-8');
      expect(meta).toBe('{"from":"new"}');
      expect(await fs.pathExists(legacyDir)).toBe(true);
    });

    it('is a no-op when there is nothing to migrate', async () => {
      const result = await migrateLegacyLayout(claudeConfigDir, claudeSyncDir);
      expect(result.movedDir).toBe(false);
      expect(result.updatedShellFiles).toEqual([]);
    });
  });

  describe('migrateLegacyShellMarkers', () => {
    it('rewrites stale jean-claude markers and leaves alias lines intact', async () => {
      const rcPath = path.join(tempDir, '.zshrc');
      const block =
        '\n# jean-claude profile: work\n' +
        "alias claude-work='CLAUDE_CONFIG_DIR=\"/home/u/.claude-work\" claude'\n";
      await fs.writeFile(rcPath, `export FOO=bar${block}`);

      const updated = await migrateLegacyShellMarkers();

      expect(updated).toContain('.zshrc');
      const content = await fs.readFile(rcPath, 'utf-8');
      expect(content).toContain('# claude-sync profile: work');
      expect(content).not.toContain('# jean-claude profile:');
      // The alias command line itself is unchanged
      expect(content).toContain(
        "alias claude-work='CLAUDE_CONFIG_DIR=\"/home/u/.claude-work\" claude'"
      );
    });

    it('does not touch rc files without legacy markers', async () => {
      const rcPath = path.join(tempDir, '.bashrc');
      await fs.writeFile(rcPath, 'export FOO=bar\n');

      const updated = await migrateLegacyShellMarkers();

      expect(updated).toEqual([]);
      expect(await fs.readFile(rcPath, 'utf-8')).toBe('export FOO=bar\n');
    });
  });
});
