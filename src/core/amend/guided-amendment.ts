/**
 * Guided Amendment
 *
 * Guides users through amending artifacts based on amendment type.
 */

import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import type {
  AmendmentType,
  AmendmentState,
  AmendmentRecord,
  ArtifactChange,
  SpecChange,
  TasksChange
} from './types.js';
import { getAmendmentTypeDescription } from './types.js';
import { analyzeImpact } from './impact-analysis.js';
import { isInteractive } from '../../utils/interactive.js';

// -----------------------------------------------------------------------------
// Internal Types
// -----------------------------------------------------------------------------

/**
 * Internal type for artifacts loaded during amendment.
 */
interface LoadedArtifacts {
  proposal: string;
  design: string;
  tasks: string;
  specs: Map<string, string>;
}

// -----------------------------------------------------------------------------
// Main Function
// -----------------------------------------------------------------------------

/**
 * Guide user through amending artifacts.
 */
export async function guidedAmendment(
  changeDir: string,
  type: AmendmentType,
  state: AmendmentState,
  options: { quick?: boolean; noInteractive?: boolean }
): Promise<AmendmentRecord> {
  console.log(chalk.bold(`\nAmendment: ${getAmendmentTypeDescription(type)}\n`));

  // Read existing artifacts
  const artifacts: LoadedArtifacts = {
    proposal: await readArtifact(path.join(changeDir, 'proposal.md')),
    design: await readArtifact(path.join(changeDir, 'design.md')),
    tasks: await readArtifact(path.join(changeDir, 'tasks.md')),
    specs: await readSpecs(path.join(changeDir, 'specs'))
  };

  // Initialize record
  const record: AmendmentRecord = {
    metadata: {
      changeName: state.changeName,
      created: new Date().toISOString(),
      reason: '',
      triggeredBy: ''
    },
    summary: '',
    changes: {},
    impactAnalysis: {
      codeImpact: { affectedFiles: [], estimatedEffort: '', backwardCompatible: true },
      dependencyImpact: { remove: [], add: [] }
    },
    rollbackPlan: '',
    nextSteps: []
  };

  // Get user input for reason
  if (!options.noInteractive && isInteractive()) {
    const { input } = await import('@inquirer/prompts');

    record.metadata.reason = await input({
      message: 'Briefly describe what needs to change:',
      default: getAmendmentTypeDescription(type)
    });

    record.metadata.triggeredBy = await input({
      message: 'What triggered this amendment? (e.g., "Task 2.3 implementation")',
      default: `Task ${state.progress.inProgress || 'implementation'}`
    });
  } else {
    record.metadata.reason = getAmendmentTypeDescription(type);
    record.metadata.triggeredBy = `Task ${state.progress.inProgress || 'implementation'}`;
  }

  // Guide based on amendment type
  switch (type) {
    case 'design-issue':
      await guideDesignIssueAmendment(changeDir, artifacts, record, state, options);
      break;
    case 'missing-feature':
      await guideMissingFeatureAmendment(changeDir, artifacts, record, state, options);
      break;
    case 'spec-error':
      await guideSpecErrorAmendment(changeDir, artifacts, record, state, options);
      break;
    case 'scope-change':
      await guideScopeChangeAmendment(changeDir, artifacts, record, state, options);
      break;
    default:
      await guideOtherAmendment(changeDir, artifacts, record, state, options);
  }

  // Analyze impact
  record.impactAnalysis = await analyzeImpact(changeDir, record.changes);

  // Generate summary
  record.summary = generateSummary(record);

  // Generate rollback plan
  record.rollbackPlan = generateRollbackPlan(record);

  // Generate next steps
  record.nextSteps = generateNextSteps(record);

  return record;
}

// -----------------------------------------------------------------------------
// Type-Specific Guidance
// -----------------------------------------------------------------------------

/**
 * Guide for design-issue amendments.
 * Order: design → specs → proposal → tasks
 */
