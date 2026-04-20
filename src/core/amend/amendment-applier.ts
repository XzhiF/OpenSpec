/**
 * Amendment Applier
 *
 * Executes a CONFIRMED amendment by modifying artifacts and applying
 * the tasks rolling plan. Called from `/opsx:apply` workflow.
 *
 * This is the execution phase — amend only PLANS, applier EXECUTES.
 *
 * Flow:
 * 1. Read amendment.md (status must be CONFIRMED)
 * 2. Parse modification logic and change drafts
 * 3. Modify artifacts in order (proposal → specs → design → tasks)
 * 4. Apply tasks rolling plan (rollback/restack/append/deprecate)
 * 5. Update amendment status to APPLIED
 * 6. Write .amendment-state.json
 */

import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import type {
  AmendmentRecord,
  AmendmentStatus,
  ModificationLogic,
  TasksRollingPlan,
  ArtifactModification
} from './types.js';
import { generateAmendmentMd } from './generate-amendment.js';
import { applyTasksRollingPlan } from './enhanced-task-updater.js';
import { BackupManager } from './backup-manager.js';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const AMENDMENT_STATE_FILE = '.amendment-state.json';

// -----------------------------------------------------------------------------
// Main Function
// -----------------------------------------------------------------------------

/**
 * Check if there's a pending amendment that needs to be applied.
 *
 * @param changeDir - The change directory path
 * @returns Amendment status: 'NONE' | 'DRAFT' | 'CONFIRMED' | 'APPLIED'
 */
