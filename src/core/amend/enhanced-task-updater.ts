/**
 * Enhanced Task Updater
 *
 * Applies TasksRollingPlan to tasks.md during the apply phase.
 * Called by AmendmentApplier (NOT by amend directly).
 *
 * Operations:
 * - Rollback:   Mark completed tasks with `[x→ROLLBACK]` annotation
 * - Restack:    Update task descriptions with `[RESTACK→id]` annotation
 * - Append:     Add new tasks with `[APPEND→id]` annotation
 * - Deprecate:  Comment out deprecated tasks with reason
 * - Generate:   Complete new task sequence after rolling
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
  ParsedTask,
  TasksRollingPlan,
  RollbackTask,
  RestackTask,
  AppendTask,
  DeprecateTask,
  TaskSequenceItem,
  AmendmentRecord
} from './types.js';
import { parseTasks } from './update-tasks.js';

// -----------------------------------------------------------------------------
// Main Function
// -----------------------------------------------------------------------------

/**
 * Apply TasksRollingPlan to tasks.md.
 *
 * This is called during the apply phase, not during amend.
 * It modifies tasks.md in place with rolling annotations.
 *
 * @param changeDir - The change directory path
 * @param rollingPlan - The TasksRollingPlan to apply
 * @param version - Amendment version number
 * @returns Summary of changes applied
 */
export async function applyTasksRollingPlan(
  changeDir: string,
  rollingPlan: TasksRollingPlan,
  version: number
): Promise<{
  rollbackCount: number;
  restackCount: number;
  appendCount: number;
  deprecateCount: number;
}> {
  const tasksPath = path.join(changeDir, 'tasks.md');

  // Read existing content
  let content: string;
  try {
    content = await fs.readFile(tasksPath, 'utf-8');
  } catch {
    content = '# Tasks\n\n';
  }

  // Parse existing tasks
  const parsedTasks = parseTasks(content);

  // Build new content by applying rolling operations
  const newContent = buildRolledTasksContent(
    content,
    parsedTasks,
    rollingPlan,
    version
  );

  // Write updated content
  await fs.writeFile(tasksPath, newContent);

  return {
    rollbackCount: rollingPlan.rollback.length,
    restackCount: rollingPlan.restack.length,
    appendCount: rollingPlan.append.length,
    deprecateCount: rollingPlan.deprecate.length
  };
}

// -----------------------------------------------------------------------------
// Content Builder
// -----------------------------------------------------------------------------

/**
 * Build the new tasks.md content by applying all rolling operations.
 */
function buildRolledTasksContent(
  originalContent: string,
  parsedTasks: ParsedTask[],
  plan: TasksRollingPlan,
  version: number
): string {
  const rollbackIds = new Set(plan.rollback.map(r => r.id));
  const deprecateIds = new Set(plan.deprecate.map(d => d.id));
  const restackMap = new Map(plan.restack.map(r => [r.id, r]));

  // Process each line of the original content
  const lines = originalContent.split('\n');
  const resultLines: string[] = [];

  // Add version annotation header
  resultLines.push(`<!-- Amendment v${version}: Rolling plan applied -->`);
  resultLines.push('');

  for (const line of lines) {
    // Skip existing amendment headers (from previous versions)
    if (line.match(/^<!-- Amendment v\d+: Rolling plan applied -->/)) {
      continue;
    }
    if (line.match(/^<!-- Amendment v\d+: /)) {
      // Keep other amendment comments
      resultLines.push(line);
      continue;
    }

    // Check if this line is a task
    const taskMatch = line.match(/^(\s*)-\s+\[([ x])\]\s+(\d+\.\d+)\s+(.+)$/);
    if (taskMatch) {
      const indent = taskMatch[1];
      const completed = taskMatch[2] === 'x';
      const id = taskMatch[3];
      const description = taskMatch[4];

      // Apply rollback annotation
      if (rollbackIds.has(id)) {
        resultLines.push(`${indent}- [x→ROLLBACK] ${id} ${description}`);
        resultLines.push(`${indent}  <!-- Amendment v${version}: Marked for rollback → Remove in v${version} -->`);
        continue;
      }

      // Apply deprecation annotation
      if (deprecateIds.has(id)) {
        const deprecateEntry = plan.deprecate.find(d => d.id === id);
        resultLines.push(`<!-- - [${completed ? 'x' : ' '}] ${id} ${description} -->`);
        resultLines.push(`<!--   Amendment v${version}: DEPRECATED → ${deprecateEntry?.reason || 'No longer needed'} -->`);
        continue;
      }

      // Apply restack annotation
      const restackEntry = restackMap.get(id);
      if (restackEntry) {
        const newDesc = restackEntry.newDescription !== restackEntry.originalDescription
          ? restackEntry.newDescription
          : description;
        resultLines.push(`${indent}- [ ] ${id} ${newDesc}`);
        if (restackEntry.originalDescription !== restackEntry.newDescription) {
          resultLines.push(`${indent}  <!-- Amendment v${version}: RESTACK → was: ${restackEntry.originalDescription} (${restackEntry.reason}) -->`);
        }
        continue;
      }

      // Keep unchanged tasks
      resultLines.push(line);
      continue;
    }

    // Keep all non-task lines (headers, comments, blank lines, etc.)
    resultLines.push(line);
  }

  // Append new tasks
  if (plan.append.length > 0) {
    resultLines.push('');
    resultLines.push(`<!-- Amendment v${version}: APPENDED tasks -->`);

    for (const appendTask of plan.append) {
      resultLines.push(`- [ ] ${appendTask.id} ${appendTask.description}`);
      resultLines.push(`  <!-- Amendment v${version}: APPEND → section ${appendTask.section}, after ${appendTask.afterTask} -->`);
    }
    resultLines.push('');
  }

  // Add rollback steps section (for tasks that need code removal)
  if (plan.rollback.length > 0) {
    resultLines.push('');
    resultLines.push(`## Rollback Steps (Amendment v${version})`);
    resultLines.push('');
    resultLines.push(`<!-- These steps must be completed before continuing implementation -->`);

    for (const rollbackTask of plan.rollback) {
      resultLines.push(`- [ ] ${rollbackTask.id} ${rollbackTask.rollbackAction}`);
      resultLines.push(`  <!-- Rollback code: ${rollbackTask.rollbackCode} -->`);
    }
    resultLines.push('');
  }

  // Add deprecated tasks reference section
  if (plan.deprecate.length > 0) {
    resultLines.push('');
    resultLines.push(`<!-- Deprecated Tasks (Amendment v${version}) -->`);
    resultLines.push(`<!-- These tasks are preserved for historical reference -->`);
    for (const depTask of plan.deprecate) {
      resultLines.push(`<!-- ${depTask.id}: ${depTask.description} → Reason: ${depTask.reason} -->`);
    }
    resultLines.push('');
  }

  return resultLines.join('\n');
}