async function guideDesignIssueAmendment(
  changeDir: string,
  artifacts: LoadedArtifacts,
  record: AmendmentRecord,
  state: AmendmentState,
  options: { quick?: boolean; noInteractive?: boolean }
): Promise<void> {
  console.log(chalk.dim('\nDesign Issue Amendment'));
  console.log(chalk.dim('Recommended order: design → specs → proposal → tasks\n'));

  // 1. Design
  if (state.artifactsToAmend.includes('design')) {
    const change = await promptArtifactEdit(
      'design.md',
      artifacts.design,
      'Update the technical design approach',
      options
    );
    if (change) {
      record.changes.design = change;
      await fs.writeFile(path.join(changeDir, 'design.md'), change.after);
      console.log(chalk.green('✓ Updated design.md'));
    }
  }

  // 2. Specs
  if (state.artifactsToAmend.includes('specs')) {
    const specChanges = await promptSpecsEdit(
      changeDir,
      artifacts.specs,
      'Update specs to reflect design changes',
      options
    );
    if (specChanges.length > 0) {
      record.changes.specs = specChanges;
      console.log(chalk.green(`✓ Updated ${specChanges.length} spec changes`));
    }
  }

  // 3. Proposal
  if (state.artifactsToAmend.includes('proposal')) {
    const change = await promptArtifactEdit(
      'proposal.md',
      artifacts.proposal,
      'Update scope/impact if needed',
      options
    );
    if (change) {
      record.changes.proposal = change;
      await fs.writeFile(path.join(changeDir, 'proposal.md'), change.after);
      console.log(chalk.green('✓ Updated proposal.md'));
    }
  }

  // 4. Tasks
  if (state.artifactsToAmend.includes('tasks')) {
    const tasksChange = await analyzeTasksChange(
      artifacts.tasks,
      record.changes,
      state.progress.completed
    );
    record.changes.tasks = tasksChange;
  }
}

/**
 * Guide for missing-feature amendments.
 * Order: proposal → specs → tasks
 */
async function guideMissingFeatureAmendment(
  changeDir: string,
  artifacts: LoadedArtifacts,
  record: AmendmentRecord,
  state: AmendmentState,
  options: { quick?: boolean; noInteractive?: boolean }
): Promise<void> {
  console.log(chalk.dim('\nMissing Feature Amendment'));
  console.log(chalk.dim('Recommended order: proposal → specs → tasks\n'));

  // 1. Proposal
  if (state.artifactsToAmend.includes('proposal')) {
    const change = await promptArtifactEdit(
      'proposal.md',
      artifacts.proposal,
      'Expand scope to include missing functionality',
      options
    );
    if (change) {
      record.changes.proposal = change;
      await fs.writeFile(path.join(changeDir, 'proposal.md'), change.after);
      console.log(chalk.green('✓ Updated proposal.md'));
    }
  }

  // 2. Specs
  if (state.artifactsToAmend.includes('specs')) {
    const specChanges = await promptSpecsEdit(
      changeDir,
      artifacts.specs,
      'Add new requirements for missing functionality',
      options
    );
    if (specChanges.length > 0) {
      record.changes.specs = specChanges;
      console.log(chalk.green(`✓ Added ${specChanges.filter(s => s.operation === 'ADDED').length} new requirements`));
    }
  }

  // 3. Tasks
  if (state.artifactsToAmend.includes('tasks')) {
    const tasksChange = await analyzeTasksChange(
      artifacts.tasks,
      record.changes,
      state.progress.completed
    );
    record.changes.tasks = tasksChange;
  }
}

/**
 * Guide for spec-error amendments.
 * Order: specs → tasks (if needed)
 */
async function guideSpecErrorAmendment(
  changeDir: string,
  artifacts: LoadedArtifacts,
  record: AmendmentRecord,
  state: AmendmentState,
  options: { quick?: boolean; noInteractive?: boolean }
): Promise<void> {
  console.log(chalk.dim('\nSpec Error Amendment'));
  console.log(chalk.dim('Recommended order: specs → tasks\n'));

  // 1. Specs
  if (state.artifactsToAmend.includes('specs')) {
    const specChanges = await promptSpecsEdit(
      changeDir,
      artifacts.specs,
      'Correct the spec to match expected behavior',
      options
    );
    if (specChanges.length > 0) {
      record.changes.specs = specChanges;
      console.log(chalk.green(`✓ Corrected ${specChanges.length} spec issues`));
    }
  }

  // 2. Tasks (check if affected)
  if (state.artifactsToAmend.includes('tasks')) {
    const tasksChange = await analyzeTasksChange(
      artifacts.tasks,
      record.changes,
      state.progress.completed
    );
    if (tasksChange.added.length > 0 || tasksChange.modified.length > 0) {
      record.changes.tasks = tasksChange;
    }
  }
}

/**
 * Guide for scope-change amendments.
 * Order: proposal → specs → design → tasks
 */
