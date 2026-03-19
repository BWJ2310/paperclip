import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agentTargetConversationMemory,
  agents,
  conversationMessageRefs,
  conversationMessages,
  conversationParticipants,
  conversationTargetLinks,
  conversationTargetSuppressions,
  conversations,
} from "@paperclipai/db";
import type {
  ConversationParticipant,
  ConversationTargetKind,
  LinkedConversationSummary,
} from "@paperclipai/shared";

const MAX_MEMORY_MESSAGES = 50;
const MAX_MESSAGE_EXCERPT_CHARS = 400;

export type ConversationViewer =
  | { type: "board"; userId: string | null }
  | { type: "agent"; agentId: string };

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractAgentModel(adapterConfig: unknown) {
  return asNonEmptyString(asRecord(adapterConfig)?.model);
}

function extractAgentThinkingEffort(
  adapterType: string,
  adapterConfig: unknown,
) {
  const config = asRecord(adapterConfig);
  if (!config) return null;
  if (adapterType === "codex_local") {
    return (
      asNonEmptyString(config.modelReasoningEffort) ??
      asNonEmptyString(config.reasoningEffort)
    );
  }
  if (adapterType === "cursor") {
    return asNonEmptyString(config.mode);
  }
  if (adapterType === "opencode_local") {
    return asNonEmptyString(config.variant);
  }
  return asNonEmptyString(config.effort);
}

function buildAuthorLabel(input: {
  authorType: string;
  authorUserId: string | null;
  authorAgentId: string | null;
  agentNames: Map<string, string>;
}) {
  if (input.authorType === "agent" && input.authorAgentId) {
    return input.agentNames.get(input.authorAgentId) ?? `Agent ${input.authorAgentId}`;
  }
  if (input.authorType === "user" && input.authorUserId) {
    return input.authorUserId === "local-board" ? "Board" : `Board ${input.authorUserId}`;
  }
  return "System";
}

function formatLinkedConversationsSection(input: Array<{
  conversationId: string;
  title: string;
  latestLinkedMessageSequence: number;
  latestLinkedAt: Date | null;
}>) {
  const lines = ["## Linked conversations"];
  for (const row of input) {
    const timestamp = row.latestLinkedAt ? row.latestLinkedAt.toISOString() : "unknown";
    lines.push(
      `- ${row.title} (${row.conversationId}) - latest linked sequence ${row.latestLinkedMessageSequence} at ${timestamp}`,
    );
  }
  if (input.length === 0) {
    lines.push("- None");
  }
  return lines.join("\n");
}

function formatRelevantMessagesSection(input: Array<{
  conversationTitle: string;
  sequence: number;
  authorLabel: string;
  createdAt: Date;
  bodyMarkdown: string;
}>) {
  const lines = ["## Relevant target-stamped messages"];
  if (input.length === 0) {
    lines.push("- None");
    return lines.join("\n");
  }

  for (const row of input) {
    lines.push(
      `### ${row.conversationTitle} | #${row.sequence} | ${row.authorLabel} | ${row.createdAt.toISOString()}`,
    );
    lines.push("");
    lines.push(normalizeWhitespace(row.bodyMarkdown).slice(0, MAX_MESSAGE_EXCERPT_CHARS));
    lines.push("");
  }

  return lines.join("\n");
}

function formatOverflowSection(overflowCount: number) {
  return [
    "## Overflow",
    overflowCount > 0
      ? `${overflowCount} older source message(s) were omitted from this memory build.`
      : "No older source messages were omitted.",
  ].join("\n");
}

