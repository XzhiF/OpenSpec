/**
 * Modification Analyzer Tests
 *
 * Tests for analyzeModificationIntent and related functions from
 * src/core/amend/modification-analyzer.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { analyzeModificationIntent } from '../../../src/core/amend/modification-analyzer.js';
import type { TaskProgress, AmendmentType } from '../../../src/core/amend/types.js';

// Helper to create temp change directory with artifacts
async function createTempChangeDir(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-amend-test-'));

  // Create proposal.md
  await fs.writeFile(path.join(tmpDir, 'proposal.md'), `# Proposal: Add Real-Time Notifications\n\n## What Changes\n- WebSocket-based real-time push\n`);

  // Create design.md
  await fs.writeFile(path.join(tmpDir, 'design.md'), `# Design\n\n## Technical Approach\nUsing Socket.io with Redis adapter\n`);

  // Create tasks.md
  await fs.writeFile(path.join(tmpDir, 'tasks.md'), `# Tasks\n\n## 1. Setup\n\n- [x] 1.1 Create notifications module\n- [x] 1.2 Add Socket.io dependencies\n- [ ] 1.3 Configure Redis adapter\n- [ ] 2.1 Implement WebSocket handler\n- [ ] 2.2 Add notification creation\n`);

  // Create specs directory
  const specsDir = path.join(tmpDir, 'specs', 'notifications');
  await fs.mkdir(specsDir, { recursive: true });
  await fs.writeFile(path.join(specsDir, 'spec.md'), `## ADDED Requirements\n\n### Requirement: WebSocket Connection\nThe system SHALL use WebSocket for real-time push.\n`);

  return tmpDir;
}

async function cleanupDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

describe('ModificationAnalyzer', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempChangeDir();
  });

  afterEach(async () => {
    await cleanupDir(tmpDir);
  });

  describe('analyzeModificationIntent', () => {
    it('should analyze design-issue amendment', async () => {
      const progress: TaskProgress = {
        total: 5,
        completed: 2,
        completedIds: ['1.1', '1.2'],
        inProgressId: '1.3',
        pendingIds: ['1.3', '2.1', '2.2']
      };

      const result = await analyzeModificationIntent(
        tmpDir,
        'design-issue',
        'Switch from WebSocket to SSE',
        progress
      );

      // Should have modification logic
      expect(result.modificationLogic).toBeDefined();
      expect(result.modificationLogic.affectedArtifacts.length).toBeGreaterThan(0);
      expect(result.modificationLogic.modificationOrder).toContain('design');
      expect(result.modificationLogic.modificationOrder).toContain('tasks');

      // Should have tasks rolling plan
      expect(result.tasksRollingPlan).toBeDefined();

      // Should have spec changes
      expect(result.specChanges).toBeDefined();

      // Should have summary
      expect(result.analysisSummary).toBeDefined();
      expect(result.analysisSummary.length).toBeGreaterThan(0);
    });

    it('should analyze missing-feature amendment', async () => {
      const progress: TaskProgress = {
        total: 5,
        completed: 2,
        completedIds: ['1.1', '1.2'],
        inProgressId: null,
        pendingIds: ['1.3', '2.1', '2.2']
      };

      const result = await analyzeModificationIntent(
        tmpDir,
        'missing-feature',
        'Add password change functionality',
        progress
      );

      // Missing-feature should have mostly append tasks
      expect(result.tasksRollingPlan.rollback.length).toBe(0);
      expect(result.tasksRollingPlan.append.length).toBeGreaterThan(0);

      // Modification order should start with proposal
      expect(result.modificationLogic.modificationOrder[0]).toBe('proposal');
    });

    it('should analyze spec-error amendment', async () => {
      const progress: TaskProgress = {
        total: 5,
        completed: 2,
        completedIds: ['1.1', '1.2'],
        inProgressId: null,
        pendingIds: ['1.3', '2.1', '2.2']
      };

      const result = await analyzeModificationIntent(
        tmpDir,
        'spec-error',
        'Token expiration should be 15 minutes',
        progress
      );

      // Spec-error should have minimal rolling
      expect(result.tasksRollingPlan.rollback.length).toBe(0);

      // Modification order should start with specs
      expect(result.modificationLogic.modificationOrder[0]).toBe('specs');
    });

    it('should analyze scope-change amendment', async () => {
      const progress: TaskProgress = {
        total: 5,
        completed: 2,
        completedIds: ['1.1', '1.2'],
        inProgressId: null,
        pendingIds: ['1.3', '2.1', '2.2']
      };

      const result = await analyzeModificationIntent(
        tmpDir,
        'scope-change',
        'Expand scope to include notification persistence',
        progress
      );

      // Scope-change should have moderate rolling
      expect(result.modificationLogic.affectedArtifacts).toContainEqual(
        expect.objectContaining({ artifact: 'proposal' })
      );
      expect(result.modificationLogic.affectedArtifacts).toContainEqual(
        expect.objectContaining({ artifact: 'tasks' })
      );
    });

    it('should handle empty change directory gracefully', async () => {
      const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-empty-'));

      const progress: TaskProgress = {
        total: 0,
        completed: 0,
        completedIds: [],
        inProgressId: null,
        pendingIds: []
      };

      const result = await analyzeModificationIntent(
        emptyDir,
        'other',
        'General change',
        progress
      );

      expect(result.modificationLogic).toBeDefined();
      expect(result.tasksRollingPlan).toBeDefined();
      expect(result.tasksRollingPlan.rollback.length).toBe(0);

      await cleanupDir(emptyDir);
    });

    it('should detect conflicts with keyword matching in task descriptions', async () => {
      const progress: TaskProgress = {
        total: 5,
        completed: 2,
        completedIds: ['1.1', '1.2'],
        inProgressId: '1.3',
        pendingIds: ['1.3', '2.1']
      };

      // Use a description that has "from X to Y" pattern where X is a simple word
      const result = await analyzeModificationIntent(
        tmpDir,
        'design-issue',
        'from Redis to Memory cache',
        progress
      );

      // "Redis" keyword extracted from "from Redis to Memory"
      // None of the tasks mention "Redis" directly, so no rollback expected
      expect(result.tasksRollingPlan.rollback.length).toBe(0);

      // Now test with a description containing keywords that DO match task descriptions
      const result2 = await analyzeModificationIntent(
        tmpDir,
        'design-issue',
        'replace WebSocket with SSE',
        progress
      );

      // "WebSocket" keyword from "replace WebSocket" pattern
      // Task 2.1 "Implement WebSocket handler" (pending) should be affected
      // But since it's a completed task check, 1.1 and 1.2 don't contain "WebSocket"
      expect(result2.tasksRollingPlan.rollback.length).toBe(0);

      // Check that restack/deprecation captures pending tasks with matching keywords
      const hasRestackOrDeprecate = result2.tasksRollingPlan.restack.length > 0 || result2.tasksRollingPlan.deprecate.length > 0;
      expect(hasRestackOrDeprecate).toBe(true);
    });
  });
});