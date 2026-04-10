/**
 * Amend Workflow Skill Template
 *
 * Skill template for the /opsx:amend workflow.
 */

import type { SkillTemplate, CommandTemplate } from '../types.js';

export function getAmendSkillTemplate(): SkillTemplate {
  return {
    name: 'openspec-amend',
    description: 'Pause implementation to amend artifacts and resume',
    license: 'MIT',
    compatibility: 'Requires openspec CLI.',
    metadata: {
      author: 'openspec',
      version: '1.0'
    },
    instructions: `
## Overview

This workflow handles mid-implementation changes to artifacts (proposal, specs, design, tasks).
Use when you discover issues during implementation that require going back to update plans.

## When to Use

- **Design Issue**: Implementation revealed flaw in technical approach
- **Missing Feature**: Forgot to include functionality in original scope
- **Spec Error**: Spec doesn't match expected behavior
- **Scope Change**: Need to expand/narrow the project scope
- **Other**: Any other mid-implementation adjustment

## Prerequisites

- A change must be in progress (have tasks.md with tasks)
- At least some tasks may be completed (preserved during amendment)

## Workflow Steps

### Step 1: Identify Amendment Type

Determine what type of amendment is needed:

1. **Design Issue** - Recommended artifact order:
   - design.md (update technical approach)
   - specs/ (update behavior specifications)
   - proposal.md (update scope/impact if needed)
   - tasks.md (adjust implementation plan)

2. **Missing Feature** - Recommended artifact order:
   - proposal.md (expand scope)
   - specs/ (add new requirements)
   - tasks.md (add new tasks)

3. **Spec Error** - Recommended artifact order:
   - specs/ (correct the specification)
   - tasks.md (update if affected)

4. **Scope Change** - Recommended artifact order:
   - proposal.md (update scope)
   - specs/ (add/remove requirements)
   - design.md (update if affected)
   - tasks.md (adjust tasks)

### Step 2: Read Current State

Before making changes:

1. Read all relevant artifacts to understand current state
2. Check tasks.md progress - identify completed tasks
3. Understand what triggered the amendment

### Step 3: Make Amendments

For each artifact that needs changes:

1. **Preserve History** - Add comments like:
   \`<!-- Amendment: 2025-01-24 - Changed from WebSocket to SSE -->\`

2. **Mark Changes** - For removed content, use:
   \`~~Removed content~~ (Reason: explanation)\`

3. **Update Content** - Add new/modified content

4. **Validate Format** - Ensure markdown is properly formatted

### Step 4: Generate Amendment Record

Create amendment.md with:

\`\`\`markdown
# Amendment: [Change Name]

## Metadata
- Created: [timestamp]
- Reason: [why amendment was needed]
- Triggered By: [what discovered the issue]

## Summary
[Brief description of changes]

## Changes

### Proposal Changes
[If changed]

### Spec Changes
#### ADDED Requirements
#### MODIFIED Requirements
#### REMOVED Requirements

### Design Changes
[If changed]

### Tasks Changes
- Preserved: [count] tasks
- Added: [count] tasks
- Removed: [count] tasks
- Modified: [count] tasks

## Impact Analysis
- Affected Files: [list]
- Estimated Effort: [time]
- Backward Compatible: [yes/no]

## Rollback Plan
[Steps to revert if needed]

## Next Steps
[What to do after amendment]
\`\`\`

### Step 5: Update Tasks

Update tasks.md:

1. **Preserve Completed Tasks** - Keep all [x] tasks marked
2. **Add New Tasks** - Use appropriate numbering
3. **Comment Removed Tasks** - Don't delete, comment with reason:
   \`<!-- - [ ] 2.4 Old task - Removed: No longer needed with new approach -->\`
4. **Add Amendment Note** - At top of file:
   \`<!-- Amendment: [date] - [summary] -->\`

### Step 6: Resume Implementation

After amendment:

1. Run \`/opsx:apply\` to continue implementation
2. AI will read updated artifacts
3. Continue from where you left off

## Important Rules

1. **Never Delete Completed Tasks** - Always preserve [x] items
2. **Document Why** - Every change should have a reason
3. **Keep History** - Comment out removed content instead of deleting
4. **Validate Specs** - Ensure specs still follow Given/When/Then format
5. **Update Dependencies** - If design changes, update tasks accordingly

## Examples

### Example 1: Design Issue

\`\`\`
User: /opsx:amend --type design-issue

AI: Amendment type: Design Issue

What design issue did you discover?
> WebSocket approach requires sticky sessions, want to use SSE instead

Let me update the artifacts...

✓ Updated design.md - Changed to SSE approach
✓ Updated specs/notifications/spec.md - Replaced WebSocket requirements
✓ Updated tasks.md - Adjusted implementation tasks

Amendment summary:
- Design: Socket.io → Native SSE
- Specs: 3 requirements modified
- Tasks: 2 added, 1 removed

Generated: amendment.md

Ready to continue implementation?
\`\`\`

### Example 2: Missing Feature

\`\`\`
User: /opsx:amend --type missing-feature

AI: What functionality is missing?
> Password change and email verification

Updating artifacts...

✓ Updated proposal.md - Expanded scope
✓ Added requirements to specs/user-profile/spec.md
  - Password Change requirement
  - Email Verification requirement
✓ Updated tasks.md - Added 7 new tasks

Progress: 5 completed, 12 new total (7 new tasks)

Generated: amendment.md
\`\`\`

### Example 3: Spec Error

\`\`\`
User: /opsx:amend --type spec-error

AI: What spec error did you find?
> Token expiration should be 15 minutes, not 7 days

✓ Updated specs/auth/spec.md
  - MODIFIED: Session Expiration requirement
  - Changed: 7 days → 15 minutes

No tasks affected - they were not yet implemented.

Generated: amendment.md
\`\`\`

## Integration with Apply

When \`/opsx:apply\` encounters an issue:

1. AI pauses and explains the issue
2. AI suggests running \`/opsx:amend\`
3. User runs amend workflow
4. AI detects amendment.md and reads updates
5. AI continues implementation with new context

## Output Files

- \`amendment.md\` - Record of all changes (added to change directory)
- \`.amendment-state.json\` - Runtime state (temporary, for recovery)
- Updated artifacts (proposal.md, specs/, design.md, tasks.md)

## Notes

- An amendment preserves all completed work
- Multiple amendments can be made to one change
- Each amendment creates a new amendment.md entry
- Old amendments are preserved for history
`
  };
}

export function getOpsxAmendCommandTemplate(): CommandTemplate {
  return {
    name: 'opsx-amend',
    description: 'Amend artifacts during implementation and resume',
    category: 'workflow',
    tags: ['amend', 'change', 'resume', 'mid-implementation'],
    content: getAmendSkillTemplate().instructions
  };
}