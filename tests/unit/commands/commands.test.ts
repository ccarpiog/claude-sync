import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { syncCommand, handleSyncPull } from '../../../src/commands/sync.js';
import { initCommand } from '../../../src/commands/init.js';
import { pullCommand } from '../../../src/commands/pull.js';
import { pushCommand } from '../../../src/commands/push.js';
import { statusCommand } from '../../../src/commands/status.js';
import * as logger from '../../../src/utils/logger.js';
import * as paths from '../../../src/lib/paths.js';
import * as syncSetup from '../../../src/lib/sync-setup.js';
import * as prompts from '../../../src/utils/prompts.js';
import * as git from '../../../src/lib/git.js';
import * as sync from '../../../src/lib/sync.js';

describe('sync command group (#13)', () => {
  it('has subcommands: setup, push, pull, status', () => {
    const subcommandNames = syncCommand.commands.map(c => c.name());
    expect(subcommandNames).toContain('setup');
    expect(subcommandNames).toContain('push');
    expect(subcommandNames).toContain('pull');
    expect(subcommandNames).toContain('status');
  });

  it('sync setup has --url flag (#13)', () => {
    const setupCmd = syncCommand.commands.find(c => c.name() === 'setup');
    expect(setupCmd).toBeDefined();
    const urlOption = setupCmd!.options.find(o => o.long === '--url');
    expect(urlOption).toBeDefined();
  });

  it('sync pull has --force flag (#18)', () => {
    const pullCmd = syncCommand.commands.find(c => c.name() === 'pull');
    expect(pullCmd).toBeDefined();
    const forceOption = pullCmd!.options.find(o => o.long === '--force');
    expect(forceOption).toBeDefined();
  });
});

describe('init command (#20, #21, #38)', () => {
  it('has --sync, --no-sync, and --url options (#20)', () => {
    const optionFlags = initCommand.options.map(o => o.long);
    expect(optionFlags).toContain('--sync');
    expect(optionFlags).toContain('--url');
  });

  it('--sync description contains "without prompting" (#21)', () => {
    const syncOption = initCommand.options.find(o => o.long === '--sync');
    expect(syncOption).toBeDefined();
    expect(syncOption!.description).toContain('without prompting');
  });

  it('--no-sync description contains "without prompting" (#21)', () => {
    const noSyncOption = initCommand.options.find(o => o.long === '--no-sync');
    expect(noSyncOption).toBeDefined();
    expect(noSyncOption!.description).toContain('without prompting');
  });

  it('--url option exists and description contains "implies --sync" (#38)', () => {
    const urlOption = initCommand.options.find(o => o.long === '--url');
    expect(urlOption).toBeDefined();
    expect(urlOption!.description).toContain('implies --sync');
  });
});

describe('init command behavior (#20, #38)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-sync-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(tempDir);
  });

  it('detects existing .git directory on partial init recovery (#20)', async () => {
    const claudeSyncDir = path.join(tempDir, '.claude-sync');
    await fs.ensureDir(claudeSyncDir);

    // Create a .git directory to simulate partial init
    await fs.ensureDir(path.join(claudeSyncDir, '.git'));

    // Mock paths to use our temp dir
    vi.spyOn(paths, 'getConfigPaths').mockReturnValue({
      claudeSyncDir,
      claudeConfigDir: path.join(tempDir, '.claude'),
      platform: 'linux',
    });
    vi.spyOn(paths, 'ensureDir').mockImplementation(() => {});

    // Mock setupGitSync to avoid actual git operations
    vi.spyOn(syncSetup, 'setupGitSync').mockResolvedValue();

    // Mock confirm to say no to sync
    vi.spyOn(prompts, 'confirm').mockResolvedValue(false);

    // Spy on logger.info to check for the message
    const infoSpy = vi.spyOn(logger.logger, 'info');

    // Run init command action directly
    await initCommand.parseAsync(['node', 'test', '--no-sync']);

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('Found existing Git repository')
    );
  });

  it('warns when --url and --no-sync are used together (#38)', async () => {
    const claudeSyncDir = path.join(tempDir, '.claude-sync');
    await fs.ensureDir(claudeSyncDir);

    vi.spyOn(paths, 'getConfigPaths').mockReturnValue({
      claudeSyncDir,
      claudeConfigDir: path.join(tempDir, '.claude'),
      platform: 'linux',
    });
    vi.spyOn(paths, 'ensureDir').mockImplementation(() => {});

    // Mock setupGitSync to avoid actual git operations
    vi.spyOn(syncSetup, 'setupGitSync').mockResolvedValue();

    // Spy on logger.warn
    const warnSpy = vi.spyOn(logger.logger, 'warn');

    await initCommand.parseAsync(['node', 'test', '--no-sync', '--url', 'https://example.com/repo.git']);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('--url implies --sync')
    );
  });
});

