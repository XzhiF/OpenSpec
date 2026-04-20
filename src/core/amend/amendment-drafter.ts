/**
 * Amendment Drafter
 *
 * Converts ModificationAnalyzer output into a complete amendment.md document.
 * This is the "Draft" phase of the amend workflow — it does NOT execute
 * modifications, only produces the revision plan document.
 *
 * Lifecycle: DRAFT → CONFIRMED → APPLIED
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
  AmendmentRecord,
  AmendmentStatus,
  ModificationLogic,
  TasksRollingPlan,
  ConfirmationChecklist,
  ArtifactModification,
  SpecChange,
  RollbackTask,
  RestackTask,
  AppendTask,
  DeprecateTask,
  TaskSequenceItem
} from './types.js';
import { analyzeModificationIntent, type ModificationAnalysisResult } from './modification-analyzer.js';
import type { TaskProgress } from './types.js';
import type { AmendmentType } from './types.js';

// -----------------------------------------------------------------------------
// Main Function
// -----------------------------------------------------------------------------

/**
 * Draft a complete amendment record from analysis results.
 *
 * @param changeDir - The change directory path
 * @param changeName - Name of the change being amended
 * @param amendmentType - Type of amendment
 * @param userDescription - User's description of what needs to change
 * @param triggeredBy - What triggered the amendment
 * @param progress - Current task progress snapshot
 * @param version - Amendment version number
 * @returns Complete AmendmentRecord with status = DRAFT
 */
export async function draftAmendmentRecord(
  changeDir: string,
  changeName: string,
  amendmentType: AmendmentType,
  userDescription: string,
  triggeredBy: string,
  progress: TaskProgress,
  version: number
): Promise<AmendmentRecord> {
  // 1. Run modification analysis
  const analysisResult = await analyzeModificationIntent(
    changeDir,
    amendmentType,
    userDescription,
    progress
  );

  // 2. Build the amendment record from analysis results
  const record: AmendmentRecord = {
    metadata: {
      changeName,
      created: new Date().toISOString(),
      amendmentType,
      reason: userDescription,
      triggeredBy,
      status: 'DRAFT'
    },
    summary: analysisResult.analysisSummary,
    changes: {
      modificationLogic: analysisResult.modificationLogic,
      tasksRolling: analysisResult.tasksRollingPlan,
      specs: analysisResult.specChanges
    },
    impactAnalysis: {
      codeImpact: {
        affectedFiles: estimateAffectedFiles(analysisResult.modificationLogic),
        estimatedEffort: estimateEffortFromAnalysis(analysisResult),
        backwardCompatible: estimateBackwardCompatibility(amendmentType, analysisResult.tasksRollingPlan)
      },
      dependencyImpact: {
        remove: [],
        add: []
      }
    },
    rollbackPlan: generateRollbackPlan(version, analysisResult.tasksRollingPlan),
    nextSteps: generateNextSteps(amendmentType, analysisResult.tasksRollingPlan),
    confirmationChecklist: createDefaultChecklist()
  };

  return record;
}

// -----------------------------------------------------------------------------
// Amendment.md Document Generation
// -----------------------------------------------------------------------------

/**
 * Generate the full amendment.md document content from a record.
 */
