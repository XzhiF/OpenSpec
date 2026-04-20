/**
 * Amendment Types
 *
 * Type definitions for the amend workflow system.
 * Redesigned to support: Analysis → Draft → Confirm → Apply pattern
 * with Tasks Rolling mechanism (Rollback/Restack/Append/Deprecate).
 */

// -----------------------------------------------------------------------------
// Amendment Status
// -----------------------------------------------------------------------------

/**
 * Lifecycle status of an amendment.
 * DRAFT: Amendment plan generated, awaiting user confirmation
 * CONFIRMED: User confirmed the plan, ready to be applied
 * APPLIED: Amendment changes have been applied to artifacts
 */
export type AmendmentStatus = 'DRAFT' | 'CONFIRMED' | 'APPLIED';

// -----------------------------------------------------------------------------
// Amendment Type
// -----------------------------------------------------------------------------

/**
 * Types of amendments that can be made during implementation.
 */
export type AmendmentType =
  | 'design-issue'      // Implementation revealed flaw in technical approach
  | 'missing-feature'   // Forgot to include functionality
  | 'spec-error'        // Spec doesn't match expected behavior
  | 'scope-change'      // Need to expand/narrow scope
  | 'other';            // Other reasons

// -----------------------------------------------------------------------------
// Amendment Type Options (for UI)
// -----------------------------------------------------------------------------

/**
 * Option for amendment type selection.
 */
export interface AmendmentTypeOption {
  name: string;
  value: AmendmentType;
  description: string;
}

// -----------------------------------------------------------------------------
// Modification Logic
// -----------------------------------------------------------------------------

/**
 * Action to take on an affected artifact.
 */
export type ArtifactAction = 'MODIFY' | 'ADD_REQ' | 'REMOVE_REQ' | 'ROLL';

/**
 * Priority level for artifact modification.
 */
export type ArtifactPriority = 'P0' | 'P1' | 'P2';

/**
 * A single artifact that needs modification.
 */
export interface ArtifactModification {
  /** Artifact identifier (e.g., 'proposal', 'design', 'specs/auth', 'tasks') */
  artifact: string;
  /** Action to take */
  action: ArtifactAction;
  /** Priority level */
  priority: ArtifactPriority;
  /** Why this artifact needs modification */
  reason: string;
}

/**
 * Overall modification logic for the amendment.
 */
export interface ModificationLogic {
  /** List of affected artifacts with their actions */
  affectedArtifacts: ArtifactModification[];
  /** Order in which modifications should be executed */
  modificationOrder: string[];
}

// -----------------------------------------------------------------------------
// Tasks Rolling Plan
// -----------------------------------------------------------------------------

/**
 * A completed task that needs to be rolled back.
 */
export interface RollbackTask {
  /** Task ID (e.g., '1.2') */
  id: string;
  /** Task description */
  description: string;
  /** What rollback action to take */
  rollbackAction: string;
  /** Code/files that need to be removed or modified */
  rollbackCode: string;
}

/**
 * A pending task that needs to be restacked (reordered/modified).
 */
export interface RestackTask {
  /** Task ID */
  id: string;
  /** Original task description */
  originalDescription: string;
  /** New task description */
  newDescription: string;
  /** Why this task needs restacking */
  reason: string;
}

/**
 * A new task to append to the task list.
 */
export interface AppendTask {
  /** Task ID (new numbering) */
  id: string;
  /** Task description */
  description: string;
  /** Section to place this task in */
  section: string;
  /** Insert after this task ID */
  afterTask: string;
}

/**
 * A task that should be deprecated (no longer needed).
 */
export interface DeprecateTask {
  /** Task ID */
  id: string;
  /** Task description */
  description: string;
  /** Why this task is deprecated */
  reason: string;
}

/**
 * Status marker for a task in the rolled sequence.
 */
export type TaskSequenceStatus = 'pending' | 'completed' | 'rollback' | 'restack' | 'append';

/**
 * A single task item in the rolled sequence.
 */
export interface TaskSequenceItem {
  /** Task ID */
  id: string;
  /** Task description */
  description: string;
  /** Status marker */
  status: TaskSequenceStatus;
  /** Section heading */
  section: string;
}

/**
 * Complete rolling plan for tasks.md changes.
 */
export interface TasksRollingPlan {
  /** Completed tasks that need rollback */
  rollback: RollbackTask[];
  /** Pending tasks that need restacking */
  restack: RestackTask[];
  /** New tasks to append */
  append: AppendTask[];
  /** Tasks no longer needed */
  deprecate: DeprecateTask[];
  /** Complete task sequence after rolling */
  newSequence: TaskSequenceItem[];
}

// -----------------------------------------------------------------------------
// Confirmation Checklist
// -----------------------------------------------------------------------------

/**
 * Checklist items for user to confirm before applying amendment.
 */