export async function listConversationParticipants(
  db: Db,
  conversationIds: string[],
): Promise<Map<string, ConversationParticipant[]>> {
  if (conversationIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: conversationParticipants.id,
      companyId: conversationParticipants.companyId,
      conversationId: conversationParticipants.conversationId,
      agentId: conversationParticipants.agentId,
      agentIcon: agents.icon,
      agentName: agents.name,
      agentAdapterType: agents.adapterType,
      agentAdapterConfig: agents.adapterConfig,
      agentRole: agents.role,
      agentTitle: agents.title,
      agentStatus: agents.status,
      joinedAt: conversationParticipants.joinedAt,
      createdAt: conversationParticipants.createdAt,
      updatedAt: conversationParticipants.updatedAt,
    })
    .from(conversationParticipants)
    .innerJoin(agents, eq(conversationParticipants.agentId, agents.id))
    .where(inArray(conversationParticipants.conversationId, conversationIds))
    .orderBy(asc(conversationParticipants.joinedAt), asc(conversationParticipants.id));

  const map = new Map<string, ConversationParticipant[]>();
  for (const row of rows) {
    const participant: ConversationParticipant = {
      id: row.id,
      companyId: row.companyId,
      conversationId: row.conversationId,
      agentId: row.agentId,
      agentIcon: row.agentIcon,
      agentName: row.agentName,
      agentRole: row.agentRole,
      agentTitle: row.agentTitle,
      agentStatus: row.agentStatus,
      agentModel: extractAgentModel(row.agentAdapterConfig),
      agentThinkingEffort: extractAgentThinkingEffort(
        row.agentAdapterType,
        row.agentAdapterConfig,
      ),
      joinedAt: row.joinedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    const existing = map.get(row.conversationId) ?? [];
    existing.push(participant);
    map.set(row.conversationId, existing);
  }
  return map;
}

