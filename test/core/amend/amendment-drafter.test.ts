/**
 * Amendment Drafter Tests
 *
 * Tests for draftAmendmentRecord, generateAmendmentDocument, writeAmendmentDocument,
 * updateAmendmentStatus and related functions from
 * src/core/amend/amendment-drafter.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { draftAmendmentRecord, generateAmendmentDocument, writeAmendmentDocument, updateAmendmentStatus } from '../../../src/core/amend/amendment-drafter.js';
import type { AmendmentRecord, AmendmentType, TaskProgress } from '../../../src/core/amend/types.js';

async function createTempChangeDir(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-drafter-test-'));

  await fs.writeFile(path.join(tmpDir, 'proposal.md'), '# Proposal: Test Change\n');
  await fs.writeFile(path.join(tmpDir, 'design.md'), '# Design\n');
  await fs.writeFile(path.join(tmpDir, 'tasks.md'), '# Tasks\n\n## 1. Setup\n\n- [x] 1.1 Task one\n- [ ] 1.2 Task two\n');

  const specsDir = path.join(tmpDir, 'specs', 'auth');
  await fs.mkdir(specsDir, { recursive: true });
  await fs.writeFile(path.join(specsDir, 'spec.md'), '## Requirements\n\n### Requirement: Login\n');

  return tmpDir;
}

async function cleanupDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

const SAMPLE_RECORD: AmendmentRecord = {
  metadata: {
    changeName: 'test-change',
    created: '2025-01-24T14:30:00Z',
    amendmentType: 'design-issue',
    reason: 'Switch from WebSocket to SSE',
    triggeredBy: 'Task 1.3 implementation',
    status: 'DRAFT'
  },
  summary: 'Changed from WebSocket to SSE for real-time notifications.',
  changes: {
    modificationLogic: {
      affectedArtifacts: [
        { artifact: 'design', action: 'MODIFY', priority: 'P0', reason: 'Switch from WebSocket to SSE' },
        { artifact: 'specs', action: 'MODIFY', priority: 'P1', reason: 'Update spec requirements' },
        { artifact: 'proposal', action: 'MODIFY', priority: 'P2', reason: 'Update proposal scope' },
        { artifact: 'tasks', action: 'ROLL', priority: 'P0', reason: 'Rollback conflicting tasks' }
      ],
      modificationOrder: ['design', 'specs', 'proposal', 'tasks']
    },
    tasksRolling: {
      rollback: [
        { id: '1.2', description: 'Add Socket.io dependencies', rollbackAction: 'Remove Socket.io code', rollbackCode: 'socket-handler.ts' }
      ],
      restack: [
        { id: '2.1', originalDescription: 'Implement WebSocket handler', newDescription: 'Implement SSE endpoint', reason: 'Switch to SSE' }
      ],
      append: [
        { id: 'new.1', description: 'Add SSE endpoint', section: '2', afterTask: '2.1' }
      ],
      deprecate: [
        { id: '1.3', description: 'Configure Redis adapter', reason: 'No Redis in new approach' }
      ],
      newSequence: [
        { id: '1.1', description: 'Create notifications module', status: 'completed', section: '1. Setup' },
        { id: '1.2', description: 'Add Socket.io dependencies', status: 'rollback', section: '1. Setup' },
        { id: '2.1', description: 'Implement SSE endpoint', status: 'restack', section: '2. Core' },
        { id: 'new.1', description: 'Add SSE endpoint', status: 'append', section: '2' }
      ]
    },
    specs: [
      { specName: 'notifications', operation: 'MODIFIED', requirement: 'WebSocket Connection', details: 'Replaced with SSE' },
      { specName: 'notifications', operation: 'ADDED', requirement: 'SSE Stream', details: 'New SSE requirement' }
    ]
  },
  impactAnalysis: {
    codeImpact: {
      affectedFiles: ['design.md', 'specs/*/spec.md', 'tasks.md'],
      estimatedEffort: '1-2 hours',
      backwardCompatible: false
    },
    dependencyImpact: {
      remove: [],
      add: []
    }
  },
  rollbackPlan: 'Restore from .versions/v0/',
  nextSteps: [
    'Confirm this amendment',
    'Run /opsx:apply to execute'
  ],
  confirmationChecklist: {
    modificationLogicCorrect: false,
    changeDraftsComplete: false,
    tasksRollingFeasible: false,
    impactAcceptable: false,
    readyToApply: false
  }
};

