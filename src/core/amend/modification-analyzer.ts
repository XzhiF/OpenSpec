/**
 * Modification Analyzer
 *
 * Analyzes user's modification intent and determines which artifacts
 * need changes, what kind of changes, and generates the tasks rolling plan.
 *
 * This is the core "intelligence" of the amend workflow — it does NOT
 * execute modifications, only analyzes and plans them.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
  AmendmentType,
  ModificationLogic,
  ArtifactModification,
  ArtifactAction,
  ArtifactPriority,
  TasksRollingPlan,
  RollbackTask,
  RestackTask,
  AppendTask,
  DeprecateTask,
  TaskSequenceItem,
  ParsedTask,
  TaskProgress,
  SpecChange
} from './types.js';
import { getArtifactsForType, getRollingStrategyWeight } from './types.js';
import { parseTasks } from './update-tasks.js';

// -----------------------------------------------------------------------------
// Internal Types
// -----------------------------------------------------------------------------

/**
 * Loaded artifacts content.
 */
interface LoadedArtifacts {
  proposal: string;
  design: string;
  tasks: string;
  specs: Map<string, string>;
}

/**
 * Result of modification analysis.
 */
export interface ModificationAnalysisResult {
  /** Modification logic (what to change, in what order) */
  modificationLogic: ModificationLogic;
  /** Tasks rolling plan */
  tasksRollingPlan: TasksRollingPlan;
  /** Spec changes identified */
  specChanges: SpecChange[];
  /** Summary of the analysis */
  analysisSummary: string;
}

// -----------------------------------------------------------------------------
// Main Function
// -----------------------------------------------------------------------------

/**
 * Analyze modification intent based on amendment type and user description.
 *
 * @param changeDir - The change directory path
 * @param amendmentType - Type of amendment
 * @param userDescription - User's description of what needs to change
 * @param progress - Current task progress snapshot
 * @returns Complete modification analysis result
 */
export async function analyzeModificationIntent(
  changeDir: string,
  amendmentType: AmendmentType,
  userDescription: string,
  progress: TaskProgress
): Promise<ModificationAnalysisResult> {
  // 1. Load all current artifacts
  const artifacts = await loadArtifacts(changeDir);

  // 2. Determine affected artifacts based on type and description
  const modificationLogic = buildModificationLogic(
    amendmentType,
    userDescription,
    getArtifactsForType(amendmentType)
  );

  // 3. Parse current tasks for rolling analysis
  const parsedTasks = parseTasks(artifacts.tasks);

  // 4. Build tasks rolling plan
  const strategy = getRollingStrategyWeight(amendmentType);
  const tasksRollingPlan = buildTasksRollingPlan(
    parsedTasks,
    progress,
    amendmentType,
    userDescription,
    strategy
  );

  // 5. Determine spec changes
  const specChanges = inferSpecChanges(
    amendmentType,
    userDescription,
    artifacts.specs
  );

  // 6. Generate analysis summary
  const analysisSummary = buildAnalysisSummary(
    modificationLogic,
    tasksRollingPlan,
    specChanges
  );

  return {
    modificationLogic,
    tasksRollingPlan,
    specChanges,
    analysisSummary
  };
}

// -----------------------------------------------------------------------------
// Modification Logic Builder
// -----------------------------------------------------------------------------

/**
 * Build modification logic: which artifacts to change, in what order.
 */