export async function checkAmendmentStatus(
  changeDir: string
): Promise<{ status: AmendmentStatus | 'NONE'; version?: number }> {
  const amendmentPath = path.join(changeDir, 'amendment.md');

  try {
    const content = await fs.readFile(amendmentPath, 'utf-8');

    // Parse status from the amendment.md content
    const statusMatch = content.match(/\*\*Status\*\*:\s*(DRAFT|CONFIRMED|APPLIED)/);
    if (statusMatch) {
      const status = statusMatch[1] as 'DRAFT' | 'CONFIRMED' | 'APPLIED';

      // Also get version number
      const versionMatch = content.match(/# Amendment v(\d+):/);
      const version = versionMatch ? parseInt(versionMatch[1]) : undefined;

      return { status, version };
    }

    // Legacy amendment.md without status — treat as CONFIRMED (backward compat)
    return { status: 'CONFIRMED', version: undefined };
  } catch {
    // No amendment.md found
    return { status: 'NONE' };
  }
}

/**
 * Apply a confirmed amendment.
 *
 * @param changeDir - The change directory path
 * @returns Result of the apply operation
 */
export async function applyAmendment(
  changeDir: string
): Promise<{
  success: boolean;
  amendmentStatus: AmendmentStatus | 'NONE';
  artifactsModified: string[];
  tasksRollingApplied: boolean;
  error?: string;
}> {
  let spinner: ReturnType<typeof ora>;

  try {
    // ── Step 1: Check amendment status ──
    const { status, version } = await checkAmendmentStatus(changeDir);

    if (status === 'NONE') {
      return {
        success: true,
        amendmentStatus: 'NONE' as AmendmentStatus | 'NONE',
        artifactsModified: [],
        tasksRollingApplied: false
      };
    }

    if (status === 'DRAFT') {
      console.log(chalk.yellow('\nAmendment is in DRAFT status.'));
      console.log(chalk.yellow('Please confirm the amendment first (edit amendment.md status to CONFIRMED).'));
      console.log(chalk.yellow('Then run `/opsx:apply` again.'));
      return {
        success: false,
        amendmentStatus: 'DRAFT',
        artifactsModified: [],
        tasksRollingApplied: false,
        error: 'Amendment is in DRAFT status — needs confirmation'
      };
    }

    if (status === 'APPLIED') {
      console.log(chalk.dim('\nAmendment already applied. Continuing with task implementation.'));
      return {
        success: true,
        amendmentStatus: 'APPLIED',
        artifactsModified: [],
        tasksRollingApplied: false
      };
    }

    // Status is CONFIRMED — proceed with applying

    // ── Step 2: Load amendment record ──
    spinner = ora('Loading amendment...').start();
    const record = await loadAmendmentRecord(changeDir);
    if (!record) {
      spinner.fail('Could not load amendment record');
      return {
        success: false,
        amendmentStatus: 'CONFIRMED',
        artifactsModified: [],
        tasksRollingApplied: false,
        error: 'Could not load amendment record from .amendment-state.json'
      };
    }
    spinner.succeed('Loaded amendment record');

    const amendmentVersion = version || 0;

    // ── Step 3: Modify artifacts in order ──
    const modificationLogic = record.changes.modificationLogic;
    const artifactsModified: string[] = [];

    if (modificationLogic) {
      spinner = ora('Applying artifact modifications...').start();

      for (const artifactName of modificationLogic.modificationOrder) {
        const mod = modificationLogic.affectedArtifacts.find(a => a.artifact === artifactName);
        if (!mod) continue;

        const applied = await applyArtifactModification(changeDir, mod, amendmentVersion);
        if (applied) {
          artifactsModified.push(artifactName);
        }
      }

      spinner.succeed(`Modified ${artifactsModified.length} artifacts`);
    }

    // ── Step 4: Apply tasks rolling plan ──
    let tasksRollingApplied = false;

    if (record.changes.tasksRolling) {
      spinner = ora('Applying tasks rolling plan...').start();

      const result = await applyTasksRollingPlan(
        changeDir,
        record.changes.tasksRolling,
        amendmentVersion
      );

      tasksRollingApplied = true;
      spinner.succeed(
        `Tasks rolling applied: ${result.rollbackCount} rollback, ` +
        `${result.restackCount} restack, ${result.appendCount} append, ` +
        `${result.deprecateCount} deprecate`
      );
    }

    // ── Step 5: Update amendment status to APPLIED ──
    spinner = ora('Updating amendment status...').start();

    const updatedRecord = {
      ...record,
      metadata: {
        ...record.metadata,
        status: 'APPLIED' as AmendmentStatus
      },
      confirmationChecklist: {
        ...record.confirmationChecklist,
        readyToApply: true
      }
    };

    // Rewrite amendment.md with APPLIED status
    const content = await generateAmendmentMd(changeDir, updatedRecord, amendmentVersion);
    const latestPath = path.join(changeDir, 'amendment.md');
    await fs.writeFile(latestPath, content);

    if (amendmentVersion > 0) {
      const versionedPath = path.join(changeDir, `amendment-v${amendmentVersion}.md`);
      await fs.writeFile(versionedPath, content);
    }

    // Update .amendment-state.json
    await updateAmendmentState(changeDir, 'APPLIED');

    spinner.succeed('Amendment status: APPLIED');

    // ── Summary ──
    console.log(chalk.bold('\nAmendment Applied!\n'));
    console.log(`Artifacts modified: ${artifactsModified.join(', ') || 'none'}`);
    if (tasksRollingApplied) {
      console.log('Tasks rolling: applied');
    }
    console.log(chalk.green('\nContinuing with task implementation...'));

    return {
      success: true,
      amendmentStatus: 'APPLIED',
      artifactsModified,
      tasksRollingApplied
    };

  } catch (error) {
    console.log();
    ora().fail(`Error applying amendment: ${(error as Error).message}`);
    return {
      success: false,
      amendmentStatus: 'CONFIRMED',
      artifactsModified: [],
      tasksRollingApplied: false,
      error: (error as Error).message
    };
  }
}

// -----------------------------------------------------------------------------
// Internal Functions
// -----------------------------------------------------------------------------

/**
 * Load amendment record from .amendment-state.json.
 */
async function loadAmendmentRecord(changeDir: string): Promise<AmendmentRecord | null> {
  const statePath = path.join(changeDir, AMENDMENT_STATE_FILE);

  try {
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);

    // Build a record from the state
    // The full record is in amendment.md, but we need the structured data
    // For now, we reconstruct from what we have
    return {
      metadata: {
        changeName: state.changeName || '',
        created: state.timestamp || new Date().toISOString(),
        amendmentType: state.amendmentType,
        reason: state.reason || '',
        triggeredBy: state.triggeredBy || '',
        status: state.status || 'CONFIRMED'
      },
      summary: '',
      changes: state.changes || {},
      impactAnalysis: state.impactAnalysis || {
        codeImpact: { affectedFiles: [], estimatedEffort: '', backwardCompatible: true },
        dependencyImpact: { remove: [], add: [] }
      },
      rollbackPlan: '',
      nextSteps: [],
      confirmationChecklist: state.confirmationChecklist || {
        modificationLogicCorrect: false,
        changeDraftsComplete: false,
        tasksRollingFeasible: false,
        impactAcceptable: false,
        readyToApply: false
      }
    };
  } catch {
    // Try to parse from amendment.md content instead
    return parseRecordFromAmendmentMd(changeDir);
  }
}

/**
 * Parse amendment record from amendment.md content (fallback).
 */