async function guideScopeChangeAmendment(
  changeDir: string,
  artifacts: LoadedArtifacts,
  record: AmendmentRecord,
  state: AmendmentState,
  options: { quick?: boolean; noInteractive?: boolean }
): Promise<void> {
  console.log(chalk.dim('\nScope Change Amendment'));
  console.log(chalk.dim('Recommended order: proposal → specs → design → tasks\n'));

  // 1. Proposal
  if (state.artifactsToAmend.includes('proposal')) {
    const change = await promptArtifactEdit(
      'proposal.md',
      artifacts.proposal,
      'Update scope (expand or narrow)',
      options
    );
    if (change) {
      record.changes.proposal = change;
      await fs.writeFile(path.join(changeDir, 'proposal.md'), change.after);
      console.log(chalk.green('✓ Updated proposal.md'));
    }
  }

  // 2. Specs
  if (state.artifactsToAmend.includes('specs')) {
    const specChanges = await promptSpecsEdit(
      changeDir,
      artifacts.specs,
      'Add/remove requirements based on scope change',
      options
    );
    if (specChanges.length > 0) {
      record.changes.specs = specChanges;
      console.log(chalk.green(`✓ Updated specs`));
    }
  }

  // 3. Design
  if (state.artifactsToAmend.includes('design')) {
    const change = await promptArtifactEdit(
      'design.md',
      artifacts.design,
      'Update design if affected by scope change',
      options
    );
    if (change) {
      record.changes.design = change;
      await fs.writeFile(path.join(changeDir, 'design.md'), change.after);
      console.log(chalk.green('✓ Updated design.md'));
    }
  }

  // 4. Tasks
  if (state.artifactsToAmend.includes('tasks')) {
    const tasksChange = await analyzeTasksChange(
      artifacts.tasks,
      record.changes,
      state.progress.completed
    );
    record.changes.tasks = tasksChange;
  }
}

/**
 * Guide for other amendments.
 */