function buildModificationLogic(
  amendmentType: AmendmentType,
  userDescription: string,
  affectedArtifactNames: string[]
): ModificationLogic {
  const affectedArtifacts: ArtifactModification[] = [];

  // Define modification order based on amendment type
  const orderMap: Record<AmendmentType, string[]> = {
    'design-issue':   ['design', 'specs', 'proposal', 'tasks'],
    'missing-feature': ['proposal', 'specs', 'tasks'],
    'spec-error':     ['specs', 'tasks'],
    'scope-change':   ['proposal', 'specs', 'design', 'tasks'],
    'other':          ['proposal', 'specs', 'design', 'tasks']
  };

  // Define action and priority per artifact per type
  const actionPriorityMap: Record<AmendmentType, Record<string, { action: ArtifactAction; priority: ArtifactPriority }>> = {
    'design-issue': {
      design:    { action: 'MODIFY',    priority: 'P0' },
      specs:     { action: 'MODIFY',    priority: 'P1' },
      proposal:  { action: 'MODIFY',    priority: 'P2' },
      tasks:     { action: 'ROLL',      priority: 'P0' }
    },
    'missing-feature': {
      proposal:  { action: 'MODIFY',    priority: 'P1' },
      specs:     { action: 'ADD_REQ',   priority: 'P1' },
      tasks:     { action: 'ROLL',      priority: 'P0' }
    },
    'spec-error': {
      specs:     { action: 'MODIFY',    priority: 'P1' },
      tasks:     { action: 'ROLL',      priority: 'P2' }
    },
    'scope-change': {
      proposal:  { action: 'MODIFY',    priority: 'P1' },
      specs:     { action: 'ADD_REQ',   priority: 'P1' },
      design:    { action: 'MODIFY',    priority: 'P2' },
      tasks:     { action: 'ROLL',      priority: 'P0' }
    },
    'other': {
      proposal:  { action: 'MODIFY',    priority: 'P2' },
      specs:     { action: 'MODIFY',    priority: 'P2' },
      design:    { action: 'MODIFY',    priority: 'P2' },
      tasks:     { action: 'ROLL',      priority: 'P1' }
    }
  };

  const modificationOrder = orderMap[amendmentType];
  const typeMapping = actionPriorityMap[amendmentType];

  for (const artifactName of affectedArtifactNames) {
    const mapping = typeMapping[artifactName] || { action: 'MODIFY' as ArtifactAction, priority: 'P2' as ArtifactPriority };
    affectedArtifacts.push({
      artifact: artifactName,
      action: mapping.action,
      priority: mapping.priority,
      reason: userDescription
    });
  }

  return {
    affectedArtifacts,
    modificationOrder
  };
}

// -----------------------------------------------------------------------------
// Tasks Rolling Plan Builder
// -----------------------------------------------------------------------------

/**
 * Build tasks rolling plan based on amendment type, current tasks, and strategy.
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
        newDescription: task.description, // Placeholder — AI/user will fill in actual new description
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

  // Build new sequence: completed (non-conflicting) + restack + append + remaining pending (non-deprecated)
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

/**
 * Check if a completed task conflicts with the new approach.
 */
function isTaskConflicting(
  task: ParsedTask,
  amendmentType: AmendmentType,
  description: string
): boolean {
  // For design-issue: completed tasks based on the old design likely conflict
  if (amendmentType === 'design-issue') {
    // Keywords that suggest conflict
    const conflictKeywords = extractConflictKeywords(description);
    return conflictKeywords.some(kw =>
      task.description.toLowerCase().includes(kw.toLowerCase())
    );
  }

  // For scope-change: completed tasks in removed scope areas conflict
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
  // All amendment types except spec-error may need restacking for pending tasks
  if (amendmentType === 'spec-error') return false;

  // If the task description contains keywords related to the change
  const changeKeywords = extractConflictKeywords(description);
  return changeKeywords.some(kw =>
    task.description.toLowerCase().includes(kw.toLowerCase())
  );
}

/**
 * Extract conflict keywords from user description.
 * Simple heuristic — looks for technology/component names.
 */
