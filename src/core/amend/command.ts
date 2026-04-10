/**
 * Amend Command
 *
 * Main command class for the amend workflow.
 * Handles mid-implementation changes to artifacts.
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
  AmendmentResult
} from './types.js';
import { getArtifactsForType, getAmendmentTypeDescription } from './types.js';
import { getTaskProgressForChange } from '../../utils/task-progress.js';
import { guidedAmendment } from './guided-amendment.js';
import { writeAmendmentMd } from './generate-amendment.js';
import { updateTasksMd } from './update-tasks.js';
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
    const mainSpecsDir = path.join(targetPath, 'openspec', 'specs');

    let spinner: ReturnType<typeof ora>;

    try {
      // 1. Find active change
      if (!changeName) {
        const foundChange = await this.findActiveChange(changesDir);
        if (!foundChange) {
          throw new Error('No active change found. Please specify a change name.');
        }
        changeName = foundChange;
      }

      const changeDir = path.join(changesDir, changeName);

      // 2. Verify change exists
      const changeExists = await this.changeExists(changeDir);
      if (!changeExists) {
        throw new Error(`Change '${changeName}' not found.`);
      }

      // 3. Get current progress
      spinner = ora('Checking current progress...').start();
      const progress = await getTaskProgressForChange(changesDir, changeName);
      spinner.succeed(`Current progress: ${progress.completed}/${progress.total} tasks complete`);

      if (progress.total === 0) {
        throw new Error('No tasks found in this change. Run /opsx:ff or /opsx:continue first.');
      }

      // 4. Determine amendment type
      const amendmentType = options.type || await this.promptAmendmentType(options);

      // 5. Save state
      const state: AmendmentState = {
        changeName,
        timestamp: new Date().toISOString(),
        amendmentType,
        progress: {
          completed: [],  // We don't track individual IDs with current API
          inProgress: null,
          pending: []
        },
        artifactsToAmend: options.artifacts || getArtifactsForType(amendmentType),
        pausedByUser: true
      };

      await this.saveAmendmentState(changeDir, state);

      console.log(chalk.dim(`\nAmendment type: ${getAmendmentTypeDescription(amendmentType)}`));
      console.log(chalk.dim(`Artifacts to amend: ${state.artifactsToAmend.join(', ')}\n`));

      // 6. Guide through amendments
      const record = await guidedAmendment(changeDir, amendmentType, state, {
        quick: options.quick,
        noInteractive: options.noInteractive
      });

      // 7. Generate amendment.md
      spinner = ora('Generating amendment.md...').start();
      await writeAmendmentMd(changeDir, record);
      spinner.succeed('Generated amendment.md');

      // 8. Update tasks.md
      spinner = ora('Updating tasks.md...').start();
      await updateTasksMd(changeDir, record);
      spinner.succeed('Updated tasks.md');

      // 9. Show summary
      this.showSummary(record);

      // 10. Ask to resume
      if (!options.quick && !options.noInteractive && isInteractive()) {
        const resume = await this.askToResume();
        if (resume) {
          console.log(chalk.green('\nRun `/opsx:apply` to resume implementation.'));
        }
      }

      return {
        success: true,
        amendmentPath: path.join(changeDir, 'amendment.md'),
        tasksPreserved: record.changes.tasks?.preserved.length || 0,
        tasksAdded: record.changes.tasks?.added.length || 0,
        tasksRemoved: record.changes.tasks?.removed.length || 0,
        tasksModified: record.changes.tasks?.modified.length || 0
      };

    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      return {
        success: false,
        error: (error as Error).message,
        tasksPreserved: 0,
        tasksAdded: 0,
        tasksRemoved: 0,
        tasksModified: 0
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
   * Load amendment state from file.
   */
  private async loadAmendmentState(changeDir: string): Promise<AmendmentState | null> {
    const statePath = path.join(changeDir, AMENDMENT_STATE_FILE);
    try {
      const content = await fs.readFile(statePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Display summary of the amendment.
   */
  private showSummary(record: AmendmentRecord): void {
    console.log(chalk.bold('\n✓ Amendment Complete!\n'));

    console.log('Changes:');
    if (record.changes.proposal) {
      console.log(`  ${chalk.cyan('proposal.md')}: Updated`);
    }
    if (record.changes.specs?.length) {
      console.log(`  ${chalk.cyan('specs/')}: ${record.changes.specs.length} changes`);
    }
    if (record.changes.design) {
      console.log(`  ${chalk.cyan('design.md')}: Updated`);
    }
    if (record.changes.tasks) {
      const t = record.changes.tasks;
      console.log(`  ${chalk.cyan('tasks.md')}: ${t.preserved.length} preserved, ${t.added.length} added, ${t.removed.length} removed`);
    }

    console.log(chalk.dim(`\nGenerated: amendment.md`));
  }

  /**
   * Ask user if they want to resume implementation.
   */
  private async askToResume(): Promise<boolean> {
    if (!isInteractive()) {
      return true;
    }

    const { confirm } = await import('@inquirer/prompts');

    return confirm({
      message: 'Resume implementation now?',
      default: true
    });
  }
}