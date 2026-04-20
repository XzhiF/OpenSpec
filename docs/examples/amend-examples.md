# Amend Workflow Examples

This document provides practical examples of using the `/opsx:amend` workflow in different scenarios.

**Important**: The amend workflow follows the principle **"Amend = Plan, Not Execute"**. The `/opsx:amend` command only generates a revision plan (amendment.md). Actual changes are applied via `/opsx:apply` after user confirmation.

Amendment Lifecycle: `DRAFT → CONFIRMED → APPLIED`

## Table of Contents

- [Example 1: Design Issue](#example-1-design-issue)
- [Example 2: Missing Feature](#example-2-missing-feature)
- [Example 3: Spec Error](#example-3-spec-error)
- [Example 4: Scope Change](#example-4-scope-change)
- [Best Practices](#best-practices)

---

## Example 1: Design Issue

**Scenario**: During implementation of a real-time notification feature, you discover that the WebSocket approach requires sticky sessions, which your load balancer doesn't support well.

### Initial State

```
openspec/changes/add-realtime-notifications/
├── proposal.md
│   # Proposal: Add Real-Time Notifications
│   ## What Changes
│   - WebSocket-based real-time push
│   ...
│
├── specs/notifications/spec.md
│   ## ADDED Requirements
│   ### Requirement: WebSocket Connection
│   ...
│
├── design.md
│   # Design
│   ## Technical Approach
│   Using Socket.io with Redis adapter...
│
├── tasks.md
│   # Tasks
│   ## 1. Setup
│   - [x] 1.1 Create notifications module
│   - [x] 1.2 Add Socket.io dependencies
│   - [ ] 1.3 Configure Redis adapter
│   - [ ] 2.1 Implement WebSocket handler
│   ...
```

### Running Amend (Planning Phase)

```bash
/opsx:amend --type design-issue --description "Switch from WebSocket to SSE"
```

### Amendment Process (Plan Only)

```
Amendment: Implementation revealed design flaw
Description: Switch from WebSocket to SSE

amend generates a revision plan — it does NOT execute modifications.
Actual changes are applied via /opsx:apply after confirmation.

Analyzing modification intent...
✓ Affected artifacts: design (MODIFY, P0), specs (MODIFY, P1), proposal (MODIFY, P2), tasks (ROLL, P0)
✓ Tasks rolling: 2 rollback, 1 restack, 3 append, 1 deprecate

Drafting amendment.md...
✓ Generated amendment.md (v2, status: DRAFT)

Amendment Draft (v2):
  Affected Artifacts:
    design: MODIFY (P0)
    specs: MODIFY (P1)
    proposal: MODIFY (P2)
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

Next: Run `/opsx:apply` to execute the amendment and continue implementation.
```

### Generated amendment.md

```markdown
# Amendment v2: add-realtime-notifications

## Metadata
- **Version**: v2
- **Created**: 2025-01-24T14:30:00Z
- **Amendment Type**: design-issue
- **Status**: CONFIRMED
- **Reason**: WebSocket approach requires sticky sessions, switching to SSE
- **Triggered By**: Task 1.3 implementation

## Backup Information
- **Previous Version**: v1
- **Backup Location**: .versions/v1/

## Summary
Changed from WebSocket (Socket.io) to SSE (Server-Sent Events)
for real-time notifications to avoid load balancer complexity.

## Modification Logic

### Affected Artifacts
| Artifact | Action | Priority | Reason |
|----------|--------|----------|--------|
| design | MODIFY | P0 | Switch from WebSocket to SSE |
| specs | MODIFY | P1 | Update spec requirements |
| proposal | MODIFY | P2 | Update proposal scope |
| tasks | ROLL | P0 | Rollback conflicting tasks |

### Modification Order
1. design
2. specs
3. proposal
4. tasks

## Tasks Rolling Plan

### Rollback Tasks (need to undo completed work)
| Task ID | Description | Rollback Action | Rollback Code |
|---------|-------------|-----------------|---------------|
| 1.2 | Add Socket.io dependencies | Remove Socket.io code | socket-handler.ts, package.json |

### Restack Tasks (reorder/modify pending tasks)
| Task ID | Original | Modified | Reason |
|---------|----------|----------|--------|
| 2.1 | Implement WebSocket handler | Implement SSE endpoint | Switch to SSE |

### Append Tasks (new tasks to add)
| Task ID | Description | Section | After Task |
|---------|-------------|---------|------------|
| new.1 | Add SSE endpoint | 2 | 2.1 |
| new.2 | Add EventQueue for broadcasting | 2 | new.1 |
| new.3 | Implement connection lifecycle | 2 | new.2 |

### Deprecate Tasks (no longer needed)
| Task ID | Description | Reason |
|---------|-------------|--------|
| 1.3 | Configure Redis adapter | No Redis in new approach |

### Task Sequence After Rolling
- **1.1** (preserved): Create notifications module
- **1.2** (ROLLBACK): Add Socket.io dependencies
- **new.1** (APPEND): Add SSE endpoint
- **new.2** (APPEND): Add EventQueue for broadcasting
- **new.3** (APPEND): Implement connection lifecycle

## Impact Analysis
- **Affected Files**: 3 files
- **Estimated Effort**: 4 hours
- **Backward Compatible**: No

## Confirmation Checklist
- [x] Modification logic is correct
- [x] Change drafts are complete and accurate
- [x] Tasks rolling plan is feasible
- [x] Impact analysis is acceptable
- [x] Ready to apply this amendment

## Rollback Plan (for the amendment itself)
If the amendment itself needs to be reverted:
1. Restore artifacts from .versions/v1/
2. Re-apply the rolled-back tasks (restore their code changes)

## Next Steps
1. Confirm this amendment (check all items in Confirmation Checklist)
2. Rollback 1 completed task(s) — code will be removed during apply
3. Restack 1 pending task(s) — descriptions will be updated
4. Append 3 new task(s) to the task list
5. Deprecate 1 task(s) no longer needed
6. Run `/opsx:apply` to execute amendment changes and continue implementation

---
*Generated by OpenSpec Amend Workflow | Status: CONFIRMED*
```

### Running Apply (Execution Phase)

```bash
/opsx:apply
```

The apply workflow detects a CONFIRMED amendment and executes it first:

```
Using change: add-realtime-notifications

Checking for pending amendment...
✓ Found CONFIRMED amendment v2

Applying amendment...
✓ Modified 3 artifacts (annotated with v2 comments)
✓ Tasks rolling applied: 1 rollback, 1 restack, 3 append, 1 deprecate
✓ Amendment status: APPLIED

Continuing with task implementation...
```

### Updated tasks.md (after apply)

```markdown
<!-- Amendment v2: Rolling plan applied -->

# Tasks

## 1. Setup

- [x] 1.1 Create notifications module structure
- [x→ROLLBACK] 1.2 Add Socket.io dependencies
  <!-- Amendment v2: Marked for rollback → Remove in v2 -->

## 2. Core Implementation

- [ ] 2.1 Implement SSE endpoint
  <!-- Amendment v2: RESTACK → was: Implement WebSocket handler (Switch to SSE) -->

<!-- Amendment v2: APPENDED tasks -->
- [ ] new.1 Add SSE endpoint
  <!-- Amendment v2: APPEND → section 2, after 2.1 -->
- [ ] new.2 Add EventQueue for broadcasting
  <!-- Amendment v2: APPEND → section 2, after new.1 -->
- [ ] new.3 Implement connection lifecycle
  <!-- Amendment v2: APPEND → section 2, after new.2 -->

<!-- - [ ] 1.3 Configure Redis adapter -->
<!--   Amendment v2: DEPRECATED → No Redis in new approach -->

## Rollback Steps (Amendment v2)

<!-- These steps must be completed before continuing implementation -->
- [ ] 1.2 Remove Socket.io code
  <!-- Rollback code: socket-handler.ts, package.json -->

<!-- Deprecated Tasks (Amendment v2) -->
<!-- These tasks are preserved for historical reference -->
<!-- 1.3: Configure Redis adapter → Reason: No Redis in new approach -->
```

---

## Example 2: Missing Feature

**Scenario**: While implementing user profile management, you realize password change functionality was never included in the original scope.

### Running Amend

```bash
/opsx:amend --type missing-feature --description "Password change and email verification"
```

### Amendment Process (Plan Only)

```
Amendment: Forgot to include functionality
Description: Password change and email verification

amend generates a revision plan — it does NOT execute modifications.
Actual changes are applied via /opsx:apply after confirmation.

Analyzing modification intent...
✓ Affected artifacts: proposal (MODIFY, P1), specs (ADD_REQ, P1), tasks (ROLL, P0)
✓ Tasks rolling: 0 rollback, 0 restack, 4 append, 0 deprecate

Drafting amendment.md...
✓ Generated amendment.md (v1, status: DRAFT)

[... summary shown ...]

Confirm this amendment?
> Yes

✓ Amendment confirmed! Status: CONFIRMED

Next: Run `/opsx:apply` to execute the amendment and continue implementation.
```

### Key Planned Changes (in amendment.md)

```yaml
# proposal.md planned changes (applied via /opsx:apply)
## What Changes

Original scope:
- Basic profile fields (name, avatar, bio)

New additions:
- Password change functionality
- Email change with verification
```

```markdown
<!-- specs/user-profile/spec.md planned additions -->

## ADDED Requirements

### Requirement: Password Change
The system SHALL allow authenticated users to change their password.

#### Scenario: Successful password change
- **GIVEN** an authenticated user
- **WHEN** the user submits a new password with correct current password
- **THEN** the password is updated
- **AND** the user is logged out of all sessions

### Requirement: Email Change with Verification
The system SHALL allow users to change email with verification.
```

### Tasks Rolling Plan (in amendment.md)

| Operation | Tasks |
|-----------|-------|
| Rollback | 0 (no completed tasks conflict) |
| Restack | 0 (no pending tasks need adjustment) |
| Append | 4 new tasks (password change, email verification, etc.) |
| Deprecate | 0 (no tasks to remove) |

---

## Example 3: Spec Error

**Scenario**: The spec states JWT tokens expire in 7 days, but best practices require 15-minute access tokens with refresh tokens.

### Running Amend

```bash
/opsx:amend --type spec-error --description "Token expiration should be 15 minutes with 7-day refresh tokens"
```

### Amendment Process (Plan Only)

```
Amendment: Spec doesn't match expected behavior
Description: Token expiration should be 15 minutes with 7-day refresh tokens

Analyzing modification intent...
✓ Affected artifacts: specs (MODIFY, P1), tasks (ROLL, P2)
✓ Tasks rolling: 0 rollback, 0 restack, 1 append, 0 deprecate

Drafting amendment.md...
✓ Generated amendment.md (v1, status: DRAFT)

[... summary shown ...]

Confirm this amendment?
> Yes

✓ Amendment confirmed! Status: CONFIRMED
```

### Planned Spec Changes (in amendment.md)

```markdown
## MODIFIED Requirements

### Requirement: User Login
(Previously: JWT token with 7-day expiration)

The system SHALL authenticate users and issue tokens.

#### Scenario: Successful login
- **GIVEN** a registered user with valid credentials
- **WHEN** the user submits login form
- **THEN** an access token (15 min) is returned
- **AND** a refresh token (7 days) is returned

## ADDED Requirements

### Requirement: Token Refresh
The system SHALL allow users to refresh access tokens.
```

---

## Example 4: Scope Change

**Scenario**: Stakeholder requests expanding the scope to include notification persistence, which was originally out of scope.

### Running Amend

```bash
/opsx:amend --type scope-change --description "Expand scope to include notification persistence"
```

### Amendment Process (Plan Only)

```
Amendment: Need to expand/narrow scope
Description: Expand scope to include notification persistence

Analyzing modification intent...
✓ Affected artifacts: proposal (MODIFY, P1), specs (ADD_REQ, P1), design (MODIFY, P2), tasks (ROLL, P0)
✓ Tasks rolling: 1 rollback, 2 restack, 2 append, 2 deprecate

Drafting amendment.md...
✓ Generated amendment.md (v1, status: DRAFT)

[... summary shown ...]

Confirm this amendment?
> Yes

✓ Amendment confirmed! Status: CONFIRMED

Next: Run `/opsx:apply` to execute the amendment and continue implementation.
```

---

## Best Practices

### Amendment Lifecycle

```
DRAFT → CONFIRMED → APPLIED

DRAFT:    Plan generated, awaiting user review
CONFIRMED: User approved, ready for execution by /opsx:apply
APPLIED:   Changes executed, implementation continues
```

### When to Use Each Amendment Type

| Type | Affected Artifacts | Rolling Strategy |
|------|--------------------|------------------|
| `design-issue` | design → specs → proposal → tasks | Heavy rolling: rollback conflicts, restack pending |
| `missing-feature` | proposal → specs → tasks | Light rolling: mostly append new tasks |
| `spec-error` | specs → tasks | Minimal rolling: restack affected tasks |
| `scope-change` | proposal → specs → design → tasks | Moderate rolling: deprecate removed, append new |

### Tips for Effective Amendments

1. **Be Specific**: Clearly describe what needs to change and why
2. **Review the Plan**: Always check amendment.md before confirming
3. **Check the Checklist**: Verify all 5 confirmation items before applying
4. **Use /opsx:apply to Execute**: amend only plans — apply executes
5. **Commit Often**: Each amendment should be a separate commit

### Common Mistakes to Avoid

1. **Confusing amend with apply**: amend PLANS, apply EXECUTES
2. **Skipping the checklist**: Don't confirm without reviewing all items
3. **Not checking rolling plan**: The new task sequence must be feasible
4. **Deleting completed tasks**: Always preserve `[x]` tasks (rollback uses annotations)
5. **Applying a DRAFT**: Must confirm first (status → CONFIRMED) before /opsx:apply

### Integration Flow

```
amend  ──→  Generate revision plan (amendment.md)  ──→  User confirms
                                                    │
                                                    ▼
apply  ──→  Execute revision plan (modify artifacts) ──→  Continue tasks
```

When `/opsx:apply` encounters a CONFIRMED amendment:
1. Apply modification logic (annotate and modify artifacts in order)
2. Apply tasks rolling plan
3. Update amendment status to APPLIED
4. Continue with task implementation

If `/opsx:apply` encounters a DRAFT amendment:
- **STOP** and tell user to confirm the amendment first