/**
 * Amend Workflow Skill Template
 *
 * Skill template for the /opsx:amend workflow.
 * Redesigned: Amend = Plan, Not Execute.
 *
 * New flow: Analysis → Draft → Confirm → Wait for apply
 * - amend does NOT directly modify artifacts
 * - amend generates a revision plan (amendment.md)
 * - User confirms the plan
 * - /opsx:apply executes the confirmed plan and continues implementation
 */

import type { SkillTemplate, CommandTemplate } from '../types.js';

export function getAmendSkillTemplate(): SkillTemplate {
  return {
    name: 'openspec-amend',
    description: 'Generate a revision plan for mid-implementation changes. Amend does NOT execute changes — it only plans them. Apply executes via /opsx:apply.',
    license: 'MIT',
    compatibility: 'Requires openspec CLI.',
    metadata: {
      author: 'openspec',
      version: '2.0'
    },
    instructions: `
## Overview

This workflow handles mid-implementation changes by generating a **revision plan** (amendment.md).
**IMPORTANT**: amend does NOT execute changes directly. It only analyzes and plans them.

The actual execution happens via \`/opsx:apply\` after user confirmation.

## When to Use

- **Design Issue**: Implementation revealed flaw in technical approach
- **Missing Feature**: Forgot to include functionality in original scope
- **Spec Error**: Spec doesn't match expected behavior
- **Scope Change**: Need to expand/narrow the project scope
- **Other**: Any other mid-implementation adjustment

## Prerequisites

- A change must be in progress (have tasks.md with tasks)
- At least some tasks may be completed (preserved during amendment)

## Workflow Steps (4 Phases)

### Phase 1: Analysis

Determine what needs to change:

1. **Identify Amendment Type**

   | Type | Affected Artifacts | Rolling Strategy |
   |------|--------------------|------------------|
   | design-issue | design → specs → proposal → tasks | Heavy rolling: rollback conflicts, restack pending |
   | missing-feature | proposal → specs → tasks | Light rolling: mostly append new tasks |
   | spec-error | specs → tasks | Minimal rolling: restack affected tasks |
   | scope-change | proposal → specs → design → tasks | Moderate rolling: deprecate removed, append new |
   | other | User choice | Default rolling |

2. **Read Current State**
   - Read all relevant artifacts (proposal.md, design.md, specs/, tasks.md)
   - Check tasks.md progress: completed, in-progress, pending
   - Receive user's modification description

3. **Analyze Modification Intent**
   - Determine which artifacts are affected (Modification Logic)
   - For each affected artifact: what action (MODIFY/ADD_REQ/REMOVE_REQ/ROLL), priority, reason
   - Determine modification order (which artifact to change first)
   - For tasks.md: classify into rolling operations:
     - **Rollback**: completed tasks that conflict with new approach
     - **Restack**: pending tasks that need description/priority changes
     - **Append**: new tasks to add
     - **Deprecate**: tasks no longer needed

### Phase 2: Draft

Generate the amendment.md revision plan document:

1. **Write amendment.md** with status = DRAFT, containing:
   - Metadata (version, type, reason, triggered by, status)
   - **Modification Logic** — table of affected artifacts with actions and priorities
   - **Modification Order** — sequence of changes
   - **Change Drafts** — planned changes for each artifact (NOT actual modifications)
   - **Tasks Rolling Plan** — rollback/restack/append/deprecate tables + new task sequence
   - **Impact Analysis** — affected files, estimated effort, backward compatibility
   - **Confirmation Checklist** — 5 items for user to check off
   - **Rollback Plan** — how to revert the amendment itself
   - **Next Steps** — what to do after confirmation

2. **Create backup** via versioned directory (.versions/v{n}/)

3. **Save amendment state** (.amendment-state.json)

### Phase 3: Confirm

Present the plan for user confirmation:

1. **Show amendment summary** — affected artifacts, rolling plan, impact
2. **Show confirmation checklist** — 5 items to verify
3. **Wait for user confirmation**:
   - Interactive: prompt to confirm
   - Non-interactive: status stays DRAFT, user manually edits amendment.md
   - autoConfirm: mark as CONFIRMED immediately

4. **Update status**:
   - Confirmed → status = CONFIRMED
   - Not confirmed → status stays DRAFT

### Phase 4: Wait for Apply

amend does NOT execute modifications. After confirmation:

1. Tell user: "Amendment confirmed. Run \`/opsx:apply\` to execute the revision plan and continue implementation."
2. \`/opsx:apply\` will:
   - Check for CONFIRMED amendments
   - Execute the modification logic (annotate and modify artifacts)
   - Apply the tasks rolling plan
   - Update amendment status to APPLIED
   - Continue with task implementation

## Amendment Lifecycle

\`\`\`
DRAFT → CONFIRMED → APPLIED

DRAFT:    Plan generated, awaiting user review
CONFIRMED: User approved, ready for execution by /opsx:apply
APPLIED:   Changes executed, implementation continues
\`\`\`

## Tasks Rolling Mechanism

When the implementation approach changes, tasks.md needs "rolling" operations:

### Rollback (completed tasks that conflict)
\`\`\`
- [x→ROLLBACK] 1.2 Add Socket.io dependencies
  <!-- Amendment v2: Marked for rollback → Remove in v2 -->
\`\`\`

### Restack (pending tasks that need adjustment)
\`\`\`
- [ ] 2.1 Implement SSE endpoint
  <!-- Amendment v2: RESTACK → was: Implement WebSocket handler -->
\`\`\`

### Append (new tasks to add)
\`\`\`
- [ ] 2.4 Add EventQueue for broadcasting
  <!-- Amendment v2: APPEND → section 2, after 2.3 -->
\`\`\`

### Deprecate (tasks no longer needed)
\`\`\`
<!-- - [ ] 1.4 Redis adapter tests -->
<!--   Amendment v2: DEPRECATED → No Redis in new approach -->
\`\`\`

## Important Rules

1. **amend NEVER executes modifications** — it only generates the revision plan
2. **Document Why** — every change should have a reason in the plan
3. **Keep History** — deprecated/rollback tasks are preserved as comments, not deleted
4. **Modification Order matters** — changes are applied in the specified order
5. **Rolling plan is critical** — the new task sequence must be reviewed before confirmation
6. **Confirmation is mandatory** — user must check all 5 checklist items before status becomes CONFIRMED

## Examples

### Example 1: Design Issue

\`\`\`
User: /opsx:amend --type design-issue --description "Switch from WebSocket to SSE"

AI: Amendment type: Design Issue
Description: Switch from WebSocket to SSE

Analyzing modification intent...
✓ Affected artifacts: design (MODIFY, P0), specs (MODIFY, P1), tasks (ROLL, P0)
✓ Tasks rolling: 2 rollback, 1 restack, 3 append, 1 deprecate

Drafting amendment.md...
✓ Generated amendment.md (v2, status: DRAFT)

Amendment Draft (v2):
  Affected Artifacts:
    design: MODIFY (P0)
    specs: MODIFY (P1)
    tasks: ROLL (P0)
  Tasks Rolling Plan:
    Rollback: 2 task(s)
    Restack: 1 task(s)
    Append: 3 new task(s)
    Deprecate: 1 task(s)

Confirmation Checklist:
  Modification logic correct?      [ ]
  Change drafts complete?           [ ]
  Tasks rolling plan feasible?      [ ]
  Impact analysis acceptable?       [ ]
  Ready to apply this amendment?    [ ]

Confirm this amendment? (Changes will be applied via /opsx:apply)
> Yes

✓ Amendment confirmed! Status: CONFIRMED

Next: Run \`/opsx:apply\` to execute the amendment and continue implementation.
\`\`\`

### Example 2: Missing Feature

\`\`\`
User: /opsx:amend --type missing-feature --description "Password change and email verification"

AI: Amendment type: Missing Feature
Description: Password change and email verification

Analyzing modification intent...
✓ Affected artifacts: proposal (MODIFY, P1), specs (ADD_REQ, P1), tasks (ROLL, P0)
✓ Tasks rolling: 0 rollback, 0 restack, 4 append, 0 deprecate

Drafting amendment.md...
✓ Generated amendment.md (v1, status: DRAFT)

[... summary shown ...]

Confirm this amendment?
> Yes

✓ Amendment confirmed! Status: CONFIRMED

Next: Run \`/opsx:apply\` to execute the amendment and continue implementation.
\`\`\`

## Integration with Apply

\`\`\`
amend  ──→  Generate revision plan (amendment.md)  ──→  User confirms
                                                    │
                                                    ▼
apply  ──→  Execute revision plan (modify artifacts) ──→  Continue tasks
\`\`\`

When \`/opsx:apply\` encounters a CONFIRMED amendment:
1. Apply modification logic (annotate and modify artifacts in order)
2. Apply tasks rolling plan
3. Update amendment status to APPLIED
4. Continue with task implementation

If \`/opsx:apply\` encounters a DRAFT amendment:
- STOP and tell user to confirm the amendment first

## Output Files

- \`amendment.md\` — Revision plan document (status: DRAFT → CONFIRMED → APPLIED)
- \`amendment-v{n}.md\` — Versioned copy of amendment.md
- \`.amendment-state.json\` — Runtime state (for tracking amendment lifecycle)
- \`.versions/v{n}/\` — Backup of artifacts before amendment

## Notes

- amend does NOT directly modify any artifact files
- Multiple amendments can be made to one change (each gets a version number)
- The revision plan is a living document — user can edit it before confirming
- After APPLIED, the amendment cannot be re-applied (but a new amendment can be created)
- Backup exists at .versions/v{n-1}/ if the amendment needs to be reverted
`
  };
}

export function getOpsxAmendCommandTemplate(): CommandTemplate {
  return {
    name: 'opsx-amend',
    description: 'Generate a revision plan for mid-implementation changes. Does NOT execute — use /opsx:apply to execute confirmed amendments.',
    category: 'workflow',
    tags: ['amend', 'change', 'revision-plan', 'mid-implementation'],
    content: getAmendSkillTemplate().instructions
  };
}