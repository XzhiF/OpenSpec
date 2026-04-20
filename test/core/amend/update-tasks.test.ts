/**
 * Update Tasks Tests
 *
 * Tests for parseTasks, serializeTasks, calculateProgress, findNextTaskId
 */

import { describe, it, expect } from 'vitest';
import { parseTasks, serializeTasks, calculateProgress, findNextTaskId } from '../../../src/core/amend/update-tasks.js';
import type { ParsedTask, TaskItem } from '../../../src/core/amend/types.js';

describe('update-tasks', () => {
  describe('parseTasks', () => {
    it('should parse basic tasks', () => {
      const content = `# Tasks

## Section 1

- [ ] 1.1 First task
- [x] 1.2 Second task (completed)
- [ ] 1.3 Third task
`;

      const tasks = parseTasks(content);

      expect(tasks).toHaveLength(3);
      expect(tasks[0].id).toBe('1.1');
      expect(tasks[0].description).toBe('First task');
      expect(tasks[0].completed).toBe(false);
      expect(tasks[1].id).toBe('1.2');
      expect(tasks[1].completed).toBe(true);
    });

    it('should handle empty content', () => {
      const tasks = parseTasks('');
      expect(tasks).toHaveLength(0);
    });

    it('should preserve section names', () => {
      const content = `# Tasks

## Setup

- [ ] 1.1 Task one

## Implementation

- [ ] 2.1 Task two
`;

      const tasks = parseTasks(content);

      expect(tasks[0].section).toBe('Setup');
      expect(tasks[1].section).toBe('Implementation');
    });
  });

  describe('serializeTasks', () => {
    it('should serialize tasks to markdown', () => {
      const tasks: ParsedTask[] = [
        {
          id: '1.1',
          description: 'First task',
          completed: false,
          section: 'Section 1',
          line: 0,
          indent: 0
        },
        {
          id: '1.2',
          description: 'Second task',
          completed: true,
          section: 'Section 1',
          line: 1,
          indent: 0
        }
      ];

      const result = serializeTasks(tasks);

      expect(result).toContain('- [ ] 1.1 First task');
      expect(result).toContain('- [x] 1.2 Second task');
    });

    it('should include amendment comment', () => {
      const tasks: ParsedTask[] = [];
      const result = serializeTasks(tasks, { amendmentComment: 'Test amendment' });

      expect(result).toContain('<!-- Amendment: Test amendment -->');
    });

    it('should include added tasks alongside existing tasks', () => {
      const tasks: ParsedTask[] = [
        { id: '2.1', description: 'Existing task', completed: false, section: 'Implementation', line: 0, indent: 0 }
      ];
      const added: TaskItem[] = [
        { id: '2.2', description: 'New task' }
      ];

      const result = serializeTasks(tasks, { added });

      expect(result).toContain('- [ ] 2.1 Existing task');
      expect(result).toContain('- [ ] 2.2 New task');
    });

    it('should include removed tasks as comments', () => {
      const tasks: ParsedTask[] = [];
      const removed: TaskItem[] = [
        { id: '1.1', description: 'Old task', reason: 'No longer needed' }
      ];

      const result = serializeTasks(tasks, { removed });

      expect(result).toContain('<!-- - [ ] 1.1 Old task -->');
      expect(result).toContain('Reason: No longer needed');
    });
  });

  describe('calculateProgress', () => {
    it('should calculate correct progress', () => {
      const tasks: ParsedTask[] = [
        { id: '1.1', description: 'Task 1', completed: true, section: '', line: 0, indent: 0 },
        { id: '1.2', description: 'Task 2', completed: true, section: '', line: 1, indent: 0 },
        { id: '1.3', description: 'Task 3', completed: false, section: '', line: 2, indent: 0 },
        { id: '1.4', description: 'Task 4', completed: false, section: '', line: 3, indent: 0 }
      ];

      const progress = calculateProgress(tasks);

      expect(progress.total).toBe(4);
      expect(progress.completed).toBe(2);
      expect(progress.pending).toBe(2);
      expect(progress.percentage).toBe(50);
    });

    it('should handle empty tasks', () => {
      const progress = calculateProgress([]);

      expect(progress.total).toBe(0);
      expect(progress.completed).toBe(0);
      expect(progress.pending).toBe(0);
      expect(progress.percentage).toBe(0);
    });

    it('should handle all completed', () => {
      const tasks: ParsedTask[] = [
        { id: '1.1', description: 'Task', completed: true, section: '', line: 0, indent: 0 }
      ];

      const progress = calculateProgress(tasks);

      expect(progress.percentage).toBe(100);
    });
  });

  describe('findNextTaskId', () => {
    it('should find next available ID in section', () => {
      const tasks: ParsedTask[] = [
        { id: '1.1', description: 'Task', completed: false, section: '1. Setup', line: 0, indent: 0 },
        { id: '1.2', description: 'Task', completed: false, section: '1. Setup', line: 1, indent: 0 }
      ];

      const nextId = findNextTaskId(tasks, '1. Setup');

      expect(nextId).toBe('1.3');
    });

    it('should start at 1.1 for empty section', () => {
      const nextId = findNextTaskId([], '1. Setup');

      expect(nextId).toBe('1.1');
    });
  });
});