async function parseRecordFromAmendmentMd(changeDir: string): Promise<AmendmentRecord | null> {
  const amendmentPath = path.join(changeDir, 'amendment.md');

  try {
    const content = await fs.readFile(amendmentPath, 'utf-8');

    // Parse basic metadata
    const versionMatch = content.match(/# Amendment v(\d+): (.+)/);
    const createdMatch = content.match(/\*\*Created\*\*:\s*(.+)/);
    const reasonMatch = content.match(/\*\*Reason\*\*:\s*(.+)/);
    const triggeredByMatch = content.match(/\*\*Triggered By\*\*:\s*(.+)/);
    const typeMatch = content.match(/\*\*Amendment Type\*\*:\s*(.+)/);

    return {
      metadata: {
        changeName: versionMatch?.[2] || '',
        created: createdMatch?.[1] || new Date().toISOString(),
        amendmentType: typeMatch?.[1] as AmendmentRecord['metadata']['amendmentType'],
        reason: reasonMatch?.[1] || '',
        triggeredBy: triggeredByMatch?.[1] || '',
        status: 'CONFIRMED'
      },
      summary: '',
      changes: {},
      impactAnalysis: {
        codeImpact: { affectedFiles: [], estimatedEffort: '', backwardCompatible: true },
        dependencyImpact: { remove: [], add: [] }
      },
      rollbackPlan: '',
      nextSteps: [],
      confirmationChecklist: {
        modificationLogicCorrect: false,
        changeDraftsComplete: false,
        tasksRollingFeasible: false,
        impactAcceptable: false,
        readyToApply: true // It's confirmed, so ready to apply
      }
    };
  } catch {
    return null;
  }
}

/**
 * Apply a single artifact modification.
 */
async function applyArtifactModification(
  changeDir: string,
  mod: ArtifactModification,
  version: number
): Promise<boolean> {
  switch (mod.artifact) {
    case 'proposal':
      return await annotateArtifact(changeDir, 'proposal.md', version, mod.reason);
    case 'design':
      return await annotateArtifact(changeDir, 'design.md', version, mod.reason);
    case 'tasks':
      // Tasks are handled separately via TasksRollingPlan
      return false;
    case 'specs':
      return await annotateSpecsDir(changeDir, version, mod.action, mod.reason);
    default:
      // Could be a specific spec like 'specs/auth'
      if (mod.artifact.startsWith('specs/')) {
        const specName = mod.artifact.replace('specs/', '');
        return await annotateSpec(changeDir, specName, version, mod.action, mod.reason);
      }
      return false;
  }
}

/**
 * Add version annotation comment to an artifact file.
 */
async function annotateArtifact(
  changeDir: string,
  fileName: string,
  version: number,
  reason: string
): Promise<boolean> {
  const filePath = path.join(changeDir, fileName);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const annotation = `<!-- Amendment v${version}: ${new Date().toISOString().split('T')[0]} - ${reason} -->`;

    // Add annotation at the top of the file (after any existing header)
    const lines = content.split('\n');

    // Find the first blank line after the title (if exists)
    let insertIndex = 0;
    if (lines[0]?.startsWith('#')) {
      insertIndex = 1;
      // Skip any existing amendment annotations
      while (insertIndex < lines.length && lines[insertIndex]?.startsWith('<!-- Amendment v')) {
        insertIndex++;
      }
      // Skip blank lines after header
      while (insertIndex < lines.length && lines[insertIndex]?.trim() === '') {
        insertIndex++;
      }
    }

    // Insert annotation
    const newLines = [
      ...lines.slice(0, insertIndex),
      annotation,
      '',
      ...lines.slice(insertIndex)
    ];

    await fs.writeFile(filePath, newLines.join('\n'));
    return true;
  } catch {
    // File might not exist — skip
    return false;
  }
}

/**
 * Add version annotation to all specs in the specs directory.
 */
async function annotateSpecsDir(
  changeDir: string,
  version: number,
  action: string,
  reason: string
): Promise<boolean> {
  const specsDir = path.join(changeDir, 'specs');
  let anyModified = false;

  try {
    const entries = await fs.readdir(specsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const modified = await annotateSpec(changeDir, entry.name, version, action, reason);
        if (modified) anyModified = true;
      }
    }
  } catch {
    // specs directory doesn't exist
  }

  return anyModified;
}

/**
 * Add version annotation to a single spec file.
 */
async function annotateSpec(
  changeDir: string,
  specName: string,
  version: number,
  action: string,
  reason: string
): Promise<boolean> {
  const specPath = path.join(changeDir, 'specs', specName, 'spec.md');

  try {
    const content = await fs.readFile(specPath, 'utf-8');
    const annotation = `<!-- Amendment v${version}: ${action} - ${reason} -->`;

    // Add annotation at the top
    const lines = content.split('\n');
    let insertIndex = 0;
    if (lines[0]?.startsWith('#')) {
      insertIndex = 1;
      while (insertIndex < lines.length && lines[insertIndex]?.startsWith('<!-- Amendment v')) {
        insertIndex++;
      }
      while (insertIndex < lines.length && lines[insertIndex]?.trim() === '') {
        insertIndex++;
      }
    }

    const newLines = [
      ...lines.slice(0, insertIndex),
      annotation,
      '',
      ...lines.slice(insertIndex)
    ];

    await fs.writeFile(specPath, newLines.join('\n'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Update the .amendment-state.json status field.
 */
async function updateAmendmentState(
  changeDir: string,
  newStatus: AmendmentStatus
): Promise<void> {
  const statePath = path.join(changeDir, AMENDMENT_STATE_FILE);

  try {
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);
    const updatedState = {
      ...state,
      status: newStatus,
      pausedByUser: false
    };
    await fs.writeFile(statePath, JSON.stringify(updatedState, null, 2));
  } catch {
    // State file doesn't exist — create it
    const state = {
      changeName: '',
      timestamp: new Date().toISOString(),
      amendmentType: 'other',
      status: newStatus,
      progress: { completed: [], inProgress: null, pending: [] },
      artifactsToAmend: [],
      pausedByUser: false
    };
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
  }
}