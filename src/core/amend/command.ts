/**
 * Amend Command
 *
 * Main command class for the amend workflow.
 * Redesigned: Amend = Plan, Not Execute.
 *
 * New flow: Analysis → Draft → Confirm → Wait
 * - Analyzes modification intent (does NOT modify files)
 * - Drafts amendment.md with revision plan
 * - Presents plan for user confirmation
 * - Actual execution happens via `/opsx:apply`
 */

import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import type {
  AmendmentType,
  AmendmentState,
  AmendmentRecord,
  AmendOptions,
  AmendmentResult,
  AmendmentStatus,
  TaskProgress as AmendTaskProgress
} from './types.js';
import { getArtifactsForType, getAmendmentTypeDescription } from './types.js';
import { getTaskProgressForChange } from '../../utils/task-progress.js';
import type { TaskProgress as UtilsTaskProgress } from '../../utils/task-progress.js';
import { draftAmendmentRecord, writeAmendmentDocument, updateAmendmentStatus } from './amendment-drafter.js';
import { BackupManager } from './backup-manager.js';
import { parseTasks } from './update-tasks.js';
import { isInteractive } from '../../utils/interactive.js';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const AMENDMENT_STATE_FILE = '.amendment-state.json';

const AMENDMENT_TYPE_OPTIONS: Array<{ name: string; value: AmendmentType; description: string }> = [
  {
    name: 'Design Issue',
    value: 'design-issue',
    description: 'Implementation revealed design flaw'
  },
  {
    name: 'Missing Feature',
    value: 'missing-feature',
    description: 'Forgot to include functionality'
  },
  {
    name: 'Spec Error',
    value: 'spec-error',
    description: "Spec doesn't match expected behavior"
  },
  {
    name: 'Scope Change',
    value: 'scope-change',
    description: 'Need to expand/narrow scope'
  },
  {
    name: 'Other',
    value: 'other',
    description: 'Other reason'
  }
];

// -----------------------------------------------------------------------------
// Amend Command Class
// -----------------------------------------------------------------------------

