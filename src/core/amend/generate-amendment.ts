/**
 * Generate Amendment Markdown
 *
 * Generates amendment.md files from amendment records.
 * Redesigned to produce a revision plan document (not a change log).
 *
 * Key changes from legacy version:
 * - Includes Modification Logic section (affected artifacts, modification order)
 * - Includes Change Drafts section (planned changes, not simple diffs)
 * - Includes Tasks Rolling Plan (rollback/restack/append/deprecate + new sequence)
 * - Includes Confirmation Checklist
 * - Status field: DRAFT → CONFIRMED → APPLIED
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
  AmendmentRecord,
  ModificationLogic,
  ArtifactModification,
  TasksRollingPlan,
  RollbackTask,
  RestackTask,
  AppendTask,
  DeprecateTask,
  TaskSequenceItem,
  SpecChange,
  ConfirmationChecklist
} from './types.js';

// -----------------------------------------------------------------------------
// Main Generation Function
// -----------------------------------------------------------------------------

/**
 * Generate amendment.md content from an AmendmentRecord.
 *
 * This produces a full revision plan document, not a simple change log.
 */
export async function generateAmendmentMd(
  changeDir: string,
  record: AmendmentRecord,
  version: number = 0
): Promise<string> {
  const lines: string[] = [];

  // ── Header ──
  lines.push(`# Amendment v${version}: ${record.metadata.changeName}`);
  lines.push('');

  // ── Metadata ──
  lines.push('## Metadata');
  lines.push(`- **Version**: v${version}`);
  lines.push(`- **Created**: ${record.metadata.created}`);
  if (record.metadata.amendmentType) {
    lines.push(`- **Amendment Type**: ${record.metadata.amendmentType}`);
  }
  lines.push(`- **Status**: ${record.metadata.status || 'DRAFT'}`);
  lines.push(`- **Reason**: ${record.metadata.reason}`);
  lines.push(`- **Triggered By**: ${record.metadata.triggeredBy}`);
  lines.push('');

  // ── Backup Information ──
  if (version > 0) {
    lines.push('## Backup Information');
    lines.push(`- **Previous Version**: v${version - 1}`);
    lines.push(`- **Backup Location**: .versions/v${version - 1}/`);
    lines.push(`- **Rollback**: Restore from backup if needed`);
    lines.push('');
  }

  // ── Summary ──
  lines.push('## Summary');
  lines.push(record.summary);
  lines.push('');

  // ── Modification Logic ──
  if (record.changes.modificationLogic) {
    lines.push('## Modification Logic');
    lines.push('');

    // Affected Artifacts table
    lines.push('### Affected Artifacts');
    lines.push('| Artifact | Action | Priority | Reason |');
    lines.push('|----------|--------|----------|--------|');
    for (const mod of record.changes.modificationLogic.affectedArtifacts) {
      lines.push(`| ${mod.artifact} | ${mod.action} | ${mod.priority} | ${truncateString(mod.reason, 50)} |`);
    }
    lines.push('');

    // Modification Order
    lines.push('### Modification Order');
    for (let i = 0; i < record.changes.modificationLogic.modificationOrder.length; i++) {
      lines.push(`${i + 1}. ${record.changes.modificationLogic.modificationOrder[i]}`);
    }
    lines.push('');
  }

  // ── Change Drafts ──
  lines.push('## Change Drafts');
  lines.push('');
  lines.push('> **Note**: These are planned changes. Actual modifications are applied');
  lines.push('> via `/opsx:apply` after user confirmation.');
  lines.push('');

  // Proposal changes
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

  // Design changes
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

  // Spec changes
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

  // ── Tasks Rolling Plan ──
  if (record.changes.tasksRolling) {
    const plan = record.changes.tasksRolling;

    lines.push('## Tasks Rolling Plan');
    lines.push('');

    // Rollback
    if (plan.rollback.length > 0) {
      lines.push('### Rollback Tasks (need to undo completed work)');
      lines.push('| Task ID | Description | Rollback Action | Rollback Code |');
      lines.push('|---------|-------------|-----------------|---------------|');
      for (const task of plan.rollback) {
        lines.push(`| ${task.id} | ${truncateString(task.description, 40)} | ${truncateString(task.rollbackAction, 40)} | ${truncateString(task.rollbackCode, 40)} |`);
      }
      lines.push('');
    }

    // Restack
    if (plan.restack.length > 0) {
      lines.push('### Restack Tasks (reorder/modify pending tasks)');
      lines.push('| Task ID | Original | Modified | Reason |');
      lines.push('|---------|----------|----------|--------|');
      for (const task of plan.restack) {
        lines.push(`| ${task.id} | ${truncateString(task.originalDescription, 30)} | ${truncateString(task.newDescription, 30)} | ${truncateString(task.reason, 30)} |`);
      }
      lines.push('');
    }

    // Append
    if (plan.append.length > 0) {
      lines.push('### Append Tasks (new tasks to add)');
      lines.push('| Task ID | Description | Section | After Task |');
      lines.push('|---------|-------------|---------|------------|');
      for (const task of plan.append) {
        lines.push(`| ${task.id} | ${truncateString(task.description, 40)} | ${task.section} | ${task.afterTask} |`);
      }
      lines.push('');
    }

    // Deprecate
    if (plan.deprecate.length > 0) {
      lines.push('### Deprecate Tasks (no longer needed)');
      lines.push('| Task ID | Description | Reason |');
      lines.push('|---------|-------------|--------|');
      for (const task of plan.deprecate) {
        lines.push(`| ${task.id} | ${truncateString(task.description, 40)} | ${truncateString(task.reason, 40)} |`);
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

  // ── Legacy Tasks Change (backward compat) ──
  if (record.changes.tasks && !record.changes.tasksRolling) {
    const t = record.changes.tasks;
    lines.push('### Tasks Changes');
    lines.push('');

    if (t.preserved.length > 0) {
      lines.push(`**Preserved (${t.preserved.length})**: Tasks that remain valid`);
      for (const task of t.preserved.slice(0, 5)) {
        lines.push(`  - ${task.id}: ${task.description}`);
      }
      if (t.preserved.length > 5) {
        lines.push(`  - ... and ${t.preserved.length - 5} more`);
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
        if (task.reason) {
          lines.push(`    - Reason: ${task.reason}`);
        }
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

  // ── Impact Analysis ──
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

  // ── Confirmation Checklist ──
  if (record.confirmationChecklist) {
    lines.push('## Confirmation Checklist');
    lines.push('');
    const cl = record.confirmationChecklist;
    lines.push(`- [${cl.modificationLogicCorrect ? 'x' : ' '}] Modification logic is correct`);
    lines.push(`- [${cl.changeDraftsComplete ? 'x' : ' '}] Change drafts are complete and accurate`);
    lines.push(`- [${cl.tasksRollingFeasible ? 'x' : ' '}] Tasks rolling plan is feasible`);
    lines.push(`- [${cl.impactAcceptable ? 'x' : ' '}] Impact analysis is acceptable`);
    lines.push(`- [${cl.readyToApply ? 'x' : ' '}] Ready to apply this amendment`);
    lines.push('');
  }

  // ── Rollback Plan ──
  lines.push('## Rollback Plan (for the amendment itself)');
  lines.push(record.rollbackPlan);
  lines.push('');

  // ── Next Steps ──
  lines.push('## Next Steps');
  for (let i = 0; i < record.nextSteps.length; i++) {
    lines.push(`${i + 1}. ${record.nextSteps[i]}`);
  }
  lines.push('');

  // ── Footer ──
  lines.push('---');
  lines.push(`*Generated by OpenSpec Amend Workflow | Status: ${record.metadata.status || 'DRAFT'}*`);

  return lines.join('\n');
}

/**
 * Write amendment.md to the change directory.
 *
 * Writes both the versioned file (amendment-v{n}.md) and the
 * latest file (amendment.md).
 */
export async function writeAmendmentMd(
  changeDir: string,
  record: AmendmentRecord,
  version: number = 0
): Promise<string> {
  const content = await generateAmendmentMd(changeDir, record, version);
  const amendmentFileName = version > 0 ? `amendment-v${version}.md` : 'amendment.md';
  const amendmentPath = path.join(changeDir, amendmentFileName);
  await fs.writeFile(amendmentPath, content);

  // Also write/update the latest amendment.md
  const latestAmendmentPath = path.join(changeDir, 'amendment.md');
  await fs.writeFile(latestAmendmentPath, content);

  return amendmentPath;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Truncate a string to a maximum length for table display.
 */
function truncateString(str: string, maxLen: number): string {
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