import inquirer from 'inquirer';
export async function confirm(message, defaultValue = true) {
    const { confirmed } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirmed',
            message,
            default: defaultValue,
        },
    ]);
    return confirmed;
}
export async function input(message, defaultValue) {
    const { value } = await inquirer.prompt([
        {
            type: 'input',
            name: 'value',
            message,
            default: defaultValue,
        },
    ]);
    return value;
}
export async function select(message, choices) {
    const { selected } = await inquirer.prompt([
        {
            type: 'list',
            name: 'selected',
            message,
            choices,
        },
    ]);
    return selected;
}
//# sourceMappingURL=prompts.js.map