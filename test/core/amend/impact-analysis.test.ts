/**
 * Impact Analysis Tests
 *
 * Tests for estimateEffort from src/core/amend/impact-analysis.ts
 */

import { describe, it, expect } from 'vitest';
import { estimateEffort } from '../../../src/core/amend/impact-analysis.js';
import type { AmendmentRecord } from '../../../src/core/amend/types.js';

describe('impact-analysis', () => {
  describe('estimateEffort', () => {
    it('should estimate low effort for minimal changes', () => {
      const changes: AmendmentRecord['changes'] = {
        proposal: {
          before: 'old',
          after: 'new',
          reason: 'test'
        }
      };

      const effort = estimateEffort(changes);

      expect(effort).toBe('30 minutes');
    });

    it('should estimate medium effort for spec changes', () => {
      const changes: AmendmentRecord['changes'] = {
        specs: [
          { specName: 'auth', operation: 'ADDED', requirement: 'Test' },
          { specName: 'auth', operation: 'MODIFIED', requirement: 'Test2' }
        ]
      };

      const effort = estimateEffort(changes);

      // Should be at least 1-2 hours for 4 points (2 specs * 2 points each)
      expect(['1-2 hours', 'Half day']).toContain(effort);
    });

    it('should estimate higher effort for design changes', () => {
      const changes: AmendmentRecord['changes'] = {
        design: {
          before: 'old',
          after: 'new',
          reason: 'test'
        },
        specs: [
          { specName: 'auth', operation: 'ADDED', requirement: 'Test' },
          { specName: 'auth', operation: 'ADDED', requirement: 'Test2' },
          { specName: 'auth', operation: 'ADDED', requirement: 'Test3' }
        ]
      };

      const effort = estimateEffort(changes);

      // Design change = 3 points, 3 specs = 6 points, total 9 = Half day
      expect(['Half day', '1-2 days']).toContain(effort);
    });

    it('should estimate higher effort for REMOVED specs', () => {
      const changes: AmendmentRecord['changes'] = {
        specs: [
          { specName: 'auth', operation: 'REMOVED', requirement: 'Test' },
          { specName: 'auth', operation: 'REMOVED', requirement: 'Test2' }
        ]
      };

      const effort = estimateEffort(changes);

      // 2 REMOVED specs = 4 base + 4 extra = 8 points = Half day
      expect(['Half day', '1-2 days']).toContain(effort);
    });

    it('should estimate highest effort for combined changes', () => {
      const changes: AmendmentRecord['changes'] = {
        proposal: { before: 'old', after: 'new', reason: 'test' },
        design: { before: 'old', after: 'new', reason: 'test' },
        specs: [
          { specName: 'auth', operation: 'ADDED', requirement: 'Test' },
          { specName: 'auth', operation: 'ADDED', requirement: 'Test2' },
          { specName: 'auth', operation: 'ADDED', requirement: 'Test3' },
          { specName: 'auth', operation: 'REMOVED', requirement: 'Test4' },
          { specName: 'auth', operation: 'REMOVED', requirement: 'Test5' }
        ],
        tasks: {
          preserved: [],
          added: [{ id: '1', description: 'New' }, { id: '2', description: 'New' }],
          removed: [],
          modified: []
        }
      };

      const effort = estimateEffort(changes);

      // Combined score should be high
      expect(['1-2 days', '3+ days']).toContain(effort);
    });
  });
});