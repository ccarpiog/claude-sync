import chalk from 'chalk';
const orange = chalk.hex('#FF6B4A');
export const logger = {
    info: (msg) => console.log(chalk.blue('info') + ' ' + msg),
    success: (msg) => console.log(chalk.green('✓') + ' ' + msg),
    warn: (msg) => console.log(chalk.yellow('warning') + ' ' + msg),
    error: (msg) => console.error(chalk.red('error') + ' ' + msg),
    step: (num, total, msg) => {
        console.log(chalk.dim(`[${num}/${total}]`) + ' ' + msg);
    },
    banner: (title, subtitle) => {
        const lines = [title];
        if (subtitle)
            lines.push(subtitle);
        const maxLen = Math.max(...lines.map((l) => l.length));
        const width = maxLen + 4;
        const border = chalk.dim;
        console.log('');
        console.log(border('╭' + '─'.repeat(width) + '╮'));
        for (const line of lines) {
            const padded = line.padEnd(maxLen);
            console.log(border('│') + '  ' + orange(padded) + '  ' + border('│'));
        }
        console.log(border('╰' + '─'.repeat(width) + '╯'));
    },
    heading: (msg) => {
        console.log('');
        console.log(orange('■') + ' ' + chalk.bold(msg));
    },
    dim: (msg) => console.log(chalk.dim(msg)),
    list: (items) => {
        items.forEach((item) => console.log('  ' + chalk.dim('•') + ' ' + item));
    },
    table: (rows) => {
        const maxKeyLen = Math.max(...rows.map(([k]) => k.length));
        rows.forEach(([key, value]) => {
            console.log('  ' + chalk.dim(key.padEnd(maxKeyLen)) + '  ' + value);
        });
    },
};
export function formatPath(p) {
    const home = process.env.HOME || '';
    if (home && p.startsWith(home)) {
        return '~' + p.slice(home.length);
    }
    return p;
}
//# sourceMappingURL=logger.js.map