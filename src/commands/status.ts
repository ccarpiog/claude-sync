import { Command } from 'commander';
import chalk from 'chalk';
import { handleSyncStatus } from './sync.js';

const cmd = new Command('status')
  .description('(deprecated) Use "claude-sync sync status" instead')
  .action(async () => {
    console.error(
      chalk.yellow('Warning:') +
      ' "claude-sync status" is deprecated. Use ' +
      chalk.cyan('claude-sync sync status') +
      ' instead.'
    );
    console.error('');
    await handleSyncStatus();
  });

(cmd as unknown as { _hidden: boolean })._hidden = true;
export const statusCommand = cmd;
