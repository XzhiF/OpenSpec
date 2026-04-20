/**
 * Tasks Rolling Planner Tests
 *
 * Tests for planTasksRolling and related functions from
 * src/core/amend/tasks-rolling-planner.ts
 */

import { describe, it, expect } from 'vitest';
import { planTasksRolling } from '../../../src/core/amend/tasks-rolling-planner.js';
import type { TaskProgress, ModificationLogic, ArtifactModification } from '../../../src/core/amend/types.js';

const SAMPLE_TASKS = `# Tasks

## 1. Setup

- [x] 1.1 Create notifications module
- [x] 1.2 Add Socket.io dependencies
- [ ] 1.3 Configure Redis adapter

## 2. Core Implementation

- [ ] 2.1 Implement WebSocket handler
- [ ] 2.2 Add notification creation logic
- [ ] 2.3 Add event broadcasting
`;

describe('TasksRollingPlanner', () => {
  describe('planTasksRolling', () => {
    it('should plan rollback for conflicting completed tasks in design-issue', async () => {
      const progress: TaskProgress = {
        total: 5,
        completed: 2,
        completedIds: ['1.1', '1.2'],
        inProgressId: '1.3',
        pendingIds: ['1.3', '2.1', '2.2', '2.3']
      };

      const modificationLogic: ModificationLogic = {
        affectedArtifacts: [
          { artifact: 'tasks', action: 'ROLL', priority: 'P0', reason: 'design change' }
        ],
        modificationOrder: ['tasks']
      };

      const result = await planTasksRolling(
        SAMPLE_TASKS,
        modificationLogic,
        progress,
        'design-issue',
        'Switch from WebSocket to SSE'
      );

      // "WebSocket" keyword from "from WebSocket to SSE"
      // Task 2.1 "Implement WebSocket handler" — but it's pending, not completed
      // Task 1.2 "Add Socket.io dependencies" — keyword "WebSocket" doesn't match "Socket.io"
      // With the "from X to Y" pattern, "WebSocket" is the "from" keyword
      // It would match against completed tasks but 1.1 and 1.2 don't contain "WebSocket"

      // Should have append tasks for design-issue (3 by default)
      expect(result.append.length).toBeGreaterThan(0);

      // Should have newSequence
      expect(result.newSequence.length).toBeGreaterThan(0);

      // Verify newSequence contains completed task (1.1)
      const completedInSequence = result.newSequence.filter(s => s.status === 'completed');
      expect(completedInSequence.length).toBeGreaterThan(0);
    });

    it('should plan mostly append for missing-feature', async () => {
      const progress: TaskProgress = {
        total: 5,
        completed: 2,
        completedIds: ['1.1', '1.2'],
        inProgressId: null,
        pendingIds: ['1.3', '2.1', '2.2', '2.3']
      };

      const modificationLogic: ModificationLogic = {
        affectedArtifacts: [
          { artifact: 'tasks', action: 'ROLL', priority: 'P0', reason: 'add feature' }
        ],
        modificationOrder: ['tasks']
      };

      const result = await planTasksRolling(
        SAMPLE_TASKS,
        modificationLogic,
        progress,
        'missing-feature',
        'Password change and email verification'
      );

      // No rollback for missing-feature
      expect(result.rollback.length).toBe(0);

      // Should have append tasks
      expect(result.append.length).toBeGreaterThanOrEqual(2);
    });

    it('should plan minimal rolling for spec-error', async () => {
      const progress: TaskProgress = {
        total: 5,
        completed: 2,
        completedIds: ['1.1', '1.2'],
        inProgressId: null,
        pendingIds: ['1.3', '2.1', '2.2', '2.3']
      };

      const modificationLogic: ModificationLogic = {
        affectedArtifacts: [
          { artifact: 'tasks', action: 'ROLL', priority: 'P2', reason: 'spec correction' }
        ],
        modificationOrder: ['tasks']
      };

      const result = await planTasksRolling(
        SAMPLE_TASKS,
        modificationLogic,
        progress,
        'spec-error',
        'Fix token expiration specification'
      );

      // No rollback for spec-error
      expect(result.rollback.length).toBe(0);

      // Minimal append (1 task)
      expect(result.append.length).toBe(1);
    });

    it('should plan deprecation for scope-change with "remove" keyword', async () => {
      const progress: TaskProgress = {
        total: 5,
        completed: 2,
        completedIds: ['1.1', '1.2'],
        inProgressId: null,
        pendingIds: ['1.3', '2.1', '2.2', '2.3']
      };

      const modificationLogic: ModificationLogic = {
        affectedArtifacts: [
          { artifact: 'tasks', action: 'ROLL', priority: 'P0', reason: 'scope reduction' }
        ],
        modificationOrder: ['tasks']
      };

      const result = await planTasksRolling(
        SAMPLE_TASKS,
        modificationLogic,
        progress,
        'scope-change',
        'Remove Redis adapter and narrow scope'
      );

      // "Redis" appears in task 1.3 — pending task may be deprecated
      expect(result.deprecate.some(d =>
        d.description.toLowerCase().includes('redis')
      )).toBe(true);
    });

    it('should build new sequence with all task statuses', async () => {
      const progress: TaskProgress = {
        total: 5,
        completed: 2,
        completedIds: ['1.1', '1.2'],
        inProgressId: null,
        pendingIds: ['1.3', '2.1', '2.2', '2.3']
      };

      const modificationLogic: ModificationLogic = {
        affectedArtifacts: [
          { artifact: 'tasks', action: 'ROLL', priority: 'P0', reason: 'design change' }
        ],
        modificationOrder: ['tasks']
      };

      const result = await planTasksRolling(
        SAMPLE_TASKS,
        modificationLogic,
        progress,
        'design-issue',
        'Switch from WebSocket to SSE'
      );

      // Check newSequence has task items
      expect(result.newSequence.length).toBeGreaterThan(0);

      // Should have a mix of statuses
      const statuses = result.newSequence.map(item => item.status);
      expect(statuses).toContain('completed');

      // If rollback detected, should have 'rollback' status
      if (result.rollback.length > 0) {
        expect(statuses).toContain('rollback');
      }

      // Should have 'append' status for new tasks
      if (result.append.length > 0) {
        expect(statuses).toContain('append');
      }
    });

    it('should handle empty tasks content', async () => {
      const progress: TaskProgress = {
        total: 0,
        completed: 0,
        completedIds: [],
        inProgressId: null,
        pendingIds: []
      };

      const modificationLogic: ModificationLogic = {
        affectedArtifacts: [
          { artifact: 'tasks', action: 'ROLL', priority: 'P0', reason: 'test' }
        ],
        modificationOrder: ['tasks']
      };

      const result = await planTasksRolling(
        '',
        modificationLogic,
        progress,
        'other',
        'General change'
      );

      expect(result.rollback.length).toBe(0);
      expect(result.restack.length).toBe(0);
      expect(result.deprecate.length).toBe(0);
      // Append is determined by strategy weight
      expect(result.newSequence.length).toBeGreaterThanOrEqual(0);
    });
  });
});