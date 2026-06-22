import { Command } from 'commander';
import chalk from 'chalk';
import { handleSyncPush } from './sync.js';
const cmd = new Command('push')
    .description('(deprecated) Use "claude-sync sync push" instead')
    .action(async () => {
    console.error(chalk.yellow('Warning:') +
        ' "claude-sync push" is deprecated. Use ' +
        chalk.cyan('claude-sync sync push') +
        ' instead.');
    console.error('');
    await handleSyncPush();
});
cmd._hidden = true;
export const pushCommand = cmd;
//# sourceMappingURL=push.js.map