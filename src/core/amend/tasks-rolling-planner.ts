/**
 * Tasks Rolling Planner
 *
 * Plans the rolling (reorganization) of tasks.md when an amendment
 * changes the implementation approach.
 *
 * Operations:
 * - Rollback: completed tasks that conflict with new approach
 * - Restack:  pending tasks that need description/priority changes
 * - Append:   new tasks added for the amendment
 * - Deprecate: tasks no longer needed
 *
 * This module is called from the Amend workflow to PLAN the rolling,
 * and from the Apply workflow to EXECUTE it.
 */

import type {
  TasksRollingPlan,
  RollbackTask,
  RestackTask,
  AppendTask,
  DeprecateTask,
  TaskSequenceItem,
  ModificationLogic,
  AmendmentType,
  ParsedTask,
  TaskProgress
} from './types.js';
import { getRollingStrategyWeight } from './types.js';
import { parseTasks } from './update-tasks.js';

// -----------------------------------------------------------------------------
// Main Function (Planning)
// -----------------------------------------------------------------------------

/**
 * Plan tasks rolling based on modification logic and current task state.
 *
 * @param tasksContent - Current tasks.md content
 * @param modificationLogic - What artifacts are affected
 * @param progress - Current task progress snapshot
 * @param amendmentType - Type of amendment
 * @param userDescription - User's description of what needs to change
 * @returns Complete TasksRollingPlan
 */
export async function planTasksRolling(
  tasksContent: string,
  modificationLogic: ModificationLogic,
  progress: TaskProgress,
  amendmentType: AmendmentType,
  userDescription: string
): Promise<TasksRollingPlan> {
  const parsedTasks = parseTasks(tasksContent);
  const strategy = getRollingStrategyWeight(amendmentType);

  return buildTasksRollingPlan(
    parsedTasks,
    progress,
    amendmentType,
    userDescription,
    strategy
  );
}

// -----------------------------------------------------------------------------
// Rolling Plan Builder
// -----------------------------------------------------------------------------

/**
 * Build the complete tasks rolling plan.
 */
function buildTasksRollingPlan(
  parsedTasks: ParsedTask[],
  progress: TaskProgress,
  amendmentType: AmendmentType,
  userDescription: string,
  strategy: { rollbackWeight: number; restackWeight: number; appendWeight: number; deprecateWeight: number }
): TasksRollingPlan {
  const rollback: RollbackTask[] = [];
  const restack: RestackTask[] = [];
  const append: AppendTask[] = [];
  const deprecate: DeprecateTask[] = [];

  // Classify completed tasks: check if they conflict with new approach
  if (strategy.rollbackWeight > 0) {
    for (const id of progress.completedIds) {
      const task = parsedTasks.find(t => t.id === id);
      if (task && isTaskConflicting(task, amendmentType, userDescription)) {
        rollback.push({
          id: task.id,
          description: task.description,
          rollbackAction: `Remove code/files related to: ${task.description}`,
          rollbackCode: `Files and code introduced by task ${task.id}`
        });
      }
    }
  }

  // Classify pending tasks: check if they need restacking or deprecation
  for (const id of progress.pendingIds) {
    const task = parsedTasks.find(t => t.id === id);
    if (!task) continue;

    if (isTaskConflicting(task, amendmentType, userDescription) && strategy.deprecateWeight > 0) {
      deprecate.push({
        id: task.id,
        description: task.description,
        reason: `No longer needed with the new approach: ${userDescription}`
      });
    } else if (isTaskNeedsRestack(task, amendmentType, userDescription) && strategy.restackWeight > 0) {
      restack.push({
        id: task.id,
        originalDescription: task.description,
        newDescription: task.description, // Placeholder — AI/user will fill in
        reason: `Needs adjustment for: ${userDescription}`
      });
    }
  }

  // Determine new tasks to append
  if (strategy.appendWeight > 0) {
    const newTaskCount = estimateNewTaskCount(amendmentType, userDescription);
    for (let i = 0; i < newTaskCount; i++) {
      const section = determineSectionForNewTask(amendmentType, i);
      const lastTaskInSection = findLastTaskIdInSection(parsedTasks, section);
      append.push({
        id: `new.${i + 1}`,
        description: `New task required by amendment (placeholder)`,
        section,
        afterTask: lastTaskInSection || `${section}.0`
      });
    }
  }

  // Build new sequence
  const newSequence = buildNewSequence(
    parsedTasks,
    progress,
    rollback,
    restack,
    append,
    deprecate
  );

  return {
    rollback,
    restack,
    append,
    deprecate,
    newSequence
  };
}

// -----------------------------------------------------------------------------
// Task Classification Helpers
// -----------------------------------------------------------------------------

/**
 * Check if a completed task conflicts with the new approach.
 */