export interface ConfirmationChecklist {
  /** Modification logic is correct */
  modificationLogicCorrect: boolean;
  /** Change drafts are complete and accurate */
  changeDraftsComplete: boolean;
  /** Tasks rolling plan is feasible */
  tasksRollingFeasible: boolean;
  /** Impact analysis is acceptable */
  impactAcceptable: boolean;
  /** Ready to apply this amendment */
  readyToApply: boolean;
}

// -----------------------------------------------------------------------------
// Amendment State
// -----------------------------------------------------------------------------

/**
 * Runtime state for an in-progress amendment.
 * Saved to .amendment-state.json in the change directory.
 */
export interface AmendmentState {
  /** Name of the change being amended */
  changeName: string;
  /** ISO timestamp when amendment started */
  timestamp: string;
  /** Type of amendment being performed */
  amendmentType: AmendmentType;
  /** Lifecycle status */
  status: AmendmentStatus;
  /** Task progress at the time of amendment */
  progress: {
    /** IDs of completed tasks */
    completed: string[];
    /** ID of task that was in progress (if any) */
    inProgress: string | null;
    /** IDs of pending tasks */
    pending: string[];
  };
  /** Artifacts that need to be amended */
  artifactsToAmend: string[];
  /** Whether the amendment was initiated by user action */
  pausedByUser: boolean;
}

// -----------------------------------------------------------------------------
// Artifact Changes
// -----------------------------------------------------------------------------

/**
 * Change record for a single artifact file.
 */
export interface ArtifactChange {
  /** Content before the amendment */
  before: string;
  /** Content after the amendment */
  after: string;
  /** Reason for the change */
  reason: string;
}

/**
 * Change record for a spec file.
 */
export interface SpecChange {
  /** Name of the spec (e.g., 'auth', 'notifications') */
  specName: string;
  /** Operation type */
  operation: 'ADDED' | 'MODIFIED' | 'REMOVED';
  /** Requirement name affected */
  requirement: string;
  /** Additional details about the change */
  details?: string;
}

/**
 * Individual task item (legacy, kept for backward compat).
 */
export interface TaskItem {
  /** Task ID (e.g., '1.1', '2.3') */
  id: string;
  /** Task description */
  description: string;
  /** Optional reason for the change */
  reason?: string;
}

/**
 * Changes to tasks.md (legacy, kept for backward compat).
 * Superseded by TasksRollingPlan in the new flow.
 */
export interface TasksChange {
  /** Tasks that remain valid and completed */
  preserved: TaskItem[];
  /** New tasks to add */
  added: TaskItem[];
  /** Tasks no longer needed (will be commented) */
  removed: TaskItem[];
  /** Tasks that need modification */
  modified: TaskItem[];
}

// -----------------------------------------------------------------------------
// Impact Analysis
// -----------------------------------------------------------------------------

/**
 * Code impact analysis results.
 */
export interface CodeImpact {
  /** Files that will be affected by the changes */
  affectedFiles: string[];
  /** Estimated effort to implement changes */
  estimatedEffort: string;
  /** Whether the change maintains backward compatibility */
  backwardCompatible: boolean;
}

/**
 * Dependency impact analysis results.
 */
export interface DependencyImpact {
  /** Dependencies to remove */
  remove: string[];
  /** Dependencies to add */
  add: string[];
}

// -----------------------------------------------------------------------------
// Amendment Record
// -----------------------------------------------------------------------------

/**
 * Complete record of an amendment.
 * Used to generate amendment.md.
 */
export interface AmendmentRecord {
  /** Metadata about the amendment */
  metadata: {
    /** Name of the change */
    changeName: string;
    /** ISO timestamp when amendment was created */
    created: string;
    /** Type of amendment */
    amendmentType?: AmendmentType;
    /** Human-readable reason for the amendment */
    reason: string;
    /** What triggered the amendment (e.g., 'Task 2.3 implementation') */
    triggeredBy: string;
    /** Lifecycle status */
    status: AmendmentStatus;
  };
  /** Brief summary of the amendment */
  summary: string;
  /** Changes to each artifact type */
  changes: {
    /** Changes to proposal.md */
    proposal?: ArtifactChange;
    /** Changes to spec files */
    specs?: SpecChange[];
    /** Changes to design.md */
    design?: ArtifactChange;
    /** Rolling plan for tasks.md (new) */
    tasksRolling?: TasksRollingPlan;
    /** Legacy tasks change (backward compat) */
    tasks?: TasksChange;
    /** Modification logic (new) */
    modificationLogic?: ModificationLogic;
  };
  /** Impact analysis results */
  impactAnalysis: {
    codeImpact: CodeImpact;
    dependencyImpact: DependencyImpact;
  };
  /** Plan for rolling back if issues arise */
  rollbackPlan: string;
  /** Steps to take after amendment */
  nextSteps: string[];
  /** Confirmation checklist (new) */
  confirmationChecklist: ConfirmationChecklist;
}

// -----------------------------------------------------------------------------
// Parsed Tasks
// -----------------------------------------------------------------------------

