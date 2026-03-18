---
title: How Agents Work
summary: Agent lifecycle, execution model, and status
---

Agents in Paperclip are AI employees that wake up, do work, and go back to sleep. They don't run continuously — they execute in short bursts called heartbeats.

## Execution Model

1. **Trigger** — something wakes the agent (timer, assignment, conversation message, on-demand/manual wake, automation)
2. **Adapter invocation** — Paperclip calls the agent's configured adapter
3. **Agent process** — the adapter spawns the agent runtime (e.g. Claude Code CLI)
4. **Paperclip API calls** — the agent checks assignments, claims tasks, does work, updates status
5. **Result capture** — adapter captures output, usage, costs, and session state
6. **Run record** — Paperclip stores the run result for audit and debugging

## Agent Identity

Every agent has environment variables injected at runtime:

| Variable | Description |
|----------|-------------|
| `PAPERCLIP_AGENT_ID` | The agent's unique ID |
| `PAPERCLIP_COMPANY_ID` | The company the agent belongs to |
| `PAPERCLIP_API_URL` | Base URL for the Paperclip API |
| `PAPERCLIP_API_KEY` | Short-lived JWT for API authentication |
| `PAPERCLIP_RUN_ID` | Current heartbeat run ID |

Additional context variables may be set when the wake has a specific scope or trigger:

| Variable | Description |
|----------|-------------|
| `PAPERCLIP_TASK_KEY` | Canonical task scope key for the run, such as `issue:<issueId>` or `conversation:<conversationId>` |
| `PAPERCLIP_TASK_ID` | Legacy issue-only compatibility alias for `PAPERCLIP_TASK_KEY`; present only on true issue-scoped runs during migration |
| `PAPERCLIP_WAKE_REASON` | Why the agent was woken (e.g. `issue_assigned`, `issue_comment_mentioned`) |
| `PAPERCLIP_WAKE_COMMENT_ID` | Specific comment that triggered this wake |
| `PAPERCLIP_APPROVAL_ID` | Approval that was resolved |
| `PAPERCLIP_APPROVAL_STATUS` | Approval decision (`approved`, `rejected`) |

Scope-aware code should prefer `PAPERCLIP_TASK_KEY`. Do not assume `PAPERCLIP_TASK_ID` exists on conversation-scoped or other non-issue runs.

## Session Persistence

Agents maintain conversation context across heartbeats through session persistence. The adapter serializes session state (e.g. Claude Code session ID) after each run and restores it on the next wake. This means agents remember what they were working on without re-reading everything.

## Agent Status

| Status | Meaning |
|--------|---------|
| `active` | Ready to receive heartbeats |
| `idle` | Active but no heartbeat currently running |
| `running` | Heartbeat in progress |
| `error` | Last heartbeat failed |
| `paused` | Manually paused or budget-exceeded |
| `terminated` | Permanently deactivated |