function extractConflictKeywords(description: string): string[] {
  // Common patterns: "from X to Y", "replace X", "switch to Y"
  const fromToMatch = description.match(/from\s+(\w+)\s+to\s+(\w+)/i);
  if (fromToMatch) {
    return [fromToMatch[1]]; // The "from" part is what conflicts
  }

  const replaceMatch = description.match(/replace\s+(\w+)/i);
  if (replaceMatch) {
    return [replaceMatch[1]];
  }

  const switchMatch = description.match(/switch\s+(?:from\s+\w+\s+)?to\s+(\w+)/i);
  if (switchMatch) {
    return [];
  }

  // Fallback: split by common separators
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
      return 3; // Typically needs several new implementation tasks
    case 'missing-feature':
      return Math.max(2, Math.ceil(description.split(/[,;]/).length * 2)); // Each feature ~2 tasks
    case 'spec-error':
      return 1; // Usually just one correction task
    case 'scope-change':
      return 2; // Moderate new tasks
    case 'other':
      return 2; // Default estimate
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
      return taskIndex === 0 ? '2' : '2'; // Core implementation section
    case 'missing-feature':
      return taskIndex < 2 ? '2' : '3'; // Implementation then testing
    case 'spec-error':
      return '2'; // Fix implementation
    case 'scope-change':
      return taskIndex < 1 ? '1' : '2'; // Setup then implementation
    case 'other':
      return '2'; // Default to implementation
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
      // Deprecated tasks are NOT added to sequence
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

// -----------------------------------------------------------------------------
// Spec Changes Inference
// -----------------------------------------------------------------------------

/**
 * Infer what spec changes are needed based on amendment type and description.
 */
function inferSpecChanges(
  amendmentType: AmendmentType,
  userDescription: string,
  currentSpecs: Map<string, string>
): SpecChange[] {
  const changes: SpecChange[] = [];

  // For each existing spec, determine if it's affected
  for (const [specName, content] of currentSpecs) {
    const specAffected = isSpecAffected(specName, content, amendmentType, userDescription);
    if (specAffected) {
      switch (amendmentType) {
        case 'design-issue':
          changes.push({
            specName,
            operation: 'MODIFIED',
            requirement: 'Various requirements need updating',
            details: `Design change affects behavior: ${userDescription}`
          });
          break;
        case 'missing-feature':
          changes.push({
            specName,
            operation: 'ADDED',
            requirement: 'New requirement to be defined',
            details: `New functionality needed: ${userDescription}`
          });
          break;
        case 'spec-error':
          changes.push({
            specName,
            operation: 'MODIFIED',
            requirement: 'Requirement needs correction',
            details: userDescription
          });
          break;
        case 'scope-change':
          changes.push({
            specName,
            operation: 'MODIFIED',
            requirement: 'Requirements need scope adjustment',
            details: `Scope change: ${userDescription}`
          });
          break;
        case 'other':
          changes.push({
            specName,
            operation: 'MODIFIED',
            requirement: 'Various',
            details: userDescription
          });
          break;
      }
    }
  }

  return changes;
}

/**
 * Check if a spec is affected by the amendment.
 */
function isSpecAffected(
  specName: string,
  content: string,
  amendmentType: AmendmentType,
  description: string
): boolean {
  // Simple heuristic: check if spec name or content contains keywords from the description
  const keywords = description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const specLower = specName.toLowerCase();
  const contentLower = content.toLowerCase();

  return keywords.some(kw =>
    specLower.includes(kw) || contentLower.includes(kw)
  ) || amendmentType === 'scope-change'; // scope-change potentially affects all specs
}

// -----------------------------------------------------------------------------
// Analysis Summary Builder
// -----------------------------------------------------------------------------

/**
 * Build a concise summary of the modification analysis.
 */
function buildAnalysisSummary(
  modificationLogic: ModificationLogic,
  tasksRollingPlan: TasksRollingPlan,
  specChanges: SpecChange[]
): string {
  const parts: string[] = [];

  // Affected artifacts summary
  const artifactNames = modificationLogic.affectedArtifacts.map(a => `${a.artifact} (${a.action})`);
  parts.push(`Affected artifacts: ${artifactNames.join(', ')}`);

  // Rolling summary
  if (tasksRollingPlan.rollback.length > 0) {
    parts.push(`${tasksRollingPlan.rollback.length} tasks need rollback`);
  }
  if (tasksRollingPlan.restack.length > 0) {
    parts.push(`${tasksRollingPlan.restack.length} tasks need restack`);
  }
  if (tasksRollingPlan.append.length > 0) {
    parts.push(`${tasksRollingPlan.append.length} new tasks to append`);
  }
  if (tasksRollingPlan.deprecate.length > 0) {
    parts.push(`${tasksRollingPlan.deprecate.length} tasks to deprecate`);
  }

  // Spec changes summary
  if (specChanges.length > 0) {
    const ops = specChanges.map(s => s.operation);
    const added = ops.filter(o => o === 'ADDED').length;
    const modified = ops.filter(o => o === 'MODIFIED').length;
    const removed = ops.filter(o => o === 'REMOVED').length;
    parts.push(`Specs: ${added} added, ${modified} modified, ${removed} removed`);
  }

  return parts.join('. ');
}

// -----------------------------------------------------------------------------
// Artifact Loader
// -----------------------------------------------------------------------------

/**
 * Load all artifact contents from the change directory.
 */
async function loadArtifacts(changeDir: string): Promise<LoadedArtifacts> {
  return {
    proposal: await readArtifact(path.join(changeDir, 'proposal.md')),
    design: await readArtifact(path.join(changeDir, 'design.md')),
    tasks: await readArtifact(path.join(changeDir, 'tasks.md')),
    specs: await readSpecs(path.join(changeDir, 'specs'))
  };
}

/**
 * Read a single artifact file.
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