/**
 * A parsed task from tasks.md.
 */
export interface ParsedTask {
  /** Task ID (e.g., '1.1', '2.3') */
  id: string;
  /** Task description */
  description: string;
  /** Whether the task is completed */
  completed: boolean;
  /** Section heading the task belongs to */
  section: string;
  /** Line number in the original file */
  line: number;
  /** Indentation level */
  indent: number;
}

// -----------------------------------------------------------------------------
// Amendment Options
// -----------------------------------------------------------------------------

/**
 * Options for the amend command.
 */
export interface AmendOptions {
  /** Type of amendment (auto-detected if not provided) */
  type?: AmendmentType;
  /** Specific artifacts to amend (defaults to all relevant) */
  artifacts?: string[];
  /** Skip confirmation prompts */
  quick?: boolean;
  /** Non-interactive mode */
  noInteractive?: boolean;
  /** User's modification description (for non-interactive mode) */
  description?: string;
  /** Auto-confirm the amendment (skip manual confirmation) */
  autoConfirm?: boolean;
}

// -----------------------------------------------------------------------------
// Amendment Result
// -----------------------------------------------------------------------------

/**
 * Result of an amendment operation.
 */
export interface AmendmentResult {
  /** Whether the amendment was successful */
  success: boolean;
  /** Version number of this amendment */
  version?: number;
  /** Path to the backup directory */
  backupDir?: string;
  /** Path to the generated amendment.md */
  amendmentPath?: string;
  /** Error message if failed */
  error?: string;
  /** Lifecycle status of the amendment */
  status?: AmendmentStatus;
  /** Number of tasks preserved (legacy) */
  tasksPreserved: number;
  /** Number of rollback tasks */
  tasksRollback: number;
  /** Number of restacked tasks */
  tasksRestack: number;
  /** Number of appended tasks */
  tasksAppend: number;
  /** Number of deprecated tasks */
  tasksDeprecate: number;
}

// -----------------------------------------------------------------------------
// Task Progress
// -----------------------------------------------------------------------------

/**
 * Progress snapshot at time of amendment.
 */
export interface TaskProgress {
  /** Total number of tasks */
  total: number;
  /** Number of completed tasks */
  completed: number;
  /** IDs of completed tasks */
  completedIds: string[];
  /** ID of task currently in progress */
  inProgressId: string | null;
  /** IDs of pending tasks */
  pendingIds: string[];
}

// -----------------------------------------------------------------------------
// Type Guards & Helpers
// -----------------------------------------------------------------------------

/**
 * Check if a value is a valid AmendmentType.
 */
export function isAmendmentType(value: string): value is AmendmentType {
  return ['design-issue', 'missing-feature', 'spec-error', 'scope-change', 'other'].includes(value);
}

/**
 * Get the list of artifacts that should be amended for a given type.
 */
export function getArtifactsForType(type: AmendmentType): string[] {
  const typeToArtifacts: Record<AmendmentType, string[]> = {
    'design-issue': ['design', 'specs', 'proposal', 'tasks'],
    'missing-feature': ['proposal', 'specs', 'tasks'],
    'spec-error': ['specs', 'tasks'],
    'scope-change': ['proposal', 'specs', 'design', 'tasks'],
    'other': ['proposal', 'specs', 'design', 'tasks']
  };
  return typeToArtifacts[type];
}

/**
 * Get human-readable description for an amendment type.
 */
export function getAmendmentTypeDescription(type: AmendmentType): string {
  const descriptions: Record<AmendmentType, string> = {
    'design-issue': 'Implementation revealed design flaw',
    'missing-feature': 'Forgot to include functionality',
    'spec-error': 'Spec doesn\'t match expected behavior',
    'scope-change': 'Need to expand/narrow scope',
    'other': 'Other reason'
  };
  return descriptions[type];
}

/**
 * Get rolling strategy weight for a given amendment type.
 * Higher weight = more aggressive rolling.
 */
export function getRollingStrategyWeight(type: AmendmentType): {
  rollbackWeight: number;
  restackWeight: number;
  appendWeight: number;
  deprecateWeight: number;
} {
  const strategies: Record<AmendmentType, {
    rollbackWeight: number;
    restackWeight: number;
    appendWeight: number;
    deprecateWeight: number;
  }> = {
    'design-issue':   { rollbackWeight: 3, restackWeight: 3, appendWeight: 1, deprecateWeight: 2 },
    'missing-feature': { rollbackWeight: 0, restackWeight: 0, appendWeight: 3, deprecateWeight: 0 },
    'spec-error':     { rollbackWeight: 0, restackWeight: 1, appendWeight: 1, deprecateWeight: 0 },
    'scope-change':   { rollbackWeight: 1, restackWeight: 2, appendWeight: 2, deprecateWeight: 2 },
    'other':          { rollbackWeight: 1, restackWeight: 1, appendWeight: 1, deprecateWeight: 1 }
  };
  return strategies[type];
}