/**
 * Generate Amendment Markdown
 *
 * Generates amendment.md files from amendment records.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { AmendmentRecord } from './types.js';

/**
 * Generate amendment.md content.
 */
export async function generateAmendmentMd(
  changeDir: string,
  record: AmendmentRecord,
  version: number = 0
): Promise<string> {
  const lines: string[] = [];

  // Header with version
  lines.push(`# Amendment v${version}: ${record.metadata.changeName}`);
  lines.push('');

  // Metadata
  lines.push('## Metadata');
  lines.push(`- **Version**: v${version}`);
  lines.push(`- **Created**: ${record.metadata.created}`);
  lines.push(`- **Reason**: ${record.metadata.reason}`);
  lines.push(`- **Triggered By**: ${record.metadata.triggeredBy}`);
  lines.push('');

  // Backup Information (if version > 0)
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

  // Changes
  lines.push('## Changes');
  lines.push('');

  if (record.changes.proposal) {
    lines.push('### Proposal Changes');
    lines.push(`**Reason**: ${record.changes.proposal.reason}`);
    lines.push('');
    lines.push('<details>');
    lines.push('<summary>View diff</summary>');
    lines.push('');
    lines.push('```diff');
    lines.push(`- ${record.changes.proposal.before.split('\n').slice(0, 5).join('\n- ')}`);
    lines.push(`+ ${record.changes.proposal.after.split('\n').slice(0, 5).join('\n+ ')}`);
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  if (record.changes.specs?.length) {
    lines.push('### Spec Changes');
    lines.push('');

    const byOperation = {
      ADDED: record.changes.specs.filter(s => s.operation === 'ADDED'),
      MODIFIED: record.changes.specs.filter(s => s.operation === 'MODIFIED'),
      REMOVED: record.changes.specs.filter(s => s.operation === 'REMOVED')
    };

    if (byOperation.ADDED.length > 0) {
      lines.push('#### ADDED Requirements');
      for (const spec of byOperation.ADDED) {
        lines.push(`- **${spec.specName}**: ${spec.requirement}`);
      }
      lines.push('');
    }

    if (byOperation.MODIFIED.length > 0) {
      lines.push('#### MODIFIED Requirements');
      for (const spec of byOperation.MODIFIED) {
        lines.push(`- **${spec.specName}**: ${spec.requirement}`);
      }
      lines.push('');
    }

    if (byOperation.REMOVED.length > 0) {
      lines.push('#### REMOVED Requirements');
      for (const spec of byOperation.REMOVED) {
        lines.push(`- **${spec.specName}**: ${spec.requirement}`);
        if (spec.details) {
          lines.push(`  - ${spec.details}`);
        }
      }
      lines.push('');
    }
  }

  if (record.changes.design) {
    lines.push('### Design Changes');
    lines.push(`**Reason**: ${record.changes.design.reason}`);
    lines.push('');
    lines.push('<details>');
    lines.push('<summary>View changes</summary>');
    lines.push('');
    lines.push('```diff');
    lines.push(`- Previous approach`);
    lines.push(`+ New approach`);
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  if (record.changes.tasks) {
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

  // Rollback Plan
  lines.push('## Rollback Plan');
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
  lines.push(`*Generated by OpenSpec Amend Workflow*`);

  return lines.join('\n');
}

/**
 * Write amendment.md to the change directory.
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