function isTaskConflicting(
  task: ParsedTask,
  amendmentType: AmendmentType,
  description: string
): boolean {
  if (amendmentType === 'design-issue') {
    const conflictKeywords = extractConflictKeywords(description);
    return conflictKeywords.some(kw =>
      task.description.toLowerCase().includes(kw.toLowerCase())
    );
  }

  if (amendmentType === 'scope-change') {
    const removeKeywords = extractRemoveKeywords(description);
    return removeKeywords.some(kw =>
      task.description.toLowerCase().includes(kw.toLowerCase())
    );
  }

  return false;
}

/**
 * Check if a pending task needs restacking.
 */
function isTaskNeedsRestack(
  task: ParsedTask,
  amendmentType: AmendmentType,
  description: string
): boolean {
  if (amendmentType === 'spec-error') return false;

  const changeKeywords = extractConflictKeywords(description);
  return changeKeywords.some(kw =>
    task.description.toLowerCase().includes(kw.toLowerCase())
  );
}

/**
 * Extract conflict keywords from user description.
 */
function extractConflictKeywords(description: string): string[] {
  const fromToMatch = description.match(/from\s+(\w+)\s+to\s+(\w+)/i);
  if (fromToMatch) {
    return [fromToMatch[1]];
  }

  const replaceMatch = description.match(/replace\s+(\w+)/i);
  if (replaceMatch) {
    return [replaceMatch[1]];
  }

  return description
    .split(/[,;.]/)
    .map(s => s.trim())
    .filter(s => s.length > 2);
}

/**
 * Extract "remove" keywords for scope-change deprecation.
 */
function extractRemoveKeywords(description: string): string[] {
  const removeMatch = description.match(/remove\s+(\w+)/i);
  if (removeMatch) {
    return [removeMatch[1]];
  }

  const narrowMatch = description.match(/narrow|drop|exclude\s+(\w+)/i);
  if (narrowMatch) {
    return [narrowMatch[1]];
  }

  return [];
}

/**
 * Estimate how many new tasks the amendment will require.
 */
function estimateNewTaskCount(
  amendmentType: AmendmentType,
  description: string
): number {
  switch (amendmentType) {
    case 'design-issue':
      return 3;
    case 'missing-feature':
      return Math.max(2, Math.ceil(description.split(/[,;]/).length * 2));
    case 'spec-error':
      return 1;
    case 'scope-change':
      return 2;
    case 'other':
      return 2;
  }
}

/**
 * Determine which section new tasks should go in.
 */
function determineSectionForNewTask(
  amendmentType: AmendmentType,
  taskIndex: number
): string {
  switch (amendmentType) {
    case 'design-issue':
      return taskIndex === 0 ? '2' : '2';
    case 'missing-feature':
      return taskIndex < 2 ? '2' : '3';
    case 'spec-error':
      return '2';
    case 'scope-change':
      return taskIndex < 1 ? '1' : '2';
    case 'other':
      return '2';
  }
}

/**
 * Find the last task ID in a given section.
 */
function findLastTaskIdInSection(
  tasks: ParsedTask[],
  sectionPrefix: string
): string {
  const sectionTasks = tasks.filter(t => t.id.startsWith(`${sectionPrefix}.`));
  if (sectionTasks.length === 0) return `${sectionPrefix}.0`;
  return sectionTasks[sectionTasks.length - 1].id;
}

/**
 * Build the new task sequence after rolling.
 */
function buildNewSequence(
  parsedTasks: ParsedTask[],
  progress: TaskProgress,
  rollback: RollbackTask[],
  restack: RestackTask[],
  append: AppendTask[],
  deprecate: DeprecateTask[]
): TaskSequenceItem[] {
  const sequence: TaskSequenceItem[] = [];
  const rollbackIds = new Set(rollback.map(r => r.id));
  const deprecateIds = new Set(deprecate.map(d => d.id));
  const restackMap = new Map(restack.map(r => [r.id, r]));

  // Add completed tasks that are NOT being rolled back
  for (const id of progress.completedIds) {
    const task = parsedTasks.find(t => t.id === id);
    if (!task) continue;

    if (rollbackIds.has(id)) {
      sequence.push({
        id: task.id,
        description: task.description,
        status: 'rollback',
        section: task.section
      });
    } else {
      sequence.push({
        id: task.id,
        description: task.description,
        status: 'completed',
        section: task.section
      });
    }
  }

  // Add pending tasks that are NOT deprecated, with restack modifications
  for (const id of progress.pendingIds) {
    const task = parsedTasks.find(t => t.id === id);
    if (!task) continue;

    if (deprecateIds.has(id)) {
      continue;
    }

    const restackEntry = restackMap.get(id);
    if (restackEntry) {
      sequence.push({
        id: task.id,
        description: restackEntry.newDescription,
        status: 'restack',
        section: task.section
      });
    } else {
      sequence.push({
        id: task.id,
        description: task.description,
        status: 'pending',
        section: task.section
      });
    }
  }

  // Append new tasks
  for (const newTask of append) {
    sequence.push({
      id: newTask.id,
      description: newTask.description,
      status: 'append',
      section: newTask.section
    });
  }

  return sequence;
}