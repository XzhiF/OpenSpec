import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

/**
 * Determine the config directory name based on package name
 * Returns 'xzf-openspec' for xzf-openspec package, 'openspec' otherwise
 */
export function getConfigDirName(): string {
  // Method 1: Check environment variable override
  const envOverride = process.env.OPENSPEC_CONFIG_DIR_NAME;
  if (envOverride) {
    return envOverride;
  }

  // Method 2: Try to detect from package.json
  try {
    // Walk up from current directory to find package.json
    let currentDir = __dirname;
    while (currentDir !== path.dirname(currentDir)) {
      const pkgPath = path.join(currentDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(pkgContent);
        if (pkg.name && pkg.name.includes('xzf-openspec')) {
          return 'xzf-openspec';
        }
        break;
      }
      currentDir = path.dirname(currentDir);
    }
  } catch {
    // Ignore errors, fallback to default
  }

  // Default: use 'openspec'
  return 'openspec';
}

/**
 * Get the global config directory path
 */
export function getGlobalConfigDir(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  const configBase = xdgConfigHome || path.join(os.homedir(), '.config');
  return path.join(configBase, getConfigDirName());
}

/**
 * Get the global config file path
 */
export function getGlobalConfigPath(): string {
  return path.join(getGlobalConfigDir(), 'config.json');
}

/**
 * Get the global data directory path
 */
export function getGlobalDataDir(): string {
  const xdgDataHome = process.env.XDG_DATA_HOME;
  const dataBase = xdgDataHome || path.join(os.homedir(), '.local', 'share');
  return path.join(dataBase, getConfigDirName());
}