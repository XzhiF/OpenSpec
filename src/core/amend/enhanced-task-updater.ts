/**
 * Enhanced Task Updater
 *
 * Enhanced version of task updater that includes:
 * - Version tracking comments
 * - Modified task comparison comments (Previously: ...)
 * - Rollback steps section
 * - Detailed removal reasons
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { ParsedTask, TasksChange, TaskItem, AmendmentRecord } from './types.js';

/**
 * Enhanced update of tasks.md with version tracking and rollback steps.
 */
export async function enhancedUpdateTasksMd(
  changeDir: string,
  record: AmendmentRecord,
  version: number
): Promise<void> {
  const tasksPath = path.join(changeDir, 'tasks.md');

  // Read existing content
  let content: string;
  try {
    content = await fs.readFile(tasksPath, 'utf-8');
  } catch {
    content = '# Tasks\n\n';
  }

  // Parse existing tasks
  const existingTasks = parseTasks(content);

  // Apply changes
  const tasksChange = record.changes.tasks;
  if (!tasksChange) {
    return;
  }

  // Build sections
  const sections: string[] = [];

  // 1. Add version tracking comment
  sections.push(`<!-- Amendment v${version}: ${record.metadata.created.split('T')[0]} - ${record.metadata.reason} -->`);
  sections.push('');

  // 2. Group tasks by section
  const sectionMap = groupTasksBySection(existingTasks);

  // 3. Build each section
  for (const [sectionName, sectionTasks] of sectionMap) {
    sections.push(`## ${sectionName}`);
    sections.push('');

    // Add preserved tasks (completed)
    for (const task of sectionTasks) {
      if (tasksChange.preserved.some(p => p.id === task.id)) {
        if (task.completed) {
          sections.push(`- [x] ${task.id} ${task.description}`);
        } else {
          sections.push(`- [ ] ${task.id} ${task.description}`);
        }
      }
    }

    // Add modified tasks with "Previously" comment
    for (const modified of tasksChange.modified) {
      const original = existingTasks.find(t => t.id === modified.id);
      sections.push(`- [ ] ${modified.id} ${modified.description} (modified in v${version})`);
      if (original && original.description !== modified.description) {
        sections.push(`  <!-- Previously: ${original.id} ${original.description} -->`);
      }
    }

    // Add new tasks
    for (const added of tasksChange.added) {
      sections.push(`- [ ] ${added.id} ${added.description} (added in v${version})`);
    }

    sections.push('');
  }

  // 4. Removed tasks section
  if (tasksChange.removed.length > 0) {
    sections.push('<!-- Removed Tasks (preserved for rollback) -->');
    for (const removed of tasksChange.removed) {
      sections.push(`<!-- - [ ] ${removed.id} ${removed.description} -->`);
      sections.push(`<!--   Removed in v${version}: ${removed.reason || 'No longer needed'} -->`);
    }
    sections.push('');
  }

  // 5. Rollback Steps section
  const rollbackSteps = generateRollbackSteps(record, version);
  if (rollbackSteps.length > 0) {
    sections.push('## Rollback Steps (if needed)');
    sections.push('');
    sections.push(`<!-- Rollback to v${version - 1} -->`);

    for (const step of rollbackSteps) {
      sections.push(`- [ ] ${step.id} ${step.description}`);
    }
    sections.push('');
  }

  // Write updated content
  await fs.writeFile(tasksPath, sections.join('\n'));
}

/**
 * Parse tasks.md content into structured format.
 */
function parseTasks(content: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const lines = content.split('\n');
  let currentSection = '';
  let sectionIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect section headers
    const sectionMatch = line.match(/^(#+)\s+(.+)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[2];
      sectionIndent = sectionMatch[1].length;
      continue;
    }

    // Parse task lines
    const taskMatch = line.match(/^(\s*)-\s+\[([ x])\]\s+(\d+\.\d+)\s+(.+)$/);
    if (taskMatch) {
      const indent = taskMatch[1].length;
      const completed = taskMatch[2] === 'x';
      const id = taskMatch[3];
      const description = taskMatch[4];

      tasks.push({
        id,
        description,
        completed,
        section: currentSection,
        line: i,
        indent
      });
    }
  }

  return tasks;
}

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

/**
 * Generate rollback steps based on amendment changes.
 */
function generateRollbackSteps(
  record: AmendmentRecord,
  version: number
): TaskItem[] {
  const rollbackSteps: TaskItem[] = [];
  let rollbackId = 1;

  // Based on change types, generate appropriate rollback steps

  // Design changes
  if (record.changes.design) {
    rollbackSteps.push({
      id: `R${rollbackId++}`,
      description: `Restore design.md from v${version - 1} backup`
    });
  }

  // Spec changes
  if (record.changes.specs?.length) {
    for (const specChange of record.changes.specs) {
      if (specChange.operation === 'ADDED') {
        rollbackSteps.push({
          id: `R${rollbackId++}`,
          description: `Remove added requirement: ${specChange.requirement}`
        });
      } else if (specChange.operation === 'REMOVED') {
        rollbackSteps.push({
          id: `R${rollbackId++}`,
          description: `Restore removed requirement: ${specChange.requirement}`
        });
      }
    }
  }

  // Task changes
  if (record.changes.tasks?.added.length) {
    rollbackSteps.push({
      id: `R${rollbackId++}`,
      description: `Remove ${record.changes.tasks.added.length} new tasks added in v${version}`
    });
  }

  if (record.changes.tasks?.modified.length) {
    rollbackSteps.push({
      id: `R${rollbackId++}`,
      description: `Revert ${record.changes.tasks.modified.length} modified tasks to original descriptions`
    });
  }

  // Final fallback: restore all from backup
  if (rollbackSteps.length > 0) {
    rollbackSteps.push({
      id: `R${rollbackId}`,
      description: `Restore all artifacts from v${version - 1} backup (.versions/v${version - 1}/)`
    });
  }

  return rollbackSteps;
}