export function conversationMemoryService(db: Db) {
  async function rebuildForTarget(
    companyId: string,
    agentId: string,
    targetKind: ConversationTargetKind,
    targetId: string,
  ) {
    const linkRows = await db
      .select({
        conversationId: conversationTargetLinks.conversationId,
        title: conversations.title,
        latestLinkedMessageSequence: conversationTargetLinks.latestLinkedMessageSequence,
        latestLinkedAt: conversationTargetLinks.updatedAt,
      })
      .from(conversationTargetLinks)
      .innerJoin(conversations, eq(conversationTargetLinks.conversationId, conversations.id))
      .where(
        and(
          eq(conversationTargetLinks.companyId, companyId),
          eq(conversationTargetLinks.agentId, agentId),
          eq(conversationTargetLinks.targetKind, targetKind),
          eq(conversationTargetLinks.targetId, targetId),
        ),
      )
      .orderBy(asc(conversations.title), asc(conversations.id));

    if (linkRows.length === 0) {
      await db
        .delete(agentTargetConversationMemory)
        .where(
          and(
            eq(agentTargetConversationMemory.companyId, companyId),
            eq(agentTargetConversationMemory.agentId, agentId),
            eq(agentTargetConversationMemory.targetKind, targetKind),
            eq(agentTargetConversationMemory.targetId, targetId),
          ),
        );
      return null;
    }

    const conversationIds = linkRows.map((row) => row.conversationId);
    const suppressions = await db
      .select({
        conversationId: conversationTargetSuppressions.conversationId,
        suppressedThroughMessageSequence:
          conversationTargetSuppressions.suppressedThroughMessageSequence,
      })
      .from(conversationTargetSuppressions)
      .where(
        and(
          eq(conversationTargetSuppressions.companyId, companyId),
          eq(conversationTargetSuppressions.agentId, agentId),
          eq(conversationTargetSuppressions.targetKind, targetKind),
          eq(conversationTargetSuppressions.targetId, targetId),
          inArray(conversationTargetSuppressions.conversationId, conversationIds),
        ),
      );
    const suppressionByConversationId = new Map(
      suppressions.map((row) => [row.conversationId, row.suppressedThroughMessageSequence]),
    );

    const refRows = await db
      .select({
        messageId: conversationMessages.id,
        conversationId: conversationMessages.conversationId,
        sequence: conversationMessages.sequence,
        createdAt: conversationMessages.createdAt,
        bodyMarkdown: conversationMessages.bodyMarkdown,
        authorType: conversationMessages.authorType,
        authorUserId: conversationMessages.authorUserId,
        authorAgentId: conversationMessages.authorAgentId,
        conversationTitle: conversations.title,
      })
      .from(conversationMessageRefs)
      .innerJoin(conversationMessages, eq(conversationMessageRefs.messageId, conversationMessages.id))
      .innerJoin(conversations, eq(conversationMessages.conversationId, conversations.id))
      .where(
        and(
          eq(conversationMessageRefs.companyId, companyId),
          eq(conversationMessageRefs.refKind, targetKind),
          eq(conversationMessageRefs.targetId, targetId),
          inArray(conversationMessages.conversationId, conversationIds),
        ),
      )
      .orderBy(
        asc(conversationMessages.createdAt),
        asc(conversationMessages.conversationId),
        asc(conversationMessages.sequence),
      );

    const linkedMessageMap = new Map<string, (typeof refRows)[number]>();
    for (const row of refRows) {
      const cutoff = suppressionByConversationId.get(row.conversationId);
      if (typeof cutoff === "number" && row.sequence <= cutoff) continue;
      if (!linkedMessageMap.has(row.messageId)) {
        linkedMessageMap.set(row.messageId, row);
      }
    }

    const linkedMessages = [...linkedMessageMap.values()];
    const sourceMessages = linkedMessages.filter(
      (row) => normalizeWhitespace(row.bodyMarkdown).length > 0,
    );

    const authorAgentIds = [
      ...new Set(
        sourceMessages
          .map((row) => row.authorAgentId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const authorAgentRows =
      authorAgentIds.length > 0
        ? await db
            .select({ id: agents.id, name: agents.name })
            .from(agents)
            .where(inArray(agents.id, authorAgentIds))
        : [];
    const agentNames = new Map(authorAgentRows.map((row) => [row.id, row.name]));

    const includedMessages = sourceMessages.slice(-MAX_MEMORY_MESSAGES);
    const overflowCount = Math.max(0, sourceMessages.length - includedMessages.length);
    const lastSourceMessage = sourceMessages[sourceMessages.length - 1] ?? null;
    const memoryMarkdown = [
      formatLinkedConversationsSection(linkRows),
      "",
      formatRelevantMessagesSection(
        includedMessages.map((row) => ({
          conversationTitle: row.conversationTitle,
          sequence: row.sequence,
          authorLabel: buildAuthorLabel({
            authorType: row.authorType,
            authorUserId: row.authorUserId,
            authorAgentId: row.authorAgentId,
            agentNames,
          }),
          createdAt: row.createdAt,
          bodyMarkdown: row.bodyMarkdown,
        })),
      ),
      "",
      formatOverflowSection(overflowCount),
    ].join("\n");

    const [memory] = await db
      .insert(agentTargetConversationMemory)
      .values({
        companyId,
        agentId,
        targetKind,
        targetId,
        memoryMarkdown,
        buildStatus: "ready",
        linkedConversationCount: linkRows.length,
        linkedMessageCount: linkedMessages.length,
        sourceMessageCount: sourceMessages.length,
        lastSourceMessageSequence: lastSourceMessage?.sequence ?? 0,
        latestSourceMessageAt: lastSourceMessage?.createdAt ?? null,
        lastBuildError: null,
        lastRebuiltAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          agentTargetConversationMemory.agentId,
          agentTargetConversationMemory.targetKind,
          agentTargetConversationMemory.targetId,
        ],
        set: {
          memoryMarkdown,
          buildStatus: "ready",
          linkedConversationCount: linkRows.length,
          linkedMessageCount: linkedMessages.length,
          sourceMessageCount: sourceMessages.length,
          lastSourceMessageSequence: lastSourceMessage?.sequence ?? 0,
          latestSourceMessageAt: lastSourceMessage?.createdAt ?? null,
          lastBuildError: null,
          lastRebuiltAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    return memory ?? null;
  }

  async function rebuildForPairs(
    companyId: string,
    pairs: Array<{ agentId: string; targetKind: ConversationTargetKind; targetId: string }>,
  ) {
    const deduped = new Map<string, { agentId: string; targetKind: ConversationTargetKind; targetId: string }>();
    for (const pair of pairs) {
      deduped.set(`${pair.agentId}:${pair.targetKind}:${pair.targetId}`, pair);
    }
    for (const pair of deduped.values()) {
      await rebuildForTarget(companyId, pair.agentId, pair.targetKind, pair.targetId);
    }
  }

  async function listLinkedConversations(input: {
    companyId: string;
    targetKind: ConversationTargetKind;
    targetId: string;
    viewer: ConversationViewer;
  }): Promise<LinkedConversationSummary[]> {
    const rows = await db
      .select({
        conversationId: conversationTargetLinks.conversationId,
        title: conversations.title,
        latestLinkedMessageId: conversationTargetLinks.latestLinkedMessageId,
        latestLinkedMessageSequence: conversationTargetLinks.latestLinkedMessageSequence,
        latestLinkedAt: conversationTargetLinks.updatedAt,
        linkAgentId: conversationTargetLinks.agentId,
      })
      .from(conversationTargetLinks)
      .innerJoin(conversations, eq(conversationTargetLinks.conversationId, conversations.id))
      .where(
        and(
          eq(conversationTargetLinks.companyId, input.companyId),
          eq(conversationTargetLinks.targetKind, input.targetKind),
          eq(conversationTargetLinks.targetId, input.targetId),
          input.viewer.type === "agent"
            ? eq(conversationTargetLinks.agentId, input.viewer.agentId)
            : undefined,
        ),
      )
      .orderBy(desc(conversationTargetLinks.latestLinkedMessageSequence), asc(conversationTargetLinks.conversationId));

    const aggregated = new Map<string, LinkedConversationSummary>();
    for (const row of rows) {
      const existing = aggregated.get(row.conversationId);
      if (
        existing &&
        existing.latestLinkedMessageSequence >= row.latestLinkedMessageSequence
      ) {
        continue;
      }
      aggregated.set(row.conversationId, {
        id: row.conversationId,
        title: row.title,
        participants: [],
        latestLinkedMessageId: row.latestLinkedMessageId,
        latestLinkedMessageSequence: row.latestLinkedMessageSequence,
        latestLinkedAt: row.latestLinkedAt,
      });
    }

    const conversationIds = [...aggregated.keys()];
    if (conversationIds.length === 0) return [];

    if (input.viewer.type === "agent") {
      const visibleConversationIds = await db
        .select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants)
        .where(
          and(
            inArray(conversationParticipants.conversationId, conversationIds),
            eq(conversationParticipants.agentId, input.viewer.agentId),
          ),
        )
        .then((result) => new Set(result.map((row) => row.conversationId)));
      for (const conversationId of conversationIds) {
        if (!visibleConversationIds.has(conversationId)) {
          aggregated.delete(conversationId);
        }
      }
    }

    const participantsByConversationId = await listConversationParticipants(db, [...aggregated.keys()]);
    for (const [conversationId, summary] of aggregated.entries()) {
      summary.participants = participantsByConversationId.get(conversationId) ?? [];
    }

    return [...aggregated.values()].sort((left, right) => {
      if (left.latestLinkedAt && right.latestLinkedAt) {
        const delta = right.latestLinkedAt.getTime() - left.latestLinkedAt.getTime();
        if (delta !== 0) return delta;
      } else if (left.latestLinkedAt) {
        return -1;
      } else if (right.latestLinkedAt) {
        return 1;
      }
      return left.id.localeCompare(right.id);
    });
  }

  return {
    rebuildForTarget,
    rebuildForPairs,
    listLinkedConversations,
  };
}
