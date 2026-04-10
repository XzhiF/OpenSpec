/**
 * Backup Manager
 *
 * Handles versioned backups of artifacts before amendments.
 * Creates .versions/v{n}/ directories and manages version history.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { AmendmentType, AmendmentRecord } from './types.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Manifest for a single backup version.
 */
interface VersionManifest {
  version: number;
  timestamp: string;
  amendmentType: AmendmentType | 'initial' | 'pending';
  reason: string;
  artifacts: string[];
  nextVersion?: number;
}

/**
 * Version log tracking all backups.
 */
interface VersionLog {
  currentVersion: number;
  versions: Array<{
    version: number;
    timestamp: string;
    amendmentType: AmendmentType | 'initial';
    description: string;
    artifacts: string[];
    amendmentFile?: string;
  }>;
}

// -----------------------------------------------------------------------------
// Backup Manager Class
// -----------------------------------------------------------------------------

/**
 * Manages versioned backups for amendments.
 */
export class BackupManager {
  /**
   * Create a backup before amending artifacts.
   *
   * @param changeDir - The change directory path
   * @param artifactsToBackup - List of artifact paths to backup (relative to changeDir)
   * @param reason - Reason for the backup
   * @returns The version number and backup directory path
   */
  async createBackup(
    changeDir: string,
    artifactsToBackup: string[],
    reason: string
  ): Promise<{ version: number; backupDir: string }> {
    // 1. Load or initialize version log
    const versionLog = await this.loadVersionLog(changeDir);
    const currentVersion = versionLog.currentVersion;

    // 2. Create backup directory for current version
    const backupDir = path.join(changeDir, '.versions', `v${currentVersion}`);
    await fs.mkdir(backupDir, { recursive: true });

    // 3. Backup each artifact
    const backedUpArtifacts: string[] = [];

    for (const artifact of artifactsToBackup) {
      const sourcePath = path.join(changeDir, artifact);
      const targetPath = path.join(backupDir, artifact);

      try {
        // Check if source exists
        await fs.access(sourcePath);

        // Ensure target directory exists
        await fs.mkdir(path.dirname(targetPath), { recursive: true });

        // Copy file
        await fs.copyFile(sourcePath, targetPath);
        backedUpArtifacts.push(artifact);
      } catch {
        // File doesn't exist, skip
        console.log(`Skipping backup of ${artifact} (not found)`);
      }
    }

    // 4. Write manifest for this backup
    const manifest: VersionManifest = {
      version: currentVersion,
      timestamp: new Date().toISOString(),
      amendmentType: 'pending',
      reason,
      artifacts: backedUpArtifacts
    };

    await fs.writeFile(
      path.join(backupDir, '.manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    // 5. Update version log (increment version number for next amendment)
    versionLog.currentVersion = currentVersion + 1;
    await this.saveVersionLog(changeDir, versionLog);

    return { version: currentVersion, backupDir };
  }

  /**
   * Update version log after amendment is complete.
   *
   * @param changeDir - The change directory path
   * @param version - The version number that was created
   * @param record - The amendment record
   */
  async updateVersionLog(
    changeDir: string,
    version: number,
    record: AmendmentRecord
  ): Promise<void> {
    const versionLog = await this.loadVersionLog(changeDir);

    // Find or create entry for this version
    let versionEntry = versionLog.versions.find(v => v.version === version);

    if (!versionEntry) {
      // Create new entry
      versionEntry = {
        version,
        timestamp: new Date().toISOString(),
        amendmentType: record.metadata.amendmentType || 'other',
        description: record.metadata.reason,
        artifacts: Object.keys(record.changes).flatMap(key => {
          if (key === 'specs') {
            return record.changes.specs?.map(s => `specs/${s.specName}/spec.md`) || [];
          }
          return [`${key}.md`];
        }),
        amendmentFile: `amendment-v${version}.md`
      };
      versionLog.versions.push(versionEntry);
    } else {
      // Update existing entry
      versionEntry.timestamp = new Date().toISOString();
      versionEntry.description = record.metadata.reason;
      versionEntry.amendmentType = record.metadata.amendmentType || 'other';
      versionEntry.amendmentFile = `amendment-v${version}.md`;
    }

    await this.saveVersionLog(changeDir, versionLog);
  }

  /**
   * Restore artifacts from a specific version backup.
   *
   * @param changeDir - The change directory path
   * @param version - The version to restore from
   * @returns Whether restoration was successful
   */
  async restoreBackup(changeDir: string, version: number): Promise<boolean> {
    const backupDir = path.join(changeDir, '.versions', `v${version}`);

    try {
      // Check if backup exists
      await fs.access(backupDir);

      // Read manifest
      const manifestPath = path.join(backupDir, '.manifest.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest: VersionManifest = JSON.parse(manifestContent);

      // Restore each artifact
      for (const artifact of manifest.artifacts) {
        const sourcePath = path.join(backupDir, artifact);
        const targetPath = path.join(changeDir, artifact);

        try {
          await fs.copyFile(sourcePath, targetPath);
          console.log(`Restored ${artifact} from v${version}`);
        } catch {
          console.log(`Failed to restore ${artifact}`);
        }
      }

      return true;
    } catch {
      console.log(`Backup v${version} not found or invalid`);
      return false;
    }
  }

  /**
   * List all available backup versions.
   *
   * @param changeDir - The change directory path
   * @returns List of version information
   */
  async listBackups(changeDir: string): Promise<Array<{
    version: number;
    timestamp: string;
    reason: string;
    artifacts: string[];
  }>> {
    const versionLog = await this.loadVersionLog(changeDir);

    return versionLog.versions.map(v => ({
      version: v.version,
      timestamp: v.timestamp,
      reason: v.description,
      artifacts: v.artifacts
    }));
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * Load version log from file or create initial one.
   */
  private async loadVersionLog(changeDir: string): Promise<VersionLog> {
    const logPath = path.join(changeDir, '.versions', '.version-log.json');

    try {
      const content = await fs.readFile(logPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      // Initialize new version log
      return {
        currentVersion: 0,
        versions: [
          {
            version: 0,
            timestamp: new Date().toISOString(),
            amendmentType: 'initial',
            description: 'Initial state before any amendments',
            artifacts: []
          }
        ]
      };
    }
  }

  /**
   * Save version log to file.
   */
  private async saveVersionLog(changeDir: string, log: VersionLog): Promise<void> {
    const logPath = path.join(changeDir, '.versions', '.version-log.json');
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(logPath, JSON.stringify(log, null, 2));
  }
}