describe('deprecated commands (#13, #39)', () => {
  it('deprecated pull command exists and is hidden', () => {
    expect(pullCommand).toBeDefined();
    expect(pullCommand.name()).toBe('pull');
    expect((pullCommand as unknown as { _hidden: boolean })._hidden).toBe(true);
  });

  it('deprecated pull command has --force flag (#39)', () => {
    const forceOption = pullCommand.options.find(o => o.long === '--force');
    expect(forceOption).toBeDefined();
  });

  it('deprecated push command exists and is hidden', () => {
    expect(pushCommand).toBeDefined();
    expect(pushCommand.name()).toBe('push');
    expect((pushCommand as unknown as { _hidden: boolean })._hidden).toBe(true);
  });

  it('deprecated status command exists and is hidden', () => {
    expect(statusCommand).toBeDefined();
    expect(statusCommand.name()).toBe('status');
    expect((statusCommand as unknown as { _hidden: boolean })._hidden).toBe(true);
  });
});

describe('sync pull deletes-local-files warning', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-sync-test-'));
    const claudeSyncDir = path.join(tempDir, '.claude-sync');
    await fs.ensureDir(claudeSyncDir);

    vi.spyOn(paths, 'getConfigPaths').mockReturnValue({
      claudeSyncDir,
      claudeConfigDir: path.join(tempDir, '.claude'),
      platform: 'linux',
    });

    // Stub the git layer so no real repo work happens; a clean status means the
    // first (discard-repo-changes) prompt is skipped, isolating the new prompt.
    vi.spyOn(git, 'isGitRepo').mockResolvedValue(true);
    vi.spyOn(git, 'getGitStatus').mockResolvedValue({
      branch: 'main',
      remote: 'origin',
      isClean: true,
      modified: [],
      untracked: [],
      ahead: 0,
      behind: 0,
    });
    vi.spyOn(git, 'resetHard').mockResolvedValue(undefined);
    vi.spyOn(git, 'cleanUntracked').mockResolvedValue(undefined);
    vi.spyOn(git, 'pull').mockResolvedValue({ success: true, message: 'Pulled' });
    vi.spyOn(git, 'hasMergeConflicts').mockResolvedValue(false);
    vi.spyOn(sync, 'updateLastSync').mockResolvedValue(undefined);

    // The mirror would delete one local file (absent from the synced repo).
    vi.spyOn(sync, 'syncToClaudeConfig').mockResolvedValue([
      { file: 'CLAUDE.md', action: 'deleted', source: 'a', target: 'b' },
    ]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(tempDir);
  });

  it('aborts the apply when the user declines the deletion prompt', async () => {
    const confirmSpy = vi.spyOn(prompts, 'confirm').mockResolvedValue(false);

    await handleSyncPull({});

    // Prompted about the deletion...
    expect(confirmSpy).toHaveBeenCalledWith(
      'Delete these local files and apply?',
      false
    );
    // ...and aborted before the real apply: only the dry-run preview ran, and
    // the last-sync timestamp was not updated.
    expect(sync.syncToClaudeConfig).toHaveBeenCalledTimes(1);
    expect(sync.syncToClaudeConfig).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      true
    );
    expect(sync.updateLastSync).not.toHaveBeenCalled();
  });

  it('skips the prompt and applies when --force is used', async () => {
    const confirmSpy = vi.spyOn(prompts, 'confirm').mockResolvedValue(false);

    await handleSyncPull({ force: true });

    // No prompt under --force, but the apply still runs (preview + real).
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(sync.syncToClaudeConfig).toHaveBeenCalledTimes(2);
    expect(sync.updateLastSync).toHaveBeenCalled();
  });
});
