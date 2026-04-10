/**
 * Update Tasks
 *
 * Handles parsing and updating tasks.md during amendments.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { ParsedTask, TasksChange, TaskItem, AmendmentRecord } from './types.js';

/**
 * Parse tasks.md content into structured format.
 */
export function parseTasks(content: string): ParsedTask[] {
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
 * Serialize parsed tasks back to markdown.
 */
export function serializeTasks(
  tasks: ParsedTask[],
  options: {
    amendmentComment?: string;
    preserved?: TaskItem[];
    added?: TaskItem[];
    removed?: TaskItem[];
  } = {}
): string {
  const lines: string[] = [];

  // Add amendment comment if provided
  if (options.amendmentComment) {
    lines.push(`<!-- Amendment: ${options.amendmentComment} -->`);
    lines.push('');
  }

  // Group by section
  const sectionMap = new Map<string, ParsedTask[]>();
  for (const task of tasks) {
    const sectionTasks = sectionMap.get(task.section) || [];
    sectionTasks.push(task);
    sectionMap.set(task.section, sectionTasks);
  }

  // Build sections
  for (const [section, sectionTasks] of sectionMap) {
    if (section) {
      lines.push(`## ${section}`);
      lines.push('');
    }

    for (const task of sectionTasks) {
      const checkbox = task.completed ? '[x]' : '[ ]';
      lines.push(`- ${checkbox} ${task.id} ${task.description}`);
    }

    // Add new tasks
    if (options.added && options.added.length > 0) {
      for (const newTask of options.added) {
        lines.push(`- [ ] ${newTask.id} ${newTask.description}`);
      }
    }

    lines.push('');
  }

  // Add removed tasks as comments
  if (options.removed && options.removed.length > 0) {
    lines.push('<!-- Removed Tasks (preserved for reference) -->');
    for (const removedTask of options.removed) {
      lines.push(`<!-- - [ ] ${removedTask.id} ${removedTask.description} -->`);
      if (removedTask.reason) {
        lines.push(`<!--   Reason: ${removedTask.reason} -->`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Update tasks.md with amendment changes.
 */
export async function updateTasksMd(
  changeDir: string,
  record: AmendmentRecord
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

  // Build new task list
  const updatedTasks: ParsedTask[] = [];

  // Add preserved tasks
  for (const preserved of tasksChange.preserved) {
    const existing = existingTasks.find(t => t.id === preserved.id);
    if (existing) {
      updatedTasks.push(existing);
    } else {
      // New preserved task
      updatedTasks.push({
        id: preserved.id,
        description: preserved.description,
        completed: true,
        section: 'Completed',
        line: -1,
        indent: 0
      });
    }
  }

  // Add modified tasks (update description)
  for (const modified of tasksChange.modified) {
    const existing = existingTasks.find(t => t.id === modified.id);
    if (existing) {
      updatedTasks.push({
        ...existing,
        description: modified.description
      });
    }
  }

  // Add new tasks
  for (const added of tasksChange.added) {
    const idParts = added.id.split('.');
    const section = idParts.length > 1 ? `Section ${idParts[0]}` : 'New Tasks';

    updatedTasks.push({
      id: added.id,
      description: added.description,
      completed: false,
      section,
      line: -1,
      indent: 0
    });
  }

  // Serialize and write
  const newContent = serializeTasks(updatedTasks, {
    amendmentComment: `${record.metadata.created} - ${record.metadata.reason}`,
    preserved: tasksChange.preserved,
    added: tasksChange.added,
    removed: tasksChange.removed
  });

  await fs.writeFile(tasksPath, newContent);
}

/**
 * Find the next available task ID.
 */
export function findNextTaskId(tasks: ParsedTask[], section: string): string {
  const sectionPrefix = section.match(/^\d+/)?.[0] || '1';
  const sectionTasks = tasks.filter(t => t.id.startsWith(`${sectionPrefix}.`));

  if (sectionTasks.length === 0) {
    return `${sectionPrefix}.1`;
  }

  const maxSubId = Math.max(
    ...sectionTasks.map(t => parseInt(t.id.split('.')[1] || '0'))
  );

  return `${sectionPrefix}.${maxSubId + 1}`;
}

/**
 * Mark a task as complete.
 */
export function markTaskComplete(
  content: string,
  taskId: string
): string {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)-\s+\[\s*\]\s+(\d+\.\d+)/);
    if (match && match[2] === taskId) {
      lines[i] = lines[i].replace('- [ ]', '- [x]');
      break;
    }
  }

  return lines.join('\n');
}

/**
 * Get task by ID.
 */
export function getTaskById(
  tasks: ParsedTask[],
  taskId: string
): ParsedTask | undefined {
  return tasks.find(t => t.id === taskId);
}

/**
 * Get tasks by section.
 */
export function getTasksBySection(
  tasks: ParsedTask[],
  section: string
): ParsedTask[] {
  return tasks.filter(t => t.section === section);
}

/**
 * Calculate progress statistics.
 */
export function calculateProgress(tasks: ParsedTask[]): {
  total: number;
  completed: number;
  pending: number;
  percentage: number;
} {
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const pending = total - completed;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, pending, percentage };
}