export function generateAmendmentDocument(
  record: AmendmentRecord,
  version: number
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Amendment v${version}: ${record.metadata.changeName}`);
  lines.push('');

  // Metadata
  lines.push('## Metadata');
  lines.push(`- **Version**: v${version}`);
  lines.push(`- **Created**: ${record.metadata.created}`);
  lines.push(`- **Amendment Type**: ${record.metadata.amendmentType || 'other'}`);
  lines.push(`- **Status**: ${record.metadata.status}`);
  lines.push(`- **Reason**: ${record.metadata.reason}`);
  lines.push(`- **Triggered By**: ${record.metadata.triggeredBy}`);
  lines.push('');

  // Backup Information
  if (version > 0) {
    lines.push('## Backup Information');
    lines.push(`- **Previous Version**: v${version - 1}`);
    lines.push(`- **Backup Location**: .versions/v${version - 1}/`);
    lines.push(`- **Rollback**: Restore from backup if needed`);
    lines.push('');
  }

  // Summary
  lines.push('## Summary');
  lines.push(record.summary);
  lines.push('');

  // Modification Logic
  if (record.changes.modificationLogic) {
    lines.push('## Modification Logic');
    lines.push('');

    lines.push('### Affected Artifacts');
    lines.push('| Artifact | Action | Priority | Reason |');
    lines.push('|----------|--------|----------|--------|');
    for (const mod of record.changes.modificationLogic.affectedArtifacts) {
      lines.push(`| ${mod.artifact} | ${mod.action} | ${mod.priority} | ${truncate(mod.reason, 50)} |`);
    }
    lines.push('');

    lines.push('### Modification Order');
    for (let i = 0; i < record.changes.modificationLogic.modificationOrder.length; i++) {
      const artifact = record.changes.modificationLogic.modificationOrder[i];
      lines.push(`${i + 1}. ${artifact}`);
    }
    lines.push('');
  }

  // Change Drafts (placeholder sections for each affected artifact)
  lines.push('## Change Drafts');
  lines.push('');
  lines.push('> **Note**: The following sections describe planned changes. Actual content');
  lines.push('> will be applied during `/opsx:apply` after user confirmation.');
  lines.push('');

  if (record.changes.proposal) {
    lines.push('### proposal.md Changes');
    lines.push(`**Reason**: ${record.changes.proposal.reason}`);
    lines.push('');
    lines.push('<details>');
    lines.push('<summary>View planned changes</summary>');
    lines.push('');
    lines.push('```markdown');
    lines.push('<!-- Amendment v${version}: ... -->');
    lines.push('Planned changes to proposal content...');
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  } else if (record.changes.modificationLogic?.affectedArtifacts.some(a => a.artifact === 'proposal')) {
    lines.push('### proposal.md Changes');
    lines.push('> Content will be updated during apply phase.');
    lines.push('');
  }

  if (record.changes.design) {
    lines.push('### design.md Changes');
    lines.push(`**Reason**: ${record.changes.design.reason}`);
    lines.push('');
    lines.push('<details>');
    lines.push('<summary>View planned changes</summary>');
    lines.push('');
    lines.push('```markdown');
    lines.push('<!-- Amendment v${version}: ... -->');
    lines.push('Planned changes to design content...');
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  } else if (record.changes.modificationLogic?.affectedArtifacts.some(a => a.artifact === 'design')) {
    lines.push('### design.md Changes');
    lines.push('> Content will be updated during apply phase.');
    lines.push('');
  }

  // Spec Changes
  if (record.changes.specs?.length) {
    lines.push('### Spec Changes');
    lines.push('');

    const byOperation = groupSpecsByOperation(record.changes.specs);

    if (byOperation.ADDED.length > 0) {
      lines.push('#### ADDED Requirements');
      for (const spec of byOperation.ADDED) {
        lines.push(`- **${spec.specName}**: ${spec.requirement}`);
        if (spec.details) {
          lines.push(`  > ${spec.details}`);
        }
      }
      lines.push('');
    }

    if (byOperation.MODIFIED.length > 0) {
      lines.push('#### MODIFIED Requirements');
      for (const spec of byOperation.MODIFIED) {
        lines.push(`- **${spec.specName}**: ${spec.requirement}`);
        if (spec.details) {
          lines.push(`  > ${spec.details}`);
        }
      }
      lines.push('');
    }

    if (byOperation.REMOVED.length > 0) {
      lines.push('#### REMOVED Requirements');
      for (const spec of byOperation.REMOVED) {
        lines.push(`- **${spec.specName}**: ${spec.requirement}`);
        if (spec.details) {
          lines.push(`  > ${spec.details}`);
        }
      }
      lines.push('');
    }
  }

  // Tasks Rolling Plan
  if (record.changes.tasksRolling) {
    lines.push('## Tasks Rolling Plan');
    lines.push('');

    const plan = record.changes.tasksRolling;

    // Rollback
    if (plan.rollback.length > 0) {
      lines.push('### Rollback Tasks (need to undo completed work)');
      lines.push('| Task ID | Description | Rollback Action | Rollback Code |');
      lines.push('|---------|-------------|-----------------|---------------|');
      for (const task of plan.rollback) {
        lines.push(`| ${task.id} | ${truncate(task.description, 40)} | ${truncate(task.rollbackAction, 40)} | ${truncate(task.rollbackCode, 40)} |`);
      }
      lines.push('');
    }

    // Restack
    if (plan.restack.length > 0) {
      lines.push('### Restack Tasks (reorder/modify pending tasks)');
      lines.push('| Task ID | Original | Modified | Reason |');
      lines.push('|---------|----------|----------|--------|');
      for (const task of plan.restack) {
        lines.push(`| ${task.id} | ${truncate(task.originalDescription, 30)} | ${truncate(task.newDescription, 30)} | ${truncate(task.reason, 30)} |`);
      }
      lines.push('');
    }

    // Append
    if (plan.append.length > 0) {
      lines.push('### Append Tasks (new tasks to add)');
      lines.push('| Task ID | Description | Section | After Task |');
      lines.push('|---------|-------------|---------|------------|');
      for (const task of plan.append) {
        lines.push(`| ${task.id} | ${truncate(task.description, 40)} | ${task.section} | ${task.afterTask} |`);
      }
      lines.push('');
    }

    // Deprecate
    if (plan.deprecate.length > 0) {
      lines.push('### Deprecate Tasks (no longer needed)');
      lines.push('| Task ID | Description | Reason |');
      lines.push('|---------|-------------|--------|');
      for (const task of plan.deprecate) {
        lines.push(`| ${task.id} | ${truncate(task.description, 40)} | ${truncate(task.reason, 40)} |`);
      }
      lines.push('');
    }

    // New Sequence
    if (plan.newSequence.length > 0) {
      lines.push('### Task Sequence After Rolling');
      lines.push('');
      for (const item of plan.newSequence) {
        const statusLabel = formatSequenceStatus(item.status);
        lines.push(`- **${item.id}** ${statusLabel}: ${item.description}`);
      }
      lines.push('');
    }
  }

  // Legacy Tasks Change (backward compat)
  if (record.changes.tasks && !record.changes.tasksRolling) {
    const t = record.changes.tasks;
    lines.push('### Tasks Changes (Legacy Format)');
    lines.push('');

    if (t.preserved.length > 0) {
      lines.push(`**Preserved (${t.preserved.length})**: Tasks that remain valid`);
      for (const task of t.preserved.slice(0, 5)) {
        lines.push(`  - ${task.id}: ${task.description}`);
      }
      lines.push('');
    }

    if (t.added.length > 0) {
      lines.push(`**Added (${t.added.length})**: New tasks`);
      for (const task of t.added) {
        lines.push(`  - ${task.id}: ${task.description}`);
      }
      lines.push('');
    }

    if (t.removed.length > 0) {
      lines.push(`**Removed (${t.removed.length})**: Tasks no longer needed`);
      for (const task of t.removed) {
        lines.push(`  - ~~${task.id}: ${task.description}~~`);
      }
      lines.push('');
    }

    if (t.modified.length > 0) {
      lines.push(`**Modified (${t.modified.length})**: Tasks that need adjustment`);
      for (const task of t.modified) {
        lines.push(`  - ${task.id}: ${task.description}`);
      }
      lines.push('');
    }
  }

  // Impact Analysis
  lines.push('## Impact Analysis');
  lines.push('');

  const { codeImpact, dependencyImpact } = record.impactAnalysis;

  lines.push('### Code Impact');
  lines.push(`- **Affected Files**: ${codeImpact.affectedFiles.length} files`);
  if (codeImpact.affectedFiles.length > 0) {
    for (const file of codeImpact.affectedFiles.slice(0, 10)) {
      lines.push(`  - ${file}`);
    }
  }
  lines.push(`- **Estimated Effort**: ${codeImpact.estimatedEffort}`);
  lines.push(`- **Backward Compatible**: ${codeImpact.backwardCompatible ? 'Yes' : 'No'}`);
  lines.push('');

  lines.push('### Dependency Impact');
  if (dependencyImpact.remove.length > 0 || dependencyImpact.add.length > 0) {
    if (dependencyImpact.remove.length > 0) {
      lines.push(`- **Remove**: ${dependencyImpact.remove.join(', ')}`);
    }
    if (dependencyImpact.add.length > 0) {
      lines.push(`- **Add**: ${dependencyImpact.add.join(', ')}`);
    }
  } else {
    lines.push('- No dependency changes');
  }
  lines.push('');

  // Confirmation Checklist
  lines.push('## Confirmation Checklist');
  lines.push('');
  lines.push(`- [${record.confirmationChecklist.modificationLogicCorrect ? 'x' : ' '}] Modification logic is correct`);
  lines.push(`- [${record.confirmationChecklist.changeDraftsComplete ? 'x' : ' '}] Change drafts are complete and accurate`);
  lines.push(`- [${record.confirmationChecklist.tasksRollingFeasible ? 'x' : ' '}] Tasks rolling plan is feasible`);
  lines.push(`- [${record.confirmationChecklist.impactAcceptable ? 'x' : ' '}] Impact analysis is acceptable`);
  lines.push(`- [${record.confirmationChecklist.readyToApply ? 'x' : ' '}] Ready to apply this amendment`);
  lines.push('');

  // Rollback Plan
  lines.push('## Rollback Plan (for the amendment itself)');
  lines.push(record.rollbackPlan);
  lines.push('');

  // Next Steps
  lines.push('## Next Steps');
  for (let i = 0; i < record.nextSteps.length; i++) {
    lines.push(`${i + 1}. ${record.nextSteps[i]}`);
  }
  lines.push('');

  // Footer
  lines.push('---');
  lines.push(`*Generated by OpenSpec Amend Workflow | Status: ${record.metadata.status}*`);

  return lines.join('\n');
}

