/**
 * Amendment Types
 *
 * Type definitions for the amend workflow system.
 */

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
 * Individual task item.
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
 * Changes to tasks.md.
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
    /** Changes to tasks.md */
    tasks?: TasksChange;
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
  /** Number of tasks preserved */
  tasksPreserved: number;
  /** Number of tasks added */
  tasksAdded: number;
  /** Number of tasks removed */
  tasksRemoved: number;
  /** Number of tasks modified */
  tasksModified: number;
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