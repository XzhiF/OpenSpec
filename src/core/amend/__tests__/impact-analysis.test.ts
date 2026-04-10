/**
 * Impact Analysis Tests
 */

import { describe, it, expect } from 'vitest';
import { estimateEffort } from '../impact-analysis.js';
import type { AmendmentRecord } from '../types.js';

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
  });
});