// -----------------------------------------------------------------------------
// Legacy Backward-Compatible Function
// -----------------------------------------------------------------------------

/**
 * Legacy function for backward compatibility.
 * Uses TasksChange format instead of TasksRollingPlan.
 */
export async function enhancedUpdateTasksMd(
  changeDir: string,
  record: AmendmentRecord,
  version: number
): Promise<void> {
  // If TasksRollingPlan is available, use the new function
  if (record.changes.tasksRolling) {
    await applyTasksRollingPlan(changeDir, record.changes.tasksRolling, version);
    return;
  }

  // Fall back to legacy TasksChange format
  const tasksChange = record.changes.tasks;
  if (!tasksChange) {
    return;
  }

  const tasksPath = path.join(changeDir, 'tasks.md');
  let content: string;
  try {
    content = await fs.readFile(tasksPath, 'utf-8');
  } catch {
    content = '# Tasks\n\n';
  }

  const existingTasks = parseTasks(content);
  const sections: string[] = [];

  // Version tracking comment
  sections.push(`<!-- Amendment v${version}: ${record.metadata.created.split('T')[0]} - ${record.metadata.reason} -->`);
  sections.push('');

  // Group by section
  const sectionMap = groupTasksBySection(existingTasks);

  for (const [sectionName, sectionTasks] of sectionMap) {
    sections.push(`## ${sectionName}`);
    sections.push('');

    // Preserved tasks
    for (const task of sectionTasks) {
      if (tasksChange.preserved.some(p => p.id === task.id)) {
        const checkbox = task.completed ? '[x]' : '[ ]';
        sections.push(`- ${checkbox} ${task.id} ${task.description}`);
      }
    }

    // Modified tasks with "Previously" comment
    for (const modified of tasksChange.modified) {
      const original = existingTasks.find(t => t.id === modified.id);
      sections.push(`- [ ] ${modified.id} ${modified.description} (modified in v${version})`);
      if (original && original.description !== modified.description) {
        sections.push(`  <!-- Previously: ${original.id} ${original.description} -->`);
      }
    }

    // New tasks
    for (const added of tasksChange.added) {
      sections.push(`- [ ] ${added.id} ${added.description} (added in v${version})`);
    }

    sections.push('');
  }

  // Removed tasks
  if (tasksChange.removed.length > 0) {
    sections.push('<!-- Removed Tasks (preserved for rollback) -->');
    for (const removed of tasksChange.removed) {
      sections.push(`<!-- - [ ] ${removed.id} ${removed.description} -->`);
      sections.push(`<!--   Removed in v${version}: ${removed.reason || 'No longer needed'} -->`);
    }
    sections.push('');
  }

  await fs.writeFile(tasksPath, sections.join('\n'));
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Group tasks by section.
 */
function groupTasksBySection(tasks: ParsedTask[]): Map<string, ParsedTask[]> {
  const map = new Map<string, ParsedTask[]>();

  for (const task of tasks) {
    const sectionTasks = map.get(task.section) || [];
    sectionTasks.push(task);
    map.set(task.section, sectionTasks);
  }

  return map;
}