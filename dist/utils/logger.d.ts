export declare const logger: {
    info: (msg: string) => void;
    success: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    step: (num: number, total: number, msg: string) => void;
    banner: (title: string, subtitle?: string) => void;
    heading: (msg: string) => void;
    dim: (msg: string) => void;
    list: (items: string[]) => void;
    table: (rows: [string, string][]) => void;
};
export declare function formatPath(p: string): string;
//# sourceMappingURL=logger.d.ts.map