export class AmendCommand {
  async execute(
    changeName?: string,
    options: AmendOptions = {}
  ): Promise<AmendmentResult> {
    const targetPath = '.';
    const changesDir = path.join(targetPath, 'openspec', 'changes');

    let spinner: ReturnType<typeof ora>;

    try {
      // ── Step 1: Find active change ──
      if (!changeName) {
        const foundChange = await this.findActiveChange(changesDir);
        if (!foundChange) {
          throw new Error('No active change found. Please specify a change name.');
        }
        changeName = foundChange;
      }

      const changeDir = path.join(changesDir, changeName);

      // ── Step 2: Verify change exists ──
      const changeExists = await this.changeExists(changeDir);
      if (!changeExists) {
        throw new Error(`Change '${changeName}' not found.`);
      }

      // ── Step 3: Get current progress ──
      spinner = ora('Checking current progress...').start();
      const utilsProgress = await getTaskProgressForChange(changesDir, changeName);
      spinner.succeed(`Current progress: ${utilsProgress.completed}/${utilsProgress.total} tasks complete`);

      if (utilsProgress.total === 0) {
        throw new Error('No tasks found in this change. Run /opsx:ff or /opsx:continue first.');
      }

      // Build amend-specific TaskProgress with detailed IDs
      const amendProgress = await this.buildAmendTaskProgress(changeDir, utilsProgress);

      // ── Step 4: Determine amendment type ──
      const amendmentType = options.type || await this.promptAmendmentType(options);

      // ── Step 5: Collect user description ──
      const userDescription = options.description || await this.promptUserDescription(amendmentType, options);
      const triggeredBy = await this.determineTriggeredBy(amendProgress, options);

      // ── Step 6: Create backup (before any changes) ──
      const backupManager = new BackupManager();
      const artifactsToAmend = options.artifacts || getArtifactsForType(amendmentType);

      spinner = ora('Creating backup...').start();
      const { version, backupDir } = await backupManager.createBackup(
        changeDir,
        artifactsToAmend,
        `Before ${amendmentType} amendment`
      );
      spinner.succeed(`Backup created: v${version} (${backupDir})`);

      // ── Step 7: ANALYZE — Run modification analysis ──
      spinner = ora('Analyzing modification intent...').start();
      const record = await draftAmendmentRecord(
        changeDir,
        changeName,
        amendmentType,
        userDescription,
        triggeredBy,
        amendProgress,
        version
      );
      spinner.succeed('Modification analysis complete');

      console.log(chalk.dim(`\nAmendment type: ${getAmendmentTypeDescription(amendmentType)}`));
      console.log(chalk.dim(`Artifacts to amend: ${artifactsToAmend.join(', ')}\n`));

      // ── Step 8: DRAFT — Write amendment.md ──
      spinner = ora('Drafting amendment.md...').start();
      const amendmentPath = await writeAmendmentDocument(changeDir, record, version);
      spinner.succeed(`Drafted amendment.md (v${version}, status: DRAFT)`);

      // ── Step 9: Save amendment state ──
      const state: AmendmentState = {
        changeName,
        timestamp: new Date().toISOString(),
        amendmentType,
        status: 'DRAFT',
        progress: {
          completed: amendProgress.completedIds,
          inProgress: amendProgress.inProgressId,
          pending: amendProgress.pendingIds
        },
        artifactsToAmend,
        pausedByUser: true
      };
      await this.saveAmendmentState(changeDir, state);

      // ── Step 10: Update version log ──
      await backupManager.updateVersionLog(changeDir, version, record);

      // ── Step 11: PRESENT — Show amendment summary ──
      this.showDraftSummary(record, version, backupDir);

      // ── Step 12: CONFIRM or WAIT ──
      const confirmed = options.autoConfirm || await this.promptConfirmation(options);

      if (confirmed) {
        // Mark as CONFIRMED — actual execution happens in /opsx:apply
        await updateAmendmentStatus(changeDir, record, version, 'CONFIRMED');

        console.log(chalk.green('\nAmendment confirmed! Status: CONFIRMED'));
        console.log(chalk.yellow('\nNext: Run `/opsx:apply` to execute the amendment and continue implementation.'));
      } else {
        console.log(chalk.dim('\nAmendment remains in DRAFT status.'));
        console.log(chalk.dim('Review amendment.md, then confirm by editing the status field to CONFIRMED.'));
        console.log(chalk.dim('After confirmation, run `/opsx:apply` to execute.'));
      }

      // ── Step 13: Return result ──
      const rollingPlan = record.changes.tasksRolling;

      return {
        success: true,
        version,
        backupDir,
        amendmentPath,
        status: confirmed ? 'CONFIRMED' : 'DRAFT',
        tasksPreserved: rollingPlan?.newSequence.filter(s => s.status === 'completed').length || 0,
        tasksRollback: rollingPlan?.rollback.length || 0,
        tasksRestack: rollingPlan?.restack.length || 0,
        tasksAppend: rollingPlan?.append.length || 0,
        tasksDeprecate: rollingPlan?.deprecate.length || 0
      };

    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      return {
        success: false,
        error: (error as Error).message,
        tasksPreserved: 0,
        tasksRollback: 0,
        tasksRestack: 0,
        tasksAppend: 0,
        tasksDeprecate: 0
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * Find the most recently modified active change.
   */
  private async findActiveChange(changesDir: string): Promise<string | null> {
    try {
      const entries = await fs.readdir(changesDir, { withFileTypes: true });
      const changeDirs = entries
        .filter(e => e.isDirectory() && e.name !== 'archive')
        .map(e => e.name);

      if (changeDirs.length === 0) {
        return null;
      }

      if (changeDirs.length === 1) {
        return changeDirs[0];
      }

      // Find most recently modified
      let mostRecent = changeDirs[0];
      let mostRecentTime = 0;

      for (const dir of changeDirs) {
        const stat = await fs.stat(path.join(changesDir, dir));
        if (stat.mtimeMs > mostRecentTime) {
          mostRecentTime = stat.mtimeMs;
          mostRecent = dir;
        }
      }

      return mostRecent;
    } catch {
      return null;
    }
  }

  /**
   * Check if a change directory exists and has required files.
   */
  private async changeExists(changeDir: string): Promise<boolean> {
    try {
      const stat = await fs.stat(changeDir);
      if (!stat.isDirectory()) {
        return false;
      }
      // Check for tasks.md as indicator of a valid change
      await fs.access(path.join(changeDir, 'tasks.md'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build amend-specific TaskProgress from utils TaskProgress + parsed tasks.
   */
  private async buildAmendTaskProgress(
    changeDir: string,
    utilsProgress: UtilsTaskProgress
  ): Promise<AmendTaskProgress> {
    const tasksPath = path.join(changeDir, 'tasks.md');
    let tasksContent: string;
    try {
      tasksContent = await fs.readFile(tasksPath, 'utf-8');
    } catch {
      tasksContent = '';
    }

    const parsedTasks = parseTasks(tasksContent);

    const completedIds = parsedTasks.filter(t => t.completed).map(t => t.id);
    const pendingIds = parsedTasks.filter(t => !t.completed).map(t => t.id);

    // Find in-progress task (first uncompleted task)
    const inProgressId = pendingIds.length > 0 ? pendingIds[0] : null;

    return {
      total: utilsProgress.total,
      completed: utilsProgress.completed,
      completedIds,
      inProgressId,
      pendingIds
    };
  }

  /**
   * Prompt user to select amendment type.
   */
  private async promptAmendmentType(options: AmendOptions): Promise<AmendmentType> {
    // If not interactive, default to 'other'
    if (options.noInteractive || !isInteractive()) {
      return 'other';
    }

    const { select } = await import('@inquirer/prompts');

    const choice = await select({
      message: 'What type of amendment do you need?',
      choices: AMENDMENT_TYPE_OPTIONS.map(opt => ({
        name: `${opt.name} - ${opt.description}`,
        value: opt.value
      }))
    });

    return choice as AmendmentType;
  }

  /**
   * Prompt user for their modification description.
   */
  private async promptUserDescription(
    amendmentType: AmendmentType,
    options: AmendOptions
  ): Promise<string> {
    if (options.noInteractive || !isInteractive()) {
      return getAmendmentTypeDescription(amendmentType);
    }

    const { input } = await import('@inquirer/prompts');

    const description = await input({
      message: 'Describe what needs to change:',
      default: getAmendmentTypeDescription(amendmentType)
    });

    return description;
  }

  /**
   * Determine what triggered the amendment.
   */
  private async determineTriggeredBy(
    progress: AmendTaskProgress,
    options: AmendOptions
  ): Promise<string> {
    if (progress.inProgressId) {
      return `Task ${progress.inProgressId} implementation`;
    }

    if (options.noInteractive || !isInteractive()) {
      return 'Implementation progress';
    }

    const { input } = await import('@inquirer/prompts');

    const triggeredBy = await input({
      message: 'What triggered this amendment? (e.g., "Task 2.3 implementation")',
      default: 'Implementation progress'
    });

    return triggeredBy;
  }

  /**
   * Prompt user to confirm the amendment.
   */
  private async promptConfirmation(options: AmendOptions): Promise<boolean> {
    if (options.autoConfirm) {
      return true;
    }

    if (options.noInteractive || !isInteractive()) {
      // In non-interactive mode, leave as DRAFT for manual confirmation
      return false;
    }

    const { confirm } = await import('@inquirer/prompts');

    return confirm({
      message: 'Confirm this amendment? (Changes will be applied via /opsx:apply)',
      default: false
    });
  }

  /**
   * Save amendment state to file.
   */
  private async saveAmendmentState(
    changeDir: string,
    state: AmendmentState
  ): Promise<void> {
    const statePath = path.join(changeDir, AMENDMENT_STATE_FILE);
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
  }

  /**
   * Display summary of the drafted amendment.
   */
  private showDraftSummary(
    record: AmendmentRecord,
    version: number,
    backupDir: string
  ): void {
    console.log(chalk.bold(`\nAmendment Draft (v${version})!\n`));

    // Modification Logic summary
    if (record.changes.modificationLogic) {
      console.log(chalk.cyan('Affected Artifacts:'));
      for (const mod of record.changes.modificationLogic.affectedArtifacts) {
        console.log(`  ${mod.artifact}: ${mod.action} (${mod.priority})`);
      }
      console.log('');
    }

    // Tasks Rolling summary
    if (record.changes.tasksRolling) {
      const plan = record.changes.tasksRolling;
      console.log(chalk.cyan('Tasks Rolling Plan:'));
      if (plan.rollback.length > 0) {
        console.log(`  Rollback: ${plan.rollback.length} task(s)`);
      }
      if (plan.restack.length > 0) {
        console.log(`  Restack: ${plan.restack.length} task(s)`);
      }
      if (plan.append.length > 0) {
        console.log(`  Append: ${plan.append.length} new task(s)`);
      }
      if (plan.deprecate.length > 0) {
        console.log(`  Deprecate: ${plan.deprecate.length} task(s)`);
      }
      console.log('');
    }

    // Spec changes summary
    if (record.changes.specs?.length) {
      const added = record.changes.specs.filter(s => s.operation === 'ADDED').length;
      const modified = record.changes.specs.filter(s => s.operation === 'MODIFIED').length;
      const removed = record.changes.specs.filter(s => s.operation === 'REMOVED').length;
      console.log(chalk.cyan('Spec Changes:'));
      console.log(`  ${added} added, ${modified} modified, ${removed} removed`);
      console.log('');
    }

    // Confirmation checklist
    console.log(chalk.cyan('Confirmation Checklist:'));
    console.log('  Modification logic correct?      [ ]');
    console.log('  Change drafts complete?           [ ]');
    console.log('  Tasks rolling plan feasible?      [ ]');
    console.log('  Impact analysis acceptable?       [ ]');
    console.log('  Ready to apply this amendment?    [ ]');

    console.log(chalk.dim(`\nBackup: ${backupDir}`));
    console.log(chalk.dim(`Document: amendment.md`));
    console.log(chalk.dim(`Status: ${record.metadata.status}`));
  }
}