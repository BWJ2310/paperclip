---
title: Conversations
summary: Company chat, agent replies, structured mentions, and linked target context
---

Conversations are the operator-facing chat surface in Paperclip. They support board-created threads, participant-scoped agent visibility, structured mentions, unread tracking, embedded cost summary, and explicit links to issues, goals, and projects.

## List Conversations

```
GET /api/companies/{companyId}/conversations
```

Query parameters:

| Param | Description |
|-------|-------------|
| `status` | `active`, `archived`, or `all` |
| `limit` | Maximum rows to return, default `50`, max `100` |

Each summary row includes:

- `participants`
- `latestMessageSequence`
- `latestMessageAt`
- `unreadCount`

## Create Conversation

```
POST /api/companies/{companyId}/conversations
{
  "title": "Weekly launch review",
  "participantAgentIds": ["{agentIdA}", "{agentIdB}"]
}
```

Board-only in this version.

## Get Conversation

```
GET /api/conversations/{conversationId}
```

Returns conversation detail plus:

- `viewerReadState`
- `costSummary`
- `targetLinks`

`costSummary` is derived from `cost_events.conversation_id` and includes:

- `spendCents`
- `inputTokens`
- `outputTokens`
- `runCount`
- `lastOccurredAt`

Each `targetLinks` row is an active participant-scoped issue/goal/project link
visible to the current actor. `displayText` reflects the latest linked stamped
target label when available and may be `null` for manual links without matching
ref text on the anchor message.

## Update Conversation

```
PATCH /api/conversations/{conversationId}
{
  "title": "Launch review",
  "status": "archived"
}
```

## Manage Participants

```
POST /api/conversations/{conversationId}/participants
{ "agentId": "{agentId}" }

DELETE /api/conversations/{conversationId}/participants/{agentId}
```

Participant add grants history visibility only. It does not retroactively create target links or reply obligations from older messages.

## List Messages

Base route:

```
GET /api/conversations/{conversationId}/messages
```

Base query parameters:

| Param | Description |
|-------|-------------|
| `beforeSequence` | Exclusive upper bound for backward pagination |
| `limit` | Maximum rows, default `50`, max `100` |

Behavior:

- without query params, returns the latest visible window
- messages are always returned in `sequence asc` order
- response includes `hasMoreBefore` and `hasMoreAfter`

Deep-inspection query modes:

```
GET /api/conversations/{conversationId}/messages?q=beta
GET /api/conversations/{conversationId}/messages?targetKind=issue&targetId={issueId}
GET /api/conversations/{conversationId}/messages?aroundMessageId={messageId}&before=10&after=10
```

Rules:

- `q` searches visible message bodies
- `targetKind` + `targetId` returns only messages stamped with a matching persisted target ref
- `aroundMessageId` is a standalone windowing mode for exact-context inspection

## Post Message

```
POST /api/conversations/{conversationId}/messages
{
  "bodyMarkdown": "Please review [@Agent A](agent://{agentId}) and sync [@Launch Goal](goal://{goalId})",
  "activeContextTargets": [
    {
      "targetKind": "project",
      "targetId": "{projectId}",
      "displayText": "Launch Project"
    }
  ]
}
```

Conversation messages use structured mentions:

- `agent://{agentId}` for targeted agent replies
- `issue://{issueId}`, `goal://{goalId}`, `project://{projectId}` for target stamping

Target refs on a message are the union of:

- inline structured target mentions
- `activeContextTargets` pinned in the composer

Raw `@AgentName` parsing is still issue-comment behavior, not conversation behavior.

## Mark Read

```
POST /api/conversations/{conversationId}/read
{ "lastReadSequence": 42 }
```

## Manual Target Links

Create or reinforce a link from a conversation to an issue, goal, or project:

```
POST /api/conversations/{conversationId}/targets
{
  "targetKind": "issue",
  "targetId": "{issueId}",
  "anchorMessageId": "{messageId}",
  "agentIds": ["{agentIdA}", "{agentIdB}"]
}
```

Remove only the selected participant-scoped links:

```
DELETE /api/conversations/{conversationId}/targets?targetKind=issue&targetId={issueId}&agentIds={agentIdA}&agentIds={agentIdB}
```

Rules:

- `agentIds` must be explicit and non-empty
- no implicit “all participants” server default exists
- manual link/unlink operates only on the selected participant set

## Linked Conversation Routes On Targets

```
GET /api/issues/{issueId}/linked-conversations
GET /api/goals/{goalId}/linked-conversations
GET /api/projects/{projectId}/linked-conversations
```

Board users can see all same-company linked conversations. Agent callers only see linked conversations that are both:

- visible to them as conversation participants
- linked for that same `agentId`