/**
 * Write the amendment.md document to disk.
 */
export async function writeAmendmentDocument(
  changeDir: string,
  record: AmendmentRecord,
  version: number
): Promise<string> {
  const content = generateAmendmentDocument(record, version);

  // Write versioned file
  const versionedFileName = version > 0 ? `amendment-v${version}.md` : 'amendment.md';
  const versionedPath = path.join(changeDir, versionedFileName);
  await fs.writeFile(versionedPath, content);

  // Also write/update the latest amendment.md
  const latestPath = path.join(changeDir, 'amendment.md');
  await fs.writeFile(latestPath, content);

  return latestPath;
}

/**
 * Update the amendment status in the document and state file.
 */
export async function updateAmendmentStatus(
  changeDir: string,
  record: AmendmentRecord,
  version: number,
  newStatus: AmendmentStatus
): Promise<void> {
  // Update record
  const updatedRecord = {
    ...record,
    metadata: {
      ...record.metadata,
      status: newStatus
    }
  };

  // Rewrite amendment.md
  const content = generateAmendmentDocument(updatedRecord, version);
  const latestPath = path.join(changeDir, 'amendment.md');
  await fs.writeFile(latestPath, content);

  const versionedFileName = version > 0 ? `amendment-v${version}.md` : 'amendment.md';
  const versionedPath = path.join(changeDir, versionedFileName);
  await fs.writeFile(versionedPath, content);

  // Update state file
  const statePath = path.join(changeDir, '.amendment-state.json');
  try {
    const stateContent = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(stateContent);
    const updatedState = {
      ...state,
      status: newStatus
    };
    await fs.writeFile(statePath, JSON.stringify(updatedState, null, 2));
  } catch {
    // State file may not exist — that's okay
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Truncate a string to a maximum length.
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Group spec changes by operation type.
 */
function groupSpecsByOperation(specs: SpecChange[]): Record<string, SpecChange[]> {
  return {
    ADDED: specs.filter(s => s.operation === 'ADDED'),
    MODIFIED: specs.filter(s => s.operation === 'MODIFIED'),
    REMOVED: specs.filter(s => s.operation === 'REMOVED')
  };
}

/**
 * Format a TaskSequenceStatus for display in the document.
 */
function formatSequenceStatus(status: string): string {
  const labels: Record<string, string> = {
    completed: '(preserved)',
    pending: '(pending)',
    rollback: '(ROLLBACK)',
    restack: '(RESTACK)',
    append: '(APPEND)'
  };
  return labels[status] || `(${status})`;
}

/**
 * Create a default confirmation checklist (all unchecked).
 */
function createDefaultChecklist(): ConfirmationChecklist {
  return {
    modificationLogicCorrect: false,
    changeDraftsComplete: false,
    tasksRollingFeasible: false,
    impactAcceptable: false,
    readyToApply: false
  };
}

/**
 * Estimate affected files from modification logic.
 */
function estimateAffectedFiles(logic: ModificationLogic): string[] {
  const files: string[] = [];
  for (const mod of logic.affectedArtifacts) {
    if (mod.artifact === 'proposal') files.push('proposal.md');
    else if (mod.artifact === 'design') files.push('design.md');
    else if (mod.artifact === 'tasks') files.push('tasks.md');
    else if (mod.artifact === 'specs') files.push('specs/*/spec.md');
    else files.push(mod.artifact);
  }
  return files;
}

/**
 * Estimate effort from analysis results.
 */
function estimateEffortFromAnalysis(result: ModificationAnalysisResult): string {
  let score = 0;

  // Artifact count affects effort
  score += result.modificationLogic.affectedArtifacts.length;

  // Rolling complexity affects effort
  score += result.tasksRollingPlan.rollback.length * 3;
  score += result.tasksRollingPlan.restack.length * 1;
  score += result.tasksRollingPlan.append.length * 1;
  score += result.tasksRollingPlan.deprecate.length * 0.5;

  // Spec changes
  score += result.specChanges.length * 1.5;

  if (score <= 3) return '30 minutes';
  if (score <= 6) return '1-2 hours';
  if (score <= 12) return 'Half day';
  if (score <= 20) return '1-2 days';
  return '3+ days';
}

/**
 * Estimate backward compatibility based on amendment type and rolling plan.
 */
function estimateBackwardCompatibility(
  type: AmendmentType,
  plan: TasksRollingPlan
): boolean {
  // If there are rollback tasks, it's likely not backward compatible
  if (plan.rollback.length > 0) return false;

  // If deprecating tasks, scope is being narrowed — not backward compatible
  if (plan.deprecate.length > 0) return false;

  // Missing-feature additions are backward compatible
  if (type === 'missing-feature') return true;

  // Spec corrections are usually backward compatible
  if (type === 'spec-error') return true;

  return false;
}

/**
 * Generate rollback plan for the amendment itself.
 */
function generateRollbackPlan(
  version: number,
  plan: TasksRollingPlan
): string {
  const steps: string[] = [];

  steps.push('If the amendment itself needs to be reverted:');
  steps.push(`1. Restore artifacts from .versions/v${version > 0 ? version - 1 : 0}/`);

  if (plan.rollback.length > 0) {
    steps.push('2. Re-apply the rolled-back tasks (restore their code changes)');
  }

  steps.push('3. Remove amendment.md changes');
  steps.push('4. Revert tasks.md to previous state');

  return steps.join('\n');
}

/**
 * Generate next steps based on amendment type and rolling plan.
 */
function generateNextSteps(
  type: AmendmentType,
  plan: TasksRollingPlan
): string[] {
  const steps: string[] = [];

  steps.push('Confirm this amendment (check all items in Confirmation Checklist)');

  if (plan.rollback.length > 0) {
    steps.push(`Rollback ${plan.rollback.length} completed task(s) — code will be removed during apply`);
  }
  if (plan.restack.length > 0) {
    steps.push(`Restack ${plan.restack.length} pending task(s) — descriptions will be updated`);
  }
  if (plan.append.length > 0) {
    steps.push(`Append ${plan.append.length} new task(s) to the task list`);
  }
  if (plan.deprecate.length > 0) {
    steps.push(`Deprecate ${plan.deprecate.length} task(s) no longer needed`);
  }

  steps.push('Run `/opsx:apply` to execute amendment changes and continue implementation');

  return steps;
}