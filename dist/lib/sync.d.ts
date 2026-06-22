import type { FileMapping, SyncResult, MetaJson } from '../types/index.js';
export declare const FILE_MAPPINGS: FileMapping[];
export declare function compareFiles(sourceDir: string, targetDir: string): Promise<Array<{
    mapping: FileMapping;
    inSync: boolean;
    sourceExists: boolean;
    targetExists: boolean;
}>>;
export declare function syncToClaudeConfig(claudeSyncDir: string, claudeConfigDir: string, dryRun?: boolean): Promise<SyncResult[]>;
export declare function importFromClaudeConfig(claudeConfigDir: string, claudeSyncDir: string): Promise<SyncResult[]>;
export declare function syncFromClaudeConfig(claudeConfigDir: string, claudeSyncDir: string): Promise<SyncResult[]>;
export declare function createMetaJson(claudeConfigPath: string): MetaJson;
export declare function readMetaJson(claudeSyncDir: string): Promise<MetaJson | null>;
export declare function writeMetaJson(claudeSyncDir: string, meta: MetaJson): Promise<void>;
export declare function updateLastSync(claudeSyncDir: string): Promise<void>;
//# sourceMappingURL=sync.d.ts.map