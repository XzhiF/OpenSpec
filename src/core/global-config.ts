import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getGlobalConfigDir as _getGlobalConfigDir,
  getGlobalConfigPath as _getGlobalConfigPath,
  getGlobalDataDir as _getGlobalDataDir
} from './config-path.js';

// Constants
export const GLOBAL_CONFIG_FILE_NAME = 'config.json';

// Re-export functions for backward compatibility
export const getGlobalConfigDir = _getGlobalConfigDir;
export const getGlobalConfigPath = _getGlobalConfigPath;
export const getGlobalDataDir = _getGlobalDataDir;

// TypeScript types
export type Profile = 'core' | 'custom';
export type Delivery = 'both' | 'skills' | 'commands';

// TypeScript interfaces
export interface GlobalConfig {
  featureFlags?: Record<string, boolean>;
  profile?: Profile;
  delivery?: Delivery;
  workflows?: string[];
}

const DEFAULT_CONFIG: GlobalConfig = {
  featureFlags: {},
  profile: 'core',
  delivery: 'both',
};

/**
 * Loads the global configuration from disk.
 * Returns default configuration if file doesn't exist or is invalid.
 * Merges loaded config with defaults to ensure new fields are available.
 */
export function getGlobalConfig(): GlobalConfig {
  const configPath = getGlobalConfigPath();

  try {
    if (!fs.existsSync(configPath)) {
      return { ...DEFAULT_CONFIG };
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Merge with defaults (loaded values take precedence)
    const merged: GlobalConfig = {
      ...DEFAULT_CONFIG,
      ...parsed,
      // Deep merge featureFlags
      featureFlags: {
        ...DEFAULT_CONFIG.featureFlags,
        ...(parsed.featureFlags || {})
      }
    };

    // Schema evolution: apply defaults for new fields if not present in loaded config
    if (parsed.profile === undefined) {
      merged.profile = DEFAULT_CONFIG.profile;
    }
    if (parsed.delivery === undefined) {
      merged.delivery = DEFAULT_CONFIG.delivery;
    }

    return merged;
  } catch (error) {
    // Log warning for parse errors, but not for missing files
    if (error instanceof SyntaxError) {
      console.error(`Warning: Invalid JSON in ${configPath}, using defaults`);
    }
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Saves the global configuration to disk.
 * Creates the config directory if it doesn't exist.
 */
export function saveGlobalConfig(config: GlobalConfig): void {
  const configDir = getGlobalConfigDir();
  const configPath = getGlobalConfigPath();

  // Create directory if it doesn't exist
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
