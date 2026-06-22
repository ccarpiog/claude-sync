import type { ProfileConfig, Profile } from '../types/index.js';
/**
 * Items that get symlinked from the main ~/.claude/ into profile directories.
 * Everything else in the profile dir is profile-specific.
 */
export declare const SHARED_ITEMS: ({
    name: string;
    type: "file";
} | {
    name: string;
    type: "directory";
})[];
export declare function loadProfiles(): Promise<ProfileConfig>;
export declare function saveProfiles(config: ProfileConfig): Promise<void>;
export declare function getProfileConfigDir(name: string): string;
export interface CreateProfileOptions {
    shareStatusline?: boolean;
    shareClaudeMd?: boolean;
}
export declare function createProfile(name: string, options?: CreateProfileOptions): Promise<Profile>;
export declare function createSymlinks(sourceDir: string, targetDir: string): Promise<string[]>;
export declare function refreshSymlinks(name: string): Promise<string[]>;
export declare function deleteProfile(name: string): Promise<Profile>;
export declare function getShellAliasLine(profile: Profile): string;
export declare function getShellAliasBlock(name: string, profile: Profile): string;
export declare function installShellAlias(name: string, profile: Profile, shellConfigFile: string): Promise<void>;
export declare function removeShellAlias(name: string, shellConfigFile: string): Promise<boolean>;
export declare function detectShellConfigFiles(): Array<{
    name: string;
    value: string;
}>;
//# sourceMappingURL=profiles.d.ts.map