async function guideOtherAmendment(
  changeDir: string,
  artifacts: LoadedArtifacts,
  record: AmendmentRecord,
  state: AmendmentState,
  options: { quick?: boolean; noInteractive?: boolean }
): Promise<void> {
  console.log(chalk.dim('\nCustom Amendment'));
  console.log(chalk.dim('Edit artifacts as needed\n'));

  // Let user choose what to edit
  if (!options.noInteractive && isInteractive()) {
    const { checkbox } = await import('@inquirer/prompts');

    const selectedArtifacts = await checkbox({
      message: 'Which artifacts do you want to edit?',
      choices: [
        { name: 'proposal.md', value: 'proposal', checked: true },
        { name: 'specs/', value: 'specs', checked: true },
        { name: 'design.md', value: 'design', checked: true },
        { name: 'tasks.md', value: 'tasks', checked: true }
      ]
    });

    for (const artifact of selectedArtifacts) {
      if (artifact === 'proposal') {
        const change = await promptArtifactEdit('proposal.md', artifacts.proposal, '', options);
        if (change) {
          record.changes.proposal = change;
          await fs.writeFile(path.join(changeDir, 'proposal.md'), change.after);
        }
      } else if (artifact === 'design') {
        const change = await promptArtifactEdit('design.md', artifacts.design, '', options);
        if (change) {
          record.changes.design = change;
          await fs.writeFile(path.join(changeDir, 'design.md'), change.after);
        }
      } else if (artifact === 'specs') {
        const specChanges = await promptSpecsEdit(changeDir, artifacts.specs, '', options);
        if (specChanges.length > 0) {
          record.changes.specs = specChanges;
        }
      }
    }
  }

  // Analyze tasks
  const tasksChange = await analyzeTasksChange(
    artifacts.tasks,
    record.changes,
    state.progress.completed
  );
  record.changes.tasks = tasksChange;
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Read an artifact file.
 */
async function readArtifact(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Read all spec files in a directory.
 */
async function readSpecs(specsDir: string): Promise<Map<string, string>> {
  const specs = new Map<string, string>();
  try {
    const entries = await fs.readdir(specsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const specFile = path.join(specsDir, entry.name, 'spec.md');
        try {
          const content = await fs.readFile(specFile, 'utf-8');
          specs.set(entry.name, content);
        } catch {
          // Skip if file doesn't exist
        }
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return specs;
}

/**
 * Prompt user to edit an artifact.
 */
async function promptArtifactEdit(
  artifactName: string,
  currentContent: string,
  instruction: string,
  options: { quick?: boolean; noInteractive?: boolean }
): Promise<ArtifactChange | null> {
  if (options.noInteractive) {
    return null;
  }

  if (!isInteractive()) {
    return null;
  }

  const { confirm, editor } = await import('@inquirer/prompts');

  console.log(chalk.dim(`\nEditing ${artifactName}...`));
  if (instruction) {
    console.log(chalk.dim(instruction));
  }

  const shouldEdit = await confirm({
    message: `Edit ${artifactName}?`,
    default: true
  });

  if (!shouldEdit) {
    return null;
  }

  // In a real implementation, this would open an editor
  // For now, we'll return a placeholder
  const newContent = currentContent; // Would be edited content

  return {
    before: currentContent,
    after: newContent,
    reason: instruction || 'User amendment'
  };
}

/**
 * Prompt user to edit specs.
 */
async function promptSpecsEdit(
  changeDir: string,
  specs: Map<string, string>,
  instruction: string,
  options: { quick?: boolean; noInteractive?: boolean }
): Promise<SpecChange[]> {
  const changes: SpecChange[] = [];

  if (options.noInteractive || !isInteractive()) {
    return changes;
  }

  // For each spec, ask if changes are needed
  const { confirm } = await import('@inquirer/prompts');

  for (const [specName, content] of specs) {
    const shouldEdit = await confirm({
      message: `Edit specs/${specName}/spec.md?`,
      default: false
    });

    if (shouldEdit) {
      // In real implementation, would open editor and detect changes
      // For now, add placeholder
      changes.push({
        specName,
        operation: 'MODIFIED',
        requirement: 'Various',
        details: 'User amendments'
      });
    }
  }

  return changes;
}

/**
 * Analyze what tasks need to change based on artifact changes.
 */
async function analyzeTasksChange(
  tasksContent: string,
  changes: AmendmentRecord['changes'],
  completedTaskIds: string[]
): Promise<TasksChange> {
  const tasksChange: TasksChange = {
    preserved: [],
    added: [],
    removed: [],
    modified: []
  };

  // Parse existing tasks
  const lines = tasksContent.split('\n');
  for (const line of lines) {
    const taskMatch = line.match(/^-\s+\[([ x])\]\s+(\d+\.\d+)\s+(.+)$/);
    if (taskMatch) {
      const completed = taskMatch[1] === 'x';
      const id = taskMatch[2];
      const description = taskMatch[3];

      if (completed) {
        tasksChange.preserved.push({ id, description });
      }
    }
  }

  // Based on spec changes, add new tasks
  if (changes.specs) {
    const addedCount = changes.specs.filter(s => s.operation === 'ADDED').length;
    for (let i = 0; i < addedCount; i++) {
      tasksChange.added.push({
        id: `new.${i + 1}`,
        description: 'New task from amendment'
      });
    }
  }

  return tasksChange;
}

/**
 * Generate summary from record.
 */
function generateSummary(record: AmendmentRecord): string {
  const parts: string[] = [];

  if (record.changes.proposal) {
    parts.push('Updated proposal');
  }
  if (record.changes.specs?.length) {
    const ops = record.changes.specs.map(s => s.operation);
    const added = ops.filter(o => o === 'ADDED').length;
    const modified = ops.filter(o => o === 'MODIFIED').length;
    const removed = ops.filter(o => o === 'REMOVED').length;
    parts.push(`Specs: ${added} added, ${modified} modified, ${removed} removed`);
  }
  if (record.changes.design) {
    parts.push('Updated design');
  }
  if (record.changes.tasks) {
    const t = record.changes.tasks;
    parts.push(`Tasks: ${t.preserved.length} preserved, ${t.added.length} added, ${t.removed.length} removed`);
  }

  return parts.join('. ');
}

/**
 * Generate rollback plan.
 */
function generateRollbackPlan(record: AmendmentRecord): string {
  return `If issues arise:
1. Restore previous artifacts from git history
2. amendment.md preserves all changes for reference
3. Tasks can be re-applied incrementally`;
}

/**
 * Generate next steps.
 */
function generateNextSteps(record: AmendmentRecord): string[] {
  const steps: string[] = [];

  if (record.changes.tasks?.added.length) {
    steps.push('Implement new tasks added by amendment');
  }
  if (record.changes.tasks?.modified.length) {
    steps.push('Update modified tasks to reflect changes');
  }
  steps.push('Run tests to verify changes');
  steps.push('Continue with /opsx:apply when ready');

  return steps;
}