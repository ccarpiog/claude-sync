import { Command } from 'commander';
export declare function handleSyncPush(): Promise<void>;
export declare function handleSyncPull(options?: {
    force?: boolean;
}): Promise<void>;
export declare function handleSyncStatus(): Promise<void>;
export declare const syncCommand: Command;
//# sourceMappingURL=sync.d.ts.map