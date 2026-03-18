import { isUuidLike } from "./agent-url-key.js";

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export interface ParsedTaskKey {
  kind: string;
  id: string;
  raw: string;
}

export function buildTaskKey(
  kind: string,
  id: string | null | undefined
): string | null {
  const normalizedKind = readNonEmptyString(kind);
  const normalizedId = readNonEmptyString(id);
  if (!normalizedKind || !normalizedId) return null;
  return `${normalizedKind}:${normalizedId}`;
}

export function buildIssueTaskKey(
  issueId: string | null | undefined
): string | null {
  return buildTaskKey("issue", issueId);
}

export function buildGoalTaskKey(
  goalId: string | null | undefined
): string | null {
  return buildTaskKey("goal", goalId);
}

export function buildProjectTaskKey(
  projectId: string | null | undefined
): string | null {
  return buildTaskKey("project", projectId);
}

export function buildConversationTaskKey(
  conversationId: string | null | undefined
): string | null {
  return buildTaskKey("conversation", conversationId);
}

export function parseTaskKey(
  taskKey: string | null | undefined
): ParsedTaskKey | null {
  const normalizedTaskKey = readNonEmptyString(taskKey);
  if (!normalizedTaskKey) return null;

  const delimiterIndex = normalizedTaskKey.indexOf(":");
  if (delimiterIndex <= 0 || delimiterIndex >= normalizedTaskKey.length - 1) {
    return null;
  }

  return {
    kind: normalizedTaskKey.slice(0, delimiterIndex),
    id: normalizedTaskKey.slice(delimiterIndex + 1),
    raw: normalizedTaskKey,
  };
}

export function readIssueIdFromTaskKey(
  taskKey: string | null | undefined
): string | null {
  const parsed = parseTaskKey(taskKey);
  if (!parsed || parsed.kind !== "issue") return null;
  return parsed.id;
}

export function deriveCanonicalTaskKey(
  scope:
    | {
        taskKey?: unknown;
        issueId?: unknown;
        taskId?: unknown;
      }
    | null
    | undefined
): string | null {
  const taskKey = readNonEmptyString(scope?.taskKey);
  if (taskKey) {
    const parsedTaskKey = parseTaskKey(taskKey);
    if (parsedTaskKey) return parsedTaskKey.raw;
    if (isUuidLike(taskKey)) return buildIssueTaskKey(taskKey);
    return taskKey;
  }

  const issueId =
    readNonEmptyString(scope?.issueId) ?? readNonEmptyString(scope?.taskId);
  if (issueId) return buildIssueTaskKey(issueId);

  return null;
}
