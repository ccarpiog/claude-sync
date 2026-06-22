import { Command } from 'commander';
import chalk from 'chalk';
import { handleSyncPull } from './sync.js';
const cmd = new Command('pull')
    .description('(deprecated) Use "claude-sync sync pull" instead')
    .option('--force', 'Skip confirmation when discarding local changes')
    .action(async (options) => {
    console.error(chalk.yellow('Warning:') +
        ' "claude-sync pull" is deprecated. Use ' +
        chalk.cyan('claude-sync sync pull') +
        ' instead.');
    console.error('');
    await handleSyncPull(options);
});
cmd._hidden = true;
export const pullCommand = cmd;
//# sourceMappingURL=pull.js.map