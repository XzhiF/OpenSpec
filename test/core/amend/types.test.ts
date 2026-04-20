/**
 * Amendment Types Tests
 *
 * Tests for type guards and helpers from src/core/amend/types.ts
 */

import { describe, it, expect } from 'vitest';
import {
  isAmendmentType,
  getArtifactsForType,
  getAmendmentTypeDescription,
  getRollingStrategyWeight,
  type AmendmentType
} from '../../../src/core/amend/types.js';

describe('Amendment Types', () => {
  describe('isAmendmentType', () => {
    it('should return true for valid amendment types', () => {
      expect(isAmendmentType('design-issue')).toBe(true);
      expect(isAmendmentType('missing-feature')).toBe(true);
      expect(isAmendmentType('spec-error')).toBe(true);
      expect(isAmendmentType('scope-change')).toBe(true);
      expect(isAmendmentType('other')).toBe(true);
    });

    it('should return false for invalid amendment types', () => {
      expect(isAmendmentType('invalid')).toBe(false);
      expect(isAmendmentType('')).toBe(false);
      expect(isAmendmentType('DESIGN-ISSUE')).toBe(false);
    });
  });

  describe('getArtifactsForType', () => {
    it('should return correct artifacts for design-issue', () => {
      const artifacts = getArtifactsForType('design-issue');
      expect(artifacts).toContain('design');
      expect(artifacts).toContain('specs');
      expect(artifacts).toContain('proposal');
      expect(artifacts).toContain('tasks');
    });

    it('should return correct artifacts for missing-feature', () => {
      const artifacts = getArtifactsForType('missing-feature');
      expect(artifacts).toContain('proposal');
      expect(artifacts).toContain('specs');
      expect(artifacts).toContain('tasks');
      expect(artifacts).not.toContain('design');
    });

    it('should return correct artifacts for spec-error', () => {
      const artifacts = getArtifactsForType('spec-error');
      expect(artifacts).toContain('specs');
      expect(artifacts).toContain('tasks');
      expect(artifacts).not.toContain('proposal');
      expect(artifacts).not.toContain('design');
    });

    it('should return correct artifacts for scope-change', () => {
      const artifacts = getArtifactsForType('scope-change');
      expect(artifacts).toContain('proposal');
      expect(artifacts).toContain('specs');
      expect(artifacts).toContain('design');
      expect(artifacts).toContain('tasks');
    });

    it('should return all artifacts for other', () => {
      const artifacts = getArtifactsForType('other');
      expect(artifacts).toEqual(['proposal', 'specs', 'design', 'tasks']);
    });
  });

  describe('getAmendmentTypeDescription', () => {
    it('should return human-readable descriptions', () => {
      expect(getAmendmentTypeDescription('design-issue')).toBe('Implementation revealed design flaw');
      expect(getAmendmentTypeDescription('missing-feature')).toBe('Forgot to include functionality');
      expect(getAmendmentTypeDescription('spec-error')).toBe("Spec doesn't match expected behavior");
      expect(getAmendmentTypeDescription('scope-change')).toBe('Need to expand/narrow scope');
      expect(getAmendmentTypeDescription('other')).toBe('Other reason');
    });
  });

  describe('getRollingStrategyWeight', () => {
    it('should return heavy rolling for design-issue', () => {
      const strategy = getRollingStrategyWeight('design-issue');
      expect(strategy.rollbackWeight).toBe(3);
      expect(strategy.restackWeight).toBe(3);
      expect(strategy.appendWeight).toBe(1);
      expect(strategy.deprecateWeight).toBe(2);
    });

    it('should return light rolling for missing-feature (mostly append)', () => {
      const strategy = getRollingStrategyWeight('missing-feature');
      expect(strategy.rollbackWeight).toBe(0);
      expect(strategy.restackWeight).toBe(0);
      expect(strategy.appendWeight).toBe(3);
      expect(strategy.deprecateWeight).toBe(0);
    });

    it('should return minimal rolling for spec-error', () => {
      const strategy = getRollingStrategyWeight('spec-error');
      expect(strategy.rollbackWeight).toBe(0);
      expect(strategy.restackWeight).toBe(1);
      expect(strategy.appendWeight).toBe(1);
      expect(strategy.deprecateWeight).toBe(0);
    });

    it('should return moderate rolling for scope-change', () => {
      const strategy = getRollingStrategyWeight('scope-change');
      expect(strategy.rollbackWeight).toBe(1);
      expect(strategy.restackWeight).toBe(2);
      expect(strategy.appendWeight).toBe(2);
      expect(strategy.deprecateWeight).toBe(2);
    });

    it('should return balanced rolling for other', () => {
      const strategy = getRollingStrategyWeight('other');
      expect(strategy.rollbackWeight).toBe(1);
      expect(strategy.restackWeight).toBe(1);
      expect(strategy.appendWeight).toBe(1);
      expect(strategy.deprecateWeight).toBe(1);
    });
  });
});