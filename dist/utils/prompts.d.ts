export declare function confirm(message: string, defaultValue?: boolean): Promise<boolean>;
export declare function input(message: string, defaultValue?: string): Promise<string>;
export declare function select<T extends string>(message: string, choices: Array<{
    name: string;
    value: T;
}>): Promise<T>;
//# sourceMappingURL=prompts.d.ts.map