describe('AmendmentDrafter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempChangeDir();
  });

  afterEach(async () => {
    await cleanupDir(tmpDir);
  });

  describe('generateAmendmentDocument', () => {
    it('should generate a complete amendment.md document', () => {
      const content = generateAmendmentDocument(SAMPLE_RECORD, 2);

      // Should contain metadata section
      expect(content).toContain('# Amendment v2: test-change');
      expect(content).toContain('**Version**: v2');
      expect(content).toContain('**Status**: DRAFT');
      expect(content).toContain('**Reason**: Switch from WebSocket to SSE');
      expect(content).toContain('**Amendment Type**: design-issue');

      // Should contain modification logic section
      expect(content).toContain('## Modification Logic');
      expect(content).toContain('### Affected Artifacts');
      expect(content).toContain('| design | MODIFY | P0 |');
      expect(content).toContain('| tasks | ROLL | P0 |');

      // Should contain modification order
      expect(content).toContain('### Modification Order');
      expect(content).toContain('1. design');
      expect(content).toContain('4. tasks');

      // Should contain tasks rolling plan
      expect(content).toContain('## Tasks Rolling Plan');
      expect(content).toContain('### Rollback Tasks');
      expect(content).toContain('| 1.2 |');
      expect(content).toContain('### Restack Tasks');
      expect(content).toContain('### Append Tasks');
      expect(content).toContain('### Deprecate Tasks');

      // Should contain new sequence
      expect(content).toContain('### Task Sequence After Rolling');
      expect(content).toContain('1.1');
      expect(content).toContain('(preserved)');
      expect(content).toContain('(ROLLBACK)');

      // Should contain impact analysis
      expect(content).toContain('## Impact Analysis');
      expect(content).toContain('**Estimated Effort**: 1-2 hours');
      expect(content).toContain('**Backward Compatible**: No');

      // Should contain confirmation checklist
      expect(content).toContain('## Confirmation Checklist');
      expect(content).toContain('- [ ] Modification logic is correct');
      expect(content).toContain('- [ ] Ready to apply this amendment');

      // Should contain rollback plan
      expect(content).toContain('## Rollback Plan');

      // Should contain next steps
      expect(content).toContain('## Next Steps');

      // Should contain footer
      expect(content).toContain('Status: DRAFT');
    });

    it('should handle record without tasksRolling', () => {
      const recordWithoutRolling = {
        ...SAMPLE_RECORD,
        changes: {
          ...SAMPLE_RECORD.changes,
          tasksRolling: undefined
        }
      };

      const content = generateAmendmentDocument(recordWithoutRolling, 1);

      // Should NOT contain tasks rolling plan section
      expect(content).not.toContain('## Tasks Rolling Plan');
      // Should still contain other sections
      expect(content).toContain('# Amendment v1: test-change');
      expect(content).toContain('## Modification Logic');
    });

    it('should include backup information when version > 0', () => {
      const content = generateAmendmentDocument(SAMPLE_RECORD, 2);

      expect(content).toContain('## Backup Information');
      expect(content).toContain('**Previous Version**: v1');
      expect(content).toContain('.versions/v1/');
    });

    it('should not include backup information when version is 0', () => {
      const content = generateAmendmentDocument(SAMPLE_RECORD, 0);

      expect(content).not.toContain('## Backup Information');
    });

    it('should include spec changes section', () => {
      const content = generateAmendmentDocument(SAMPLE_RECORD, 1);

      expect(content).toContain('### Spec Changes');
      expect(content).toContain('#### MODIFIED Requirements');
      expect(content).toContain('#### ADDED Requirements');
      expect(content).toContain('notifications');
    });
  });

  describe('writeAmendmentDocument', () => {
    it('should write amendment.md and versioned file to disk', async () => {
      const amendmentPath = await writeAmendmentDocument(tmpDir, SAMPLE_RECORD, 1);

      // Check latest file exists
      expect(amendmentPath).toContain('amendment.md');
      const latestContent = await fs.readFile(path.join(tmpDir, 'amendment.md'), 'utf-8');
      expect(latestContent).toContain('# Amendment v1: test-change');

      // Check versioned file exists
      const versionedContent = await fs.readFile(path.join(tmpDir, 'amendment-v1.md'), 'utf-8');
      expect(versionedContent).toContain('# Amendment v1: test-change');
    });

    it('should write amendment.md only (no versioned) when version is 0', async () => {
      await writeAmendmentDocument(tmpDir, SAMPLE_RECORD, 0);

      // Only amendment.md should exist, no amendment-v0.md
      const latestContent = await fs.readFile(path.join(tmpDir, 'amendment.md'), 'utf-8');
      expect(latestContent).toContain('# Amendment v0: test-change');
    });
  });

  describe('updateAmendmentStatus', () => {
    it('should update status to CONFIRMED in amendment.md', async () => {
      // First write the initial document
      await writeAmendmentDocument(tmpDir, SAMPLE_RECORD, 1);

      // Create state file
      await fs.writeFile(
        path.join(tmpDir, '.amendment-state.json'),
        JSON.stringify({ status: 'DRAFT', changeName: 'test-change' })
      );

      // Update status
      await updateAmendmentStatus(tmpDir, SAMPLE_RECORD, 1, 'CONFIRMED');

      // Check amendment.md was updated
      const content = await fs.readFile(path.join(tmpDir, 'amendment.md'), 'utf-8');
      expect(content).toContain('**Status**: CONFIRMED');

      // Check state file was updated
      const state = JSON.parse(await fs.readFile(path.join(tmpDir, '.amendment-state.json'), 'utf-8'));
      expect(state.status).toBe('CONFIRMED');
    });

    it('should handle missing state file gracefully', async () => {
      await writeAmendmentDocument(tmpDir, SAMPLE_RECORD, 1);

      // No .amendment-state.json exists — should still work
      await updateAmendmentStatus(tmpDir, SAMPLE_RECORD, 1, 'CONFIRMED');

      const content = await fs.readFile(path.join(tmpDir, 'amendment.md'), 'utf-8');
      expect(content).toContain('**Status**: CONFIRMED');
    });
  });

  describe('draftAmendmentRecord', () => {
    it('should draft a complete amendment record with DRAFT status', async () => {
      const progress: TaskProgress = {
        total: 2,
        completed: 1,
        completedIds: ['1.1'],
        inProgressId: null,
        pendingIds: ['1.2']
      };

      const record = await draftAmendmentRecord(
        tmpDir,
        'test-change',
        'design-issue',
        'Switch from WebSocket to SSE',
        'Task 1.3 implementation',
        progress,
        2
      );

      // Should have DRAFT status
      expect(record.metadata.status).toBe('DRAFT');
      expect(record.metadata.changeName).toBe('test-change');
      expect(record.metadata.amendmentType).toBe('design-issue');
      expect(record.metadata.reason).toBe('Switch from WebSocket to SSE');
      expect(record.metadata.triggeredBy).toBe('Task 1.3 implementation');

      // Should have modification logic
      expect(record.changes.modificationLogic).toBeDefined();
      expect(record.changes.modificationLogic.affectedArtifacts.length).toBeGreaterThan(0);

      // Should have tasks rolling plan
      expect(record.changes.tasksRolling).toBeDefined();

      // Should have impact analysis
      expect(record.impactAnalysis.codeImpact).toBeDefined();
      expect(record.impactAnalysis.codeImpact.estimatedEffort).toBeDefined();

      // Should have confirmation checklist (all unchecked)
      expect(record.confirmationChecklist.modificationLogicCorrect).toBe(false);
      expect(record.confirmationChecklist.readyToApply).toBe(false);
    });
  });
});