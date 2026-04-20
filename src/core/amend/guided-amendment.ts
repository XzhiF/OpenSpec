/**
 * Guided Amendment
 *
 * Guides users through the amend workflow by collecting modification intent
 * and generating a revision plan. Does NOT directly modify artifact files.
 *
 * Redesigned from "guide user to edit each artifact" to:
 * 1. Collect user's modification description (intent)
 * 2. Call ModificationAnalyzer to analyze intent
 * 3. Call AmendmentDrafter to generate amendment.md
 * 4. Present draft for user confirmation
 *
 * Lifecycle: DRAFT → CONFIRMED → APPLIED (execution via /opsx:apply)
 */

import chalk from 'chalk';
import type {
  AmendmentType,
  AmendmentState,
  AmendmentRecord,
  TaskProgress
} from './types.js';
import { getAmendmentTypeDescription } from './types.js';
import { draftAmendmentRecord, writeAmendmentDocument } from './amendment-drafter.js';
import { isInteractive } from '../../utils/interactive.js';

// -----------------------------------------------------------------------------
// Main Function
// -----------------------------------------------------------------------------

/**
 * Guide user through the amend workflow.
 *
 * This is the interactive entry point. It collects the user's modification
 * description and generates the amendment.md document.
 *
 * @param changeDir - The change directory path
 * @param type - Amendment type
 * @param state - Current amendment state
 * @param options - Workflow options
 * @returns Complete AmendmentRecord with DRAFT status
 */
export async function guidedAmendment(
  changeDir: string,
  type: AmendmentType,
  state: AmendmentState,
  options: { quick?: boolean; noInteractive?: boolean; description?: string }
): Promise<AmendmentRecord> {
  console.log(chalk.bold(`\nAmendment: ${getAmendmentTypeDescription(type)}\n`));
  console.log(chalk.dim('amend generates a revision plan — it does NOT execute modifications.'));
  console.log(chalk.dim('Actual changes are applied via /opsx:apply after confirmation.\n'));

  // ── Step 1: Collect user's modification intent ──
  const userDescription = options.description || await collectUserDescription(type, options);
  const triggeredBy = await collectTrigger(state, options);

  // ── Step 2: Build task progress from state ──
  const progress: TaskProgress = {
    total: state.progress.completed.length + state.progress.pending.length + (state.progress.inProgress ? 1 : 0),
    completed: state.progress.completed.length,
    completedIds: state.progress.completed,
    inProgressId: state.progress.inProgress,
    pendingIds: state.progress.pending
  };

  // ── Step 3: Run analysis and draft amendment ──
  const version = 1; // Version will be determined by backup manager in command.ts

  console.log(chalk.cyan('\nAnalyzing modification intent...'));
  const record = await draftAmendmentRecord(
    changeDir,
    state.changeName,
    type,
    userDescription,
    triggeredBy,
    progress,
    version
  );

  // ── Step 4: Present amendment summary ──
  presentAmendmentSummary(record);

  return record;
}

// -----------------------------------------------------------------------------
// User Input Collection
// -----------------------------------------------------------------------------

/**
 * Collect user's modification description.
 */
async function collectUserDescription(
  type: AmendmentType,
  options: { quick?: boolean; noInteractive?: boolean; description?: string }
): Promise<string> {
  if (options.description) {
    return options.description;
  }

  if (options.noInteractive || !isInteractive()) {
    return getAmendmentTypeDescription(type);
  }

  const { input } = await import('@inquirer/prompts');

  const description = await input({
    message: 'Describe what needs to change:',
    default: getAmendmentTypeDescription(type)
  });

  return description;
}

/**
 * Collect what triggered the amendment.
 */
async function collectTrigger(
  state: AmendmentState,
  options: { quick?: boolean; noInteractive?: boolean }
): Promise<string> {
  if (state.progress.inProgress) {
    return `Task ${state.progress.inProgress} implementation`;
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

// -----------------------------------------------------------------------------
// Amendment Summary Presentation
// -----------------------------------------------------------------------------

/**
 * Present the amendment draft summary to the user.
 */
function presentAmendmentSummary(record: AmendmentRecord): void {
  console.log(chalk.bold('\nAmendment Draft Summary\n'));

  // Modification Logic
  if (record.changes.modificationLogic) {
    console.log(chalk.cyan('Affected Artifacts:'));
    for (const mod of record.changes.modificationLogic.affectedArtifacts) {
      console.log(`  ${mod.artifact}: ${mod.action} (${mod.priority})`);
    }
    console.log('');
  }

  // Tasks Rolling Plan
  if (record.changes.tasksRolling) {
    const plan = record.changes.tasksRolling;
    console.log(chalk.cyan('Tasks Rolling Plan:'));
    if (plan.rollback.length > 0) {
      console.log(`  Rollback: ${plan.rollback.length} task(s)`);
      for (const task of plan.rollback) {
        console.log(`    - ${task.id}: ${task.description}`);
      }
    }
    if (plan.restack.length > 0) {
      console.log(`  Restack: ${plan.restack.length} task(s)`);
      for (const task of plan.restack) {
        console.log(`    - ${task.id}: ${task.originalDescription} → ${task.newDescription}`);
      }
    }
    if (plan.append.length > 0) {
      console.log(`  Append: ${plan.append.length} new task(s)`);
      for (const task of plan.append) {
        console.log(`    - ${task.id}: ${task.description}`);
      }
    }
    if (plan.deprecate.length > 0) {
      console.log(`  Deprecate: ${plan.deprecate.length} task(s)`);
      for (const task of plan.deprecate) {
        console.log(`    - ${task.id}: ${task.description}`);
      }
    }
    console.log('');
  }

  // Spec Changes
  if (record.changes.specs?.length) {
    const added = record.changes.specs.filter(s => s.operation === 'ADDED').length;
    const modified = record.changes.specs.filter(s => s.operation === 'MODIFIED').length;
    const removed = record.changes.specs.filter(s => s.operation === 'REMOVED').length;
    console.log(chalk.cyan('Spec Changes:'));
    console.log(`  ${added} added, ${modified} modified, ${removed} removed`);
    console.log('');
  }

  // Impact Analysis
  console.log(chalk.cyan('Impact Analysis:'));
  console.log(`  Effort: ${record.impactAnalysis.codeImpact.estimatedEffort}`);
  console.log(`  Backward Compatible: ${record.impactAnalysis.codeImpact.backwardCompatible ? 'Yes' : 'No'}`);
  console.log('');

  // Confirmation Checklist
  console.log(chalk.cyan('Confirmation Checklist:'));
  console.log('  Modification logic correct?      [ ]');
  console.log('  Change drafts complete?           [ ]');
  console.log('  Tasks rolling plan feasible?      [ ]');
  console.log('  Impact analysis acceptable?       [ ]');
  console.log('  Ready to apply this amendment?    [ ]');

  console.log(chalk.dim('\nStatus: DRAFT'));
  console.log(chalk.dim('Review amendment.md, then confirm to proceed with /opsx:apply.'));
}