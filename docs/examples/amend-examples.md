# Amend Workflow Examples

This document provides practical examples of using the `/opsx:amend` workflow in different scenarios.

## Table of Contents

- [Example 1: Design Issue](#example-1-design-issue)
- [Example 2: Missing Feature](#example-2-missing-feature)
- [Example 3: Spec Error](#example-3-spec-error)
- [Example 4: Scope Change](#example-4-scope-change)

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
└── src/notifications/
    ├── index.ts
    ├── socket-handler.ts
    └── redis-adapter.ts
```

### Running Amend

```bash
/opsx:amend --type design-issue
```

### Amendment Process

```
Amendment: Implementation revealed design flaw

What design issue did you discover?
> WebSocket approach requires sticky sessions for load balancing,
> which our infrastructure doesn't support. Want to switch to SSE.

Let me update the artifacts...

Editing design.md...
? Edit design.md? Yes

✓ Updated design.md

Editing specs/notifications/spec.md...
? Edit specs/notifications/spec.md? Yes

✓ Updated specs/notifications/spec.md

✓ Updated proposal.md
✓ Updated tasks.md

Amendment summary:
- Design: Socket.io → Native SSE
- Specs: 1 ADDED, 1 MODIFIED, 1 REMOVED
- Tasks: 2 preserved, 4 added, 2 removed

Generated: amendment.md
```

### Generated amendment.md

```markdown
# Amendment: add-realtime-notifications

## Metadata
- **Created**: 2025-01-24T14:30:00Z
- **Reason**: WebSocket approach requires sticky sessions,
  switching to SSE for simpler architecture
- **Triggered By**: Task 1.3 implementation

## Summary
Changed from WebSocket (Socket.io) to SSE (Server-Sent Events)
for real-time notifications to avoid load balancer complexity.

## Changes

### Design Changes
**Reason**: Infrastructure doesn't support sticky sessions well

New approach:
- Native Node.js SSE
- GET /notifications/stream endpoint
- EventQueue for broadcasting

### Spec Changes

#### REMOVED Requirements
- **WebSocket Connection**: Replaced with SSE
  - Reason: Simpler for one-way push
  - Migration: Use GET /notifications/stream

#### ADDED Requirements
- **Real-Time Notification Stream**: SSE-based push

#### MODIFIED Requirements
- **Notification Persistence**: Added SSE lifecycle scenarios

### Tasks Changes
- Preserved: 2 tasks (module structure, dependencies)
- Added: 4 tasks (SSE endpoint, connection handler, etc.)
- Removed: 2 tasks (Redis adapter, WebSocket handler)

## Impact Analysis
- Affected Files: 3 files
- Estimated Effort: 4 hours
- Backward Compatible: No

## Rollback Plan
If issues arise:
1. Revert to commit abc123
2. amendment.md preserves all changes
3. Can re-apply incrementally

## Next Steps
1. Implement SSE endpoint
2. Update frontend to use EventSource
3. Test notification push flow
```

### Updated tasks.md

```markdown
<!-- Amendment: 2025-01-24 - Changed to SSE approach -->

# Tasks

## 1. Setup

- [x] 1.1 Create notifications module structure
- [x] 1.2 ~~Add Socket.io dependencies~~ (removed - using native SSE)
- [ ] 1.3 Remove Socket.io dependency
- [ ] 1.4 Set up SSE utilities

## 2. Core Implementation

### SSE Endpoint
- [ ] 2.1 Implement GET /notifications/stream endpoint
- [ ] 2.2 Add authentication middleware for SSE
- [ ] 2.3 Implement connection lifecycle
- [ ] 2.4 Add EventQueue for broadcasting

### Notification Service
- [ ] 2.5 Create Notification model
- [ ] 2.6 Implement notification creation logic
- [ ] 2.7 Integrate with EventQueue

## 3. Testing

- [ ] 3.1 Unit tests for notification creation
- [ ] 3.2 Integration tests for SSE endpoint
- [ ] 3.3 E2E test for notification flow

<!-- Removed Tasks (preserved for reference) -->
<!-- - [ ] 1.3 Configure Redis adapter - No longer needed with SSE -->
<!-- - [ ] 2.1 Implement WebSocket handler - Replaced with SSE handler -->
```

---

## Example 2: Missing Feature

**Scenario**: While implementing user profile management, you realize password change functionality was never included in the original scope.

### Running Amend

```bash
/opsx:amend --type missing-feature
```

### Amendment Process

```
Amendment: Forgot to include functionality

What functionality is missing?
> Password change and email verification

Updating artifacts...

✓ Updated proposal.md - Expanded scope
✓ Added requirements to specs/user-profile/spec.md
  - Password Change requirement
  - Email Verification requirement
✓ Updated tasks.md - Added 7 new tasks

Progress: 5 completed, 12 new total (7 new tasks)

Generated: amendment.md
```

### Key Changes

```yaml
# proposal.md changes
## What Changes

Original scope:
- Basic profile fields (name, avatar, bio)

New additions:
- Password change functionality
- Email change with verification
- Privacy settings
```

```markdown
<!-- specs/user-profile/spec.md additions -->

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

---

## Example 3: Spec Error

**Scenario**: The spec states JWT tokens expire in 7 days, but best practices require 15-minute access tokens with refresh tokens.

### Running Amend

```bash
/opsx:amend --type spec-error
```

### Amendment Process

```
Amendment: Spec doesn't match expected behavior

What spec error did you find?
> Token expiration should be 15 minutes for access tokens,
> with 7-day refresh tokens

✓ Updated specs/auth/spec.md
  - MODIFIED: Session Expiration requirement
  - ADDED: Token Refresh requirement

No tasks affected - not yet implemented.

Generated: amendment.md
```

### Spec Changes

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

#### Scenario: Successful token refresh
- **GIVEN** a valid refresh token
- **WHEN** the user requests token refresh
- **THEN** a new access token is issued
- **AND** the old refresh token is invalidated
```

---

## Example 4: Scope Change

**Scenario**: Stakeholder requests expanding the scope to include notification persistence, which was originally out of scope.

### Running Amend

```bash
/opsx:amend --type scope-change
```

### Amendment Process

```
Amendment: Need to expand/narrow scope

Briefly describe what needs to change:
> Expanding scope to include notification persistence

Recommended order: proposal → specs → design → tasks

? Edit proposal.md? Yes
✓ Updated proposal.md

? Edit specs/? Yes
✓ Added notification persistence requirements

? Edit design.md? No
? Edit tasks.md? Yes
✓ Updated tasks.md

Amendment summary:
- Proposal: Scope expanded
- Specs: 2 ADDED requirements
- Tasks: 3 new tasks

Generated: amendment.md
```

---

## Best Practices

### When to Use Each Amendment Type

| Type | When to Use |
|------|-------------|
| `design-issue` | Implementation reveals flaw in technical approach |
| `missing-feature` | Forgot functionality in original scope |
| `spec-error` | Spec doesn't match expected behavior |
| `scope-change` | Stakeholder or business requirement change |

### Tips for Effective Amendments

1. **Be Specific**: Clearly describe what needs to change and why
2. **Update All Related Artifacts**: Don't just update one file
3. **Preserve History**: Use comments for removed content
4. **Validate Changes**: Run `/opsx:validate` after amendments
5. **Commit Often**: Each amendment should be a separate commit

### Common Mistakes to Avoid

1. **Deleting Completed Tasks**: Always preserve `[x]` tasks
2. **Skipping Specs**: If behavior changes, specs must be updated
3. **No Rollback Plan**: Always include how to revert
4. **Forgetting Dependencies**: Check if other artifacts are affected