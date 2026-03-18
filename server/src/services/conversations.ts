import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agentTaskSessions,
  agentWakeupRequests,
  agents,
  conversationMessageRefs,
  conversationMessages,
  conversationParticipants,
  conversationReadStates,
  conversationTargetLinks,
  conversationTargetSuppressions,
  conversations,
  goals,
  heartbeatRuns,
  issues,
  projects,
} from "@paperclipai/db";
import {
  buildConversationTaskKey,
  extractStructuredMentionTokens,
  type ConversationActiveContextTarget,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationMessagePage,
  type ConversationMessageRef,
  type ConversationParticipant,
  type ConversationReadState,
  type ConversationSummary,
  type ConversationTargetLink,
  type ConversationTargetKind,
  type ListConversationMessagesQuery,
} from "@paperclipai/shared";
import { conflict, forbidden, notFound, unprocessable } from "../errors.js";
import { logActivity } from "./activity-log.js";
import { publishLiveEvent } from "./live-events.js";
import {
  conversationMemoryService,
  listConversationParticipants,
  type ConversationViewer,
} from "./conversation-memory.js";
import { costService } from "./costs.js";
import { heartbeatService } from "./heartbeat.js";

type ConversationActorContext =
  | {
      viewerType: "board";
      actorType: "user";
      actorId: string;
      agentId: null;
      runId: string | null;
    }
  | {
      viewerType: "agent";
      actorType: "agent";
      actorId: string;
      agentId: string;
      runId: string | null;
    };

type ConversationRow = typeof conversations.$inferSelect;

function toViewer(actor: ConversationActorContext): ConversationViewer {
  return actor.viewerType === "agent"
    ? { type: "agent", agentId: actor.agentId }
    : { type: "board", userId: actor.actorId };
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeMessageBody(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function parseStructuredRefs(markdown: string): Array<{
  refKind: "agent" | "issue" | "goal" | "project";
  targetId: string;
  displayText: string;
  refOrigin: "inline_mention";
}> {
  return extractStructuredMentionTokens(markdown).map((token) => ({
    refKind: token.kind,
    targetId: token.targetId,
    displayText: token.displayText,
    refOrigin: "inline_mention",
  }));
}

function dedupeTargetRefs(input: Array<{
  refKind: "issue" | "goal" | "project";
  targetId: string;
  displayText: string;
  refOrigin: "inline_mention" | "active_context";
}>) {
  const map = new Map<string, (typeof input)[number]>();
  for (const ref of input) {
    const key = `${ref.refKind}:${ref.targetId}`;
    const existing = map.get(key);
    if (!existing || ref.refOrigin === "inline_mention") {
      map.set(key, ref);
    }
  }
  return [...map.values()];
}

function singleTargetFromRefs(
  refs: ConversationMessageRef[],
): { targetKind: ConversationTargetKind; targetId: string } | null {
  const targetRefs = refs.filter(
    (ref) => ref.refKind === "issue" || ref.refKind === "goal" || ref.refKind === "project",
  );
  if (targetRefs.length !== 1) return null;
  return {
    targetKind: targetRefs[0]!.refKind as ConversationTargetKind,
    targetId: targetRefs[0]!.targetId,
  };
}

function hydrateMessages(
  rows: Array<typeof conversationMessages.$inferSelect>,
  refsByMessageId: Map<string, ConversationMessageRef[]>,
): ConversationMessage[] {
  return rows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    conversationId: row.conversationId,
    sequence: row.sequence,
    authorType: row.authorType as ConversationMessage["authorType"],
    authorUserId: row.authorUserId,
    authorAgentId: row.authorAgentId,
    runId: row.runId,
    bodyMarkdown: row.bodyMarkdown,
    refs: refsByMessageId.get(row.id) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export function conversationService(db: Db) {
  const memory = conversationMemoryService(db);
  const costs = costService(db);

  async function getConversationRow(conversationId: string) {
    return db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .then((rows) => rows[0] ?? null);
  }

  async function getConversationParticipantAgentIds(conversationId: string) {
    const rows = await db
      .select({ agentId: conversationParticipants.agentId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));
    return rows.map((row) => row.agentId);
  }

  async function ensureConversationVisible(
    conversationId: string,
    actor: ConversationActorContext,
  ) {
    const conversation = await getConversationRow(conversationId);
    if (!conversation) throw notFound("Conversation not found");
    if (actor.viewerType === "agent") {
      const participant = await db
        .select({ id: conversationParticipants.id })
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.agentId, actor.agentId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (!participant) throw forbidden("Conversation access denied");
    }
    return conversation;
  }

  async function ensureParticipantAgents(
    companyId: string,
    agentIds: string[],
  ) {
    if (agentIds.length === 0) return [];
    const rows = await db
      .select({
        id: agents.id,
        companyId: agents.companyId,
      })
      .from(agents)
      .where(inArray(agents.id, agentIds));
    const rowById = new Map(rows.map((row) => [row.id, row]));
    for (const agentId of agentIds) {
      const row = rowById.get(agentId);
      if (!row || row.companyId !== companyId) {
        throw unprocessable("Conversation participants must belong to the same company");
      }
    }
    return rows;
  }

  async function ensureMessageTargetsExist(
    companyId: string,
    participantAgentIds: string[],
    inlineRefs: Array<{
      refKind: "agent" | "issue" | "goal" | "project";
      targetId: string;
      displayText: string;
      refOrigin: "inline_mention";
    }>,
    activeContextTargets: ConversationActiveContextTarget[],
  ) {
    const targetRefs = dedupeTargetRefs([
      ...inlineRefs
        .filter((ref) => ref.refKind !== "agent")
        .map((ref) => ({
          refKind: ref.refKind as "issue" | "goal" | "project",
          targetId: ref.targetId,
          displayText: ref.displayText,
          refOrigin: ref.refOrigin,
        })),
      ...activeContextTargets.map((target) => ({
        refKind: target.targetKind,
        targetId: target.targetId,
        displayText: target.displayText,
        refOrigin: "active_context" as const,
      })),
    ]);

    for (const ref of inlineRefs) {
      if (ref.refKind === "agent" && !participantAgentIds.includes(ref.targetId)) {
        throw unprocessable("Agent mentions must target current conversation participants");
      }
    }

    const issueIds = targetRefs.filter((ref) => ref.refKind === "issue").map((ref) => ref.targetId);
    const goalIds = targetRefs.filter((ref) => ref.refKind === "goal").map((ref) => ref.targetId);
    const projectIds = targetRefs.filter((ref) => ref.refKind === "project").map((ref) => ref.targetId);

    if (issueIds.length > 0) {
      const rows = await db
        .select({ id: issues.id })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), inArray(issues.id, issueIds)));
      if (rows.length !== issueIds.length) {
        throw unprocessable("Conversation issue refs must belong to the same company");
      }
    }
    if (goalIds.length > 0) {
      const rows = await db
        .select({ id: goals.id })
        .from(goals)
        .where(and(eq(goals.companyId, companyId), inArray(goals.id, goalIds)));
      if (rows.length !== goalIds.length) {
        throw unprocessable("Conversation goal refs must belong to the same company");
      }
    }
    if (projectIds.length > 0) {
      const rows = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.companyId, companyId), inArray(projects.id, projectIds)));
      if (rows.length !== projectIds.length) {
        throw unprocessable("Conversation project refs must belong to the same company");
      }
    }

    return targetRefs;
  }

  async function loadLatestMessageAt(conversationIds: string[]) {
    if (conversationIds.length === 0) return new Map<string, Date | null>();
    const rows = await db
      .select({
        conversationId: conversationMessages.conversationId,
        latestMessageAt: max(conversationMessages.createdAt),
      })
      .from(conversationMessages)
      .where(inArray(conversationMessages.conversationId, conversationIds))
      .groupBy(conversationMessages.conversationId);
    return new Map(rows.map((row) => [row.conversationId, row.latestMessageAt]));
  }

  async function loadViewerReadStates(
    companyId: string,
    conversationIds: string[],
    actor: ConversationActorContext,
  ) {
    if (conversationIds.length === 0) return new Map<string, ConversationReadState>();
    const rows = await db
      .select()
      .from(conversationReadStates)
      .where(
        actor.viewerType === "agent"
          ? and(
              eq(conversationReadStates.companyId, companyId),
              inArray(conversationReadStates.conversationId, conversationIds),
              eq(conversationReadStates.agentId, actor.agentId),
            )
          : and(
              eq(conversationReadStates.companyId, companyId),
              inArray(conversationReadStates.conversationId, conversationIds),
              eq(conversationReadStates.userId, actor.actorId),
            ),
      );

    return new Map(
      rows.map((row) => [
        row.conversationId,
        {
          id: row.id,
          companyId: row.companyId,
          conversationId: row.conversationId,
          userId: row.userId,
          agentId: row.agentId,
          lastReadSequence: row.lastReadSequence,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        } satisfies ConversationReadState,
      ]),
    );
  }

  async function hydrateSummaries(
    rows: ConversationRow[],
    actor: ConversationActorContext,
  ): Promise<ConversationSummary[]> {
    const conversationIds = rows.map((row) => row.id);
    const participantsByConversationId = await listConversationParticipants(db, conversationIds);
    const latestMessageAtByConversationId = await loadLatestMessageAt(conversationIds);
    const readStateByConversationId = await loadViewerReadStates(
      rows[0]?.companyId ?? "",
      conversationIds,
      actor,
    );

    return rows.map((row) => {
      const readState = readStateByConversationId.get(row.id);
      return {
        id: row.id,
        companyId: row.companyId,
        title: row.title,
        status: row.status as ConversationSummary["status"],
        participants: participantsByConversationId.get(row.id) ?? [],
        latestMessageSequence: row.lastMessageSequence,
        latestMessageAt: latestMessageAtByConversationId.get(row.id) ?? null,
        unreadCount: Math.max(0, row.lastMessageSequence - (readState?.lastReadSequence ?? 0)),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  async function loadMessageRefs(messageIds: string[]) {
    if (messageIds.length === 0) return new Map<string, ConversationMessageRef[]>();
    const rows = await db
      .select()
      .from(conversationMessageRefs)
      .where(inArray(conversationMessageRefs.messageId, messageIds))
      .orderBy(asc(conversationMessageRefs.createdAt), asc(conversationMessageRefs.id));

    const refsByMessageId = new Map<string, ConversationMessageRef[]>();
    for (const row of rows) {
      const ref: ConversationMessageRef = {
        id: row.id,
        companyId: row.companyId,
        messageId: row.messageId,
        refKind: row.refKind as ConversationMessageRef["refKind"],
        targetId: row.targetId,
        displayText: row.displayText,
        refOrigin: row.refOrigin as ConversationMessageRef["refOrigin"],
        createdAt: row.createdAt,
      };
      const existing = refsByMessageId.get(row.messageId) ?? [];
      existing.push(ref);
      refsByMessageId.set(row.messageId, existing);
    }
    return refsByMessageId;
  }

  async function loadConversationTargetLinks(
    companyId: string,
    conversationId: string,
    actor: ConversationActorContext,
  ): Promise<ConversationTargetLink[]> {
    const rows = await db
      .select()
      .from(conversationTargetLinks)
      .where(
        and(
          eq(conversationTargetLinks.companyId, companyId),
          eq(conversationTargetLinks.conversationId, conversationId),
          actor.viewerType === "agent"
            ? eq(conversationTargetLinks.agentId, actor.agentId)
            : undefined,
        ),
      )
      .orderBy(
        asc(conversationTargetLinks.targetKind),
        asc(conversationTargetLinks.targetId),
        asc(conversationTargetLinks.agentId),
      );

    const latestLinkedMessageIds = [...new Set(rows.map((row) => row.latestLinkedMessageId))];
    const refsByTargetKey = new Map<string, string>();
    if (latestLinkedMessageIds.length > 0) {
      const refs = await db
        .select()
        .from(conversationMessageRefs)
        .where(
          and(
            eq(conversationMessageRefs.companyId, companyId),
            inArray(conversationMessageRefs.messageId, latestLinkedMessageIds),
          ),
        );
      for (const ref of refs) {
        refsByTargetKey.set(
          `${ref.messageId}:${ref.refKind}:${ref.targetId}`,
          ref.displayText,
        );
      }
    }

    return rows.map((row) => ({
      id: row.id,
      companyId: row.companyId,
      agentId: row.agentId,
      conversationId: row.conversationId,
      targetKind: row.targetKind as ConversationTargetKind,
      targetId: row.targetId,
      displayText:
        refsByTargetKey.get(
          `${row.latestLinkedMessageId}:${row.targetKind}:${row.targetId}`,
        ) ?? null,
      linkOrigin: row.linkOrigin as ConversationTargetLink["linkOrigin"],
      latestLinkedMessageId: row.latestLinkedMessageId,
      latestLinkedMessageSequence: row.latestLinkedMessageSequence,
      createdByActorType:
        row.createdByActorType as ConversationTargetLink["createdByActorType"],
      createdByActorId: row.createdByActorId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async function markReadInternal(
    companyId: string,
    conversationId: string,
    actor: ConversationActorContext,
    lastReadSequence: number,
  ) {
    const existing = await db
      .select()
      .from(conversationReadStates)
      .where(
        actor.viewerType === "agent"
          ? and(
              eq(conversationReadStates.companyId, companyId),
              eq(conversationReadStates.conversationId, conversationId),
              eq(conversationReadStates.agentId, actor.agentId),
            )
          : and(
              eq(conversationReadStates.companyId, companyId),
              eq(conversationReadStates.conversationId, conversationId),
              eq(conversationReadStates.userId, actor.actorId),
            ),
      )
      .then((rows) => rows[0] ?? null);

    const nextSequence = Math.max(existing?.lastReadSequence ?? 0, lastReadSequence);
    const now = new Date();
    const row = existing
      ? await db
          .update(conversationReadStates)
          .set({
            lastReadSequence: nextSequence,
            updatedAt: now,
          })
          .where(eq(conversationReadStates.id, existing.id))
          .returning()
          .then((rows) => rows[0] ?? null)
      : await db
          .insert(conversationReadStates)
          .values({
            companyId,
            conversationId,
            userId: actor.viewerType === "board" ? actor.actorId : null,
            agentId: actor.viewerType === "agent" ? actor.agentId : null,
            lastReadSequence: nextSequence,
            updatedAt: now,
          })
          .returning()
          .then((rows) => rows[0] ?? null);

    if (!row) throw conflict("Unable to update conversation read state");

    return {
      id: row.id,
      companyId: row.companyId,
      conversationId: row.conversationId,
      userId: row.userId,
      agentId: row.agentId,
      lastReadSequence: row.lastReadSequence,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } satisfies ConversationReadState;
  }

  async function publishConversationSummaryEvent(
    type: "conversation.created" | "conversation.updated",
    conversation: ConversationRow,
    participantAgentIds: string[],
  ) {
    publishLiveEvent({
      companyId: conversation.companyId,
      type,
      audience: {
        scope: "conversationParticipants",
        conversationId: conversation.id,
        participantAgentIds,
      },
      payload: {
        conversationId: conversation.id,
        title: conversation.title,
        status: conversation.status,
        participantAgentIds,
        latestMessageSequence: conversation.lastMessageSequence,
        latestActivityAt: conversation.updatedAt.toISOString(),
      },
    });
  }

  async function getDetail(
    conversationId: string,
    actor: ConversationActorContext,
  ): Promise<ConversationDetail> {
    const conversation = await ensureConversationVisible(conversationId, actor);
    const [summary] = await hydrateSummaries([conversation], actor);
    const [costSummary, viewerReadStateMap, targetLinks] = await Promise.all([
      costs.forConversation(conversation.companyId, conversation.id),
      loadViewerReadStates(conversation.companyId, [conversation.id], actor),
      loadConversationTargetLinks(conversation.companyId, conversation.id, actor),
    ]);

    return {
      ...summary,
      costSummary,
      viewerReadState: viewerReadStateMap.get(conversation.id) ?? null,
      targetLinks,
    };
  }

  return {
    getVisibleConversation: ensureConversationVisible,

    list: async (
      companyId: string,
      actor: ConversationActorContext,
      query: { status?: "active" | "archived" | "all"; limit?: number },
    ) => {
      const visibleConversationIds =
        actor.viewerType === "agent"
          ? await db
              .select({ conversationId: conversationParticipants.conversationId })
              .from(conversationParticipants)
              .where(eq(conversationParticipants.agentId, actor.agentId))
              .then((rows) => rows.map((row) => row.conversationId))
          : null;

      if (actor.viewerType === "agent" && (!visibleConversationIds || visibleConversationIds.length === 0)) {
        return [] as ConversationSummary[];
      }

      const rows = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.companyId, companyId),
            query.status && query.status !== "all"
              ? eq(conversations.status, query.status)
              : undefined,
            actor.viewerType === "agent"
              ? inArray(conversations.id, visibleConversationIds!)
              : undefined,
          ),
        )
        .orderBy(desc(conversations.updatedAt), desc(conversations.id))
        .limit(Math.max(1, Math.min(query.limit ?? 50, 100)));

      return hydrateSummaries(rows, actor);
    },

    getDetail,

    create: async (
      companyId: string,
      actor: ConversationActorContext,
      input: { title: string; participantAgentIds: string[] },
    ) => {
      if (actor.viewerType !== "board") {
        throw forbidden("Agents cannot create conversations directly");
      }
      await ensureParticipantAgents(companyId, input.participantAgentIds);

      const now = new Date();
      const conversation = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(conversations)
          .values({
            companyId,
            title: input.title,
            createdByUserId: actor.actorId,
            updatedAt: now,
          })
          .returning();

        if (input.participantAgentIds.length > 0) {
          await tx.insert(conversationParticipants).values(
            input.participantAgentIds.map((agentId) => ({
              companyId,
              conversationId: created!.id,
              agentId,
              joinedAt: now,
              updatedAt: now,
            })),
          );
        }

        return created!;
      });

      const detail = await getDetail(conversation.id, actor);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "conversation.created",
        entityType: "conversation",
        entityId: conversation.id,
        audience: {
          scope: "conversationParticipants",
          conversationId: conversation.id,
          participantAgentIds: detail.participants.map((participant) => participant.agentId),
        },
        details: { title: conversation.title },
      });
      await publishConversationSummaryEvent(
        "conversation.created",
        conversation,
        detail.participants.map((participant) => participant.agentId),
      );
      return detail;
    },

    update: async (
      conversationId: string,
      actor: ConversationActorContext,
      patch: { title?: string; status?: "active" | "archived" },
    ) => {
      if (actor.viewerType !== "board") throw forbidden("Board access required");
      const conversation = await getConversationRow(conversationId);
      if (!conversation) throw notFound("Conversation not found");

      const [updated] = await db
        .update(conversations)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId))
        .returning();
      if (!updated) throw notFound("Conversation not found");

      const participantAgentIds = await getConversationParticipantAgentIds(conversationId);
      await logActivity(db, {
        companyId: updated.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: patch.status === "archived" ? "conversation.archived" : "conversation.updated",
        entityType: "conversation",
        entityId: updated.id,
        audience: {
          scope: "conversationParticipants",
          conversationId: updated.id,
          participantAgentIds,
        },
        details: patch,
      });
      await publishConversationSummaryEvent("conversation.updated", updated, participantAgentIds);
      return getDetail(updated.id, actor);
    },

    addParticipant: async (
      conversationId: string,
      actor: ConversationActorContext,
      agentId: string,
    ) => {
      if (actor.viewerType !== "board") throw forbidden("Board access required");
      const conversation = await getConversationRow(conversationId);
      if (!conversation) throw notFound("Conversation not found");
      await ensureParticipantAgents(conversation.companyId, [agentId]);

      const existing = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.agentId, agentId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (existing) {
        const participantMap = await listConversationParticipants(db, [conversationId]);
        return participantMap.get(conversationId)?.find((participant) => participant.agentId === agentId) ?? null;
      }

      const now = new Date();
      await db.transaction(async (tx) => {
        await tx.insert(conversationParticipants).values({
          companyId: conversation.companyId,
          conversationId,
          agentId,
          joinedAt: now,
          updatedAt: now,
        });
        await tx
          .update(conversations)
          .set({ updatedAt: now })
          .where(eq(conversations.id, conversationId));
      });

      const participantMap = await listConversationParticipants(db, [conversationId]);
      const participant = participantMap.get(conversationId)?.find((row) => row.agentId === agentId) ?? null;
      if (!participant) throw conflict("Unable to add conversation participant");

      const participantAgentIds = await getConversationParticipantAgentIds(conversationId);
      await logActivity(db, {
        companyId: conversation.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "conversation.participant_added",
        entityType: "conversation",
        entityId: conversationId,
        audience: {
          scope: "conversationParticipants",
          conversationId,
          participantAgentIds,
        },
        details: { agentId },
      });
      publishLiveEvent({
        companyId: conversation.companyId,
        type: "conversation.participant_added",
        audience: {
          scope: "conversationParticipants",
          conversationId,
          participantAgentIds,
        },
        payload: {
          conversationId,
          agentId,
          participantAgentIds,
          latestActivityAt: now.toISOString(),
        },
      });
      return participant;
    },

    removeParticipant: async (
      conversationId: string,
      actor: ConversationActorContext,
      agentId: string,
    ) => {
      if (actor.viewerType !== "board") throw forbidden("Board access required");
      const conversation = await getConversationRow(conversationId);
      if (!conversation) throw notFound("Conversation not found");
      const conversationTaskKey = buildConversationTaskKey(conversationId);
      if (!conversationTaskKey) throw conflict("Conversation task key is required");
      const removed = await db.transaction(async (tx) => {
        const participant = await tx
          .select()
          .from(conversationParticipants)
          .where(
            and(
              eq(conversationParticipants.conversationId, conversationId),
              eq(conversationParticipants.agentId, agentId),
            ),
          )
          .then((rows) => rows[0] ?? null);
        if (!participant) return null;

        await tx.delete(conversationParticipants).where(eq(conversationParticipants.id, participant.id));
        await tx
          .delete(conversationReadStates)
          .where(
            and(
              eq(conversationReadStates.companyId, conversation.companyId),
              eq(conversationReadStates.conversationId, conversationId),
              eq(conversationReadStates.agentId, agentId),
            ),
          );
        const deletedLinks = await tx
          .delete(conversationTargetLinks)
          .where(
            and(
              eq(conversationTargetLinks.companyId, conversation.companyId),
              eq(conversationTargetLinks.conversationId, conversationId),
              eq(conversationTargetLinks.agentId, agentId),
            ),
          )
          .returning();

        await tx
          .delete(agentTaskSessions)
          .where(
            and(
              eq(agentTaskSessions.companyId, conversation.companyId),
              eq(agentTaskSessions.agentId, agentId),
              eq(agentTaskSessions.taskKey, conversationTaskKey),
            ),
          );
        await tx
          .update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, conversationId));

        const runIds = await tx
          .select({ id: heartbeatRuns.id })
          .from(heartbeatRuns)
          .where(
            and(
              eq(heartbeatRuns.companyId, conversation.companyId),
              eq(heartbeatRuns.agentId, agentId),
              inArray(heartbeatRuns.status, ["queued", "running"]),
              sql`${heartbeatRuns.contextSnapshot} ->> 'taskKey' = ${conversationTaskKey}`,
            ),
          );

        await tx
          .update(agentWakeupRequests)
          .set({
            status: "cancelled",
            error: "conversation_participant_removed",
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(agentWakeupRequests.companyId, conversation.companyId),
              eq(agentWakeupRequests.agentId, agentId),
              eq(agentWakeupRequests.conversationId, conversationId),
              eq(agentWakeupRequests.status, "queued"),
            ),
          );

        const remainingParticipantAgentIds = await tx
          .select({ agentId: conversationParticipants.agentId })
          .from(conversationParticipants)
          .where(eq(conversationParticipants.conversationId, conversationId))
          .then((rows) => rows.map((row) => row.agentId));

        return {
          participant,
          runIds: runIds.map((row) => row.id),
          affectedPairs: deletedLinks.map((row) => ({
            agentId: row.agentId,
            targetKind: row.targetKind as ConversationTargetKind,
            targetId: row.targetId,
          })),
          remainingParticipantAgentIds,
        };
      });

      if (!removed) throw notFound("Conversation participant not found");

      const heartbeat = heartbeatService(db);
      for (const runId of removed.runIds) {
        await heartbeat.cancelRun(runId, {
          error: "conversation_participant_removed",
          message:
            "run cancelled because the agent was removed from the conversation",
        });
      }
      await memory.rebuildForPairs(conversation.companyId, removed.affectedPairs);

      await logActivity(db, {
        companyId: conversation.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "conversation.participant_removed",
        entityType: "conversation",
        entityId: conversationId,
        audience: {
          scope: "conversationParticipants",
          conversationId,
          participantAgentIds: removed.remainingParticipantAgentIds,
        },
        details: { agentId },
      });
      publishLiveEvent({
        companyId: conversation.companyId,
        type: "conversation.participant_removed",
        audience: {
          scope: "conversationParticipants",
          conversationId,
          participantAgentIds: removed.remainingParticipantAgentIds,
        },
        payload: {
          conversationId,
          agentId,
          participantAgentIds: removed.remainingParticipantAgentIds,
          latestActivityAt: new Date().toISOString(),
        },
      });

      return { removedParticipantId: removed.participant.id };
    },

    listMessages: async (
      conversationId: string,
      actor: ConversationActorContext,
      query: ListConversationMessagesQuery,
    ): Promise<ConversationMessagePage> => {
      await ensureConversationVisible(conversationId, actor);

      const limit = Math.max(1, Math.min(query.limit ?? 50, 100));
      const normalizedQuery = readNonEmptyString(query.q);
      const aroundMessageId = readNonEmptyString(query.aroundMessageId);

      if (aroundMessageId) {
        const before = Math.max(0, Math.min(query.before ?? 20, 100));
        const after = Math.max(0, Math.min(query.after ?? 20, 100));
        const anchorMessage = await db
          .select()
          .from(conversationMessages)
          .where(
            and(
              eq(conversationMessages.id, aroundMessageId),
              eq(conversationMessages.conversationId, conversationId),
            ),
          )
          .then((rows) => rows[0] ?? null);
        if (!anchorMessage) {
          throw unprocessable("Anchor message must belong to the same conversation");
        }

        const rows = await db
          .select()
          .from(conversationMessages)
          .where(
            and(
              eq(conversationMessages.conversationId, conversationId),
              sql`${conversationMessages.sequence} >= ${Math.max(1, anchorMessage.sequence - before)}`,
              sql`${conversationMessages.sequence} <= ${anchorMessage.sequence + after}`,
            ),
          )
          .orderBy(asc(conversationMessages.sequence));

        const refsByMessageId = await loadMessageRefs(rows.map((row) => row.id));
        const messages = hydrateMessages(rows, refsByMessageId);
        const firstSequence = messages[0]?.sequence ?? null;
        const lastSequence = messages[messages.length - 1]?.sequence ?? null;
        const [olderRow, newerRow] = await Promise.all([
          firstSequence === null
            ? Promise.resolve(null)
            : db
                .select({ id: conversationMessages.id })
                .from(conversationMessages)
                .where(
                  and(
                    eq(conversationMessages.conversationId, conversationId),
                    sql`${conversationMessages.sequence} < ${firstSequence}`,
                  ),
                )
                .limit(1)
                .then((result) => result[0] ?? null),
          lastSequence === null
            ? Promise.resolve(null)
            : db
                .select({ id: conversationMessages.id })
                .from(conversationMessages)
                .where(
                  and(
                    eq(conversationMessages.conversationId, conversationId),
                    sql`${conversationMessages.sequence} > ${lastSequence}`,
                  ),
                )
                .limit(1)
                .then((result) => result[0] ?? null),
        ]);

        return {
          conversationId,
          messages,
          hasMoreBefore: olderRow !== null,
          hasMoreAfter: newerRow !== null,
        };
      }

      const baseFilters = [
        eq(conversationMessages.conversationId, conversationId),
        query.targetKind && query.targetId
          ? sql`exists (
              select 1
              from ${conversationMessageRefs}
              where ${conversationMessageRefs.messageId} = ${conversationMessages.id}
                and ${conversationMessageRefs.refKind} = ${query.targetKind}
                and ${conversationMessageRefs.targetId} = ${query.targetId}
            )`
          : undefined,
        normalizedQuery
          ? sql`${conversationMessages.bodyMarkdown} ILIKE ${`%${escapeLikePattern(normalizedQuery)}%`} ESCAPE '\\'`
          : undefined,
      ];

      const rows = await db
        .select()
        .from(conversationMessages)
        .where(
          and(
            ...baseFilters,
            query.beforeSequence
              ? sql`${conversationMessages.sequence} < ${query.beforeSequence}`
              : undefined,
          ),
        )
        .orderBy(desc(conversationMessages.sequence))
        .limit(limit + 1);

      const selectedRowsDesc = rows.slice(0, limit);
      const orderedRows = [...selectedRowsDesc].reverse();
      const refsByMessageId = await loadMessageRefs(orderedRows.map((row) => row.id));
      const messages = hydrateMessages(orderedRows, refsByMessageId);
      const firstSequence = messages[0]?.sequence ?? null;
      const lastSequence = messages[messages.length - 1]?.sequence ?? null;
      const [olderRow, newerRow] = await Promise.all([
        rows.length > limit || firstSequence === null
          ? Promise.resolve(rows.length > limit ? { id: "older" } : null)
          : db
              .select({ id: conversationMessages.id })
              .from(conversationMessages)
              .where(
                and(
                  ...baseFilters,
                  sql`${conversationMessages.sequence} < ${firstSequence}`,
                ),
              )
              .limit(1)
              .then((result) => result[0] ?? null),
        lastSequence === null
          ? Promise.resolve(null)
          : db
              .select({ id: conversationMessages.id })
              .from(conversationMessages)
              .where(
                and(
                  ...baseFilters,
                  sql`${conversationMessages.sequence} > ${lastSequence}`,
                ),
              )
              .limit(1)
              .then((result) => result[0] ?? null),
      ]);

      return {
        conversationId,
        messages,
        hasMoreBefore: olderRow !== null,
        hasMoreAfter: newerRow !== null,
      };
    },

    createMessage: async (
      conversationId: string,
      actor: ConversationActorContext,
      input: { bodyMarkdown: string; activeContextTargets: ConversationActiveContextTarget[] },
    ) => {
      const conversation = await ensureConversationVisible(conversationId, actor);
      if (actor.viewerType === "agent" && !actor.agentId) {
        throw forbidden("Conversation access denied");
      }

      const participantAgentIds = await getConversationParticipantAgentIds(conversationId);
      const inlineRefs = parseStructuredRefs(input.bodyMarkdown);
      const targetRefs = await ensureMessageTargetsExist(
        conversation.companyId,
        participantAgentIds,
        inlineRefs,
        input.activeContextTargets,
      );

      const now = new Date();
      const created = await db.transaction(async (tx) => {
        const [updatedConversation] = await tx
          .update(conversations)
          .set({
            lastMessageSequence: sql`${conversations.lastMessageSequence} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(conversations.companyId, conversation.companyId),
            ),
          )
          .returning();
        if (!updatedConversation) throw notFound("Conversation not found");

        const [message] = await tx
          .insert(conversationMessages)
          .values({
            companyId: conversation.companyId,
            conversationId,
            sequence: updatedConversation.lastMessageSequence,
            authorType: actor.actorType,
            authorUserId: actor.viewerType === "board" ? actor.actorId : null,
            authorAgentId: actor.viewerType === "agent" ? actor.agentId : null,
            runId: actor.viewerType === "agent" ? actor.runId : null,
            bodyMarkdown: input.bodyMarkdown,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!message) throw conflict("Unable to create conversation message");

        const allRefs = dedupeTargetRefs([
          ...targetRefs,
          ...inlineRefs
            .filter((ref) => ref.refKind !== "agent")
            .map((ref) => ({
              refKind: ref.refKind as "issue" | "goal" | "project",
              targetId: ref.targetId,
              displayText: ref.displayText,
              refOrigin: "inline_mention" as const,
            })),
        ]);
        const agentRefs = inlineRefs.filter((ref) => ref.refKind === "agent");

        const insertedRefRows =
          allRefs.length + agentRefs.length > 0
            ? await tx
                .insert(conversationMessageRefs)
                .values([
                  ...agentRefs.map((ref) => ({
                    companyId: conversation.companyId,
                    messageId: message.id,
                    refKind: ref.refKind,
                    targetId: ref.targetId,
                    displayText: ref.displayText,
                    refOrigin: ref.refOrigin,
                    createdAt: now,
                  })),
                  ...allRefs.map((ref) => ({
                    companyId: conversation.companyId,
                    messageId: message.id,
                    refKind: ref.refKind,
                    targetId: ref.targetId,
                    displayText: ref.displayText,
                    refOrigin: ref.refOrigin,
                    createdAt: now,
                  })),
                ])
                .onConflictDoNothing()
                .returning()
            : [];

        const persistedRefs: ConversationMessageRef[] = insertedRefRows.map((row) => ({
          id: row.id,
          companyId: row.companyId,
          messageId: row.messageId,
          refKind: row.refKind as ConversationMessageRef["refKind"],
          targetId: row.targetId,
          displayText: row.displayText,
          refOrigin: row.refOrigin as ConversationMessageRef["refOrigin"],
          createdAt: row.createdAt,
        }));

        const targetedAgentIds = agentRefs.map((ref) => ref.targetId);
        const affectedAgentIds = [
          ...new Set(targetedAgentIds.length > 0 ? targetedAgentIds : participantAgentIds),
        ];

        const targetObjectRefs = persistedRefs.filter(
          (ref) => ref.refKind === "issue" || ref.refKind === "goal" || ref.refKind === "project",
        );
        const affectedPairs: Array<{
          agentId: string;
          targetKind: ConversationTargetKind;
          targetId: string;
        }> = [];

        for (const ref of targetObjectRefs) {
          for (const targetAgentId of affectedAgentIds) {
            affectedPairs.push({
              agentId: targetAgentId,
              targetKind: ref.refKind as ConversationTargetKind,
              targetId: ref.targetId,
            });
            await tx
              .insert(conversationTargetLinks)
              .values({
                companyId: conversation.companyId,
                agentId: targetAgentId,
                conversationId,
                targetKind: ref.refKind as ConversationTargetKind,
                targetId: ref.targetId,
                linkOrigin: "message_ref",
                latestLinkedMessageId: message.id,
                latestLinkedMessageSequence: message.sequence,
                createdByActorType: actor.actorType,
                createdByActorId: actor.actorId,
                createdAt: now,
                updatedAt: now,
              })
              .onConflictDoUpdate({
                target: [
                  conversationTargetLinks.agentId,
                  conversationTargetLinks.conversationId,
                  conversationTargetLinks.targetKind,
                  conversationTargetLinks.targetId,
                ],
                set: {
                  latestLinkedMessageId: message.id,
                  latestLinkedMessageSequence: message.sequence,
                  updatedAt: now,
                },
              });
          }
        }

        const readState = await markReadInternal(
          conversation.companyId,
          conversationId,
          actor,
          message.sequence,
        );

        return {
          conversation: updatedConversation,
          message: {
            id: message.id,
            companyId: message.companyId,
            conversationId: message.conversationId,
            sequence: message.sequence,
            authorType: message.authorType as ConversationMessage["authorType"],
            authorUserId: message.authorUserId,
            authorAgentId: message.authorAgentId,
            runId: message.runId,
            bodyMarkdown: message.bodyMarkdown,
            refs: persistedRefs,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
          } satisfies ConversationMessage,
          affectedPairs,
          participantAgentIds,
          readState,
          responseAgentIds: affectedAgentIds,
        };
      });

      await memory.rebuildForPairs(conversation.companyId, created.affectedPairs);

      const singleTarget = singleTargetFromRefs(created.message.refs);
      const heartbeat = heartbeatService(db);
      const responseMode = created.message.refs.some((ref) => ref.refKind === "agent")
        ? "required"
        : "optional";
      for (const agentId of created.responseAgentIds) {
        await heartbeat.wakeup(agentId, {
          source: "conversation_message",
          triggerDetail: "manual",
          reason: "conversation_message",
          requestedByActorType: actor.actorType,
          requestedByActorId: actor.actorId,
          contextSnapshot: {
            taskKey: buildConversationTaskKey(conversationId),
            wakeReason: "conversation_message",
            conversationId,
            conversationMessageId: created.message.id,
            conversationMessageSequence: created.message.sequence,
            conversationResponseMode: responseMode,
            conversationTargetKind: singleTarget?.targetKind ?? null,
            conversationTargetId: singleTarget?.targetId ?? null,
          },
        });
      }

      await logActivity(db, {
        companyId: conversation.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "conversation.message_posted",
        entityType: "conversation",
        entityId: conversationId,
        audience: {
          scope: "conversationParticipants",
          conversationId,
          participantAgentIds: created.participantAgentIds,
        },
        details: {
          messageId: created.message.id,
          sequence: created.message.sequence,
        },
      });
      publishLiveEvent({
        companyId: conversation.companyId,
        type: "conversation.message_posted",
        audience: {
          scope: "conversationParticipants",
          conversationId,
          participantAgentIds: created.participantAgentIds,
        },
        payload: {
          conversationId,
          message: {
            id: created.message.id,
            sequence: created.message.sequence,
            authorType: created.message.authorType,
            authorUserId: created.message.authorUserId,
            authorAgentId: created.message.authorAgentId,
            runId: created.message.runId,
            bodyMarkdown: created.message.bodyMarkdown,
            createdAt: created.message.createdAt.toISOString(),
            refs: created.message.refs,
          },
          latestMessageSequence: created.conversation.lastMessageSequence,
          latestActivityAt: created.conversation.updatedAt.toISOString(),
        },
      });

      return created.message;
    },

    markRead: async (
      conversationId: string,
      actor: ConversationActorContext,
      lastReadSequence: number,
    ) => {
      const conversation = await ensureConversationVisible(conversationId, actor);
      return markReadInternal(conversation.companyId, conversationId, actor, lastReadSequence);
    },

    createTargetLinks: async (
      conversationId: string,
      actor: ConversationActorContext,
      input: {
        targetKind: ConversationTargetKind;
        targetId: string;
        anchorMessageId: string;
        agentIds: string[];
      },
    ) => {
      const conversation = await ensureConversationVisible(conversationId, actor);
      if (actor.viewerType === "agent" && input.agentIds.some((agentId) => agentId !== actor.agentId)) {
        throw forbidden("Agents may only manage their own conversation target links");
      }

      const participantAgentIds = await getConversationParticipantAgentIds(conversationId);
      if (input.agentIds.length === 0 || input.agentIds.some((agentId) => !participantAgentIds.includes(agentId))) {
        throw unprocessable("Manual link writes require explicit current conversation participants");
      }

      await ensureMessageTargetsExist(conversation.companyId, participantAgentIds, [], [
        { targetKind: input.targetKind, targetId: input.targetId, displayText: input.targetId },
      ]);

      const anchorMessage = await db
        .select()
        .from(conversationMessages)
        .where(
          and(
            eq(conversationMessages.id, input.anchorMessageId),
            eq(conversationMessages.conversationId, conversationId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (!anchorMessage) throw unprocessable("Anchor message must belong to the same conversation");

      const now = new Date();
      const createdLinks = [];
      for (const agentId of input.agentIds) {
        await db
          .delete(conversationTargetSuppressions)
          .where(
            and(
              eq(conversationTargetSuppressions.companyId, conversation.companyId),
              eq(conversationTargetSuppressions.agentId, agentId),
              eq(conversationTargetSuppressions.conversationId, conversationId),
              eq(conversationTargetSuppressions.targetKind, input.targetKind),
              eq(conversationTargetSuppressions.targetId, input.targetId),
            ),
          );

        const [link] = await db
          .insert(conversationTargetLinks)
          .values({
            companyId: conversation.companyId,
            agentId,
            conversationId,
            targetKind: input.targetKind,
            targetId: input.targetId,
            linkOrigin: "manual",
            latestLinkedMessageId: anchorMessage.id,
            latestLinkedMessageSequence: anchorMessage.sequence,
            createdByActorType: actor.actorType,
            createdByActorId: actor.actorId,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              conversationTargetLinks.agentId,
              conversationTargetLinks.conversationId,
              conversationTargetLinks.targetKind,
              conversationTargetLinks.targetId,
            ],
            set: {
              latestLinkedMessageId: anchorMessage.id,
              latestLinkedMessageSequence: anchorMessage.sequence,
              updatedAt: now,
            },
          })
          .returning();
        if (link) createdLinks.push(link);
      }

      await memory.rebuildForPairs(
        conversation.companyId,
        input.agentIds.map((agentId) => ({
          agentId,
          targetKind: input.targetKind,
          targetId: input.targetId,
        })),
      );

      await logActivity(db, {
        companyId: conversation.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "conversation.context_linked",
        entityType: "conversation",
        entityId: conversationId,
        audience: {
          scope: "conversationParticipants",
          conversationId,
          participantAgentIds,
        },
        details: {
          targetKind: input.targetKind,
          targetId: input.targetId,
          agentIds: input.agentIds,
          anchorMessageId: input.anchorMessageId,
        },
      });
      publishLiveEvent({
        companyId: conversation.companyId,
        type: "conversation.context_linked",
        audience: {
          scope: "conversationParticipants",
          conversationId,
          participantAgentIds,
        },
        payload: {
          conversationId,
          targetKind: input.targetKind,
          targetId: input.targetId,
          agentIds: input.agentIds,
          anchorMessageId: input.anchorMessageId,
          latestLinkedMessageId: anchorMessage.id,
          latestLinkedMessageSequence: anchorMessage.sequence,
        },
      });

      return createdLinks.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        agentId: row.agentId,
        conversationId: row.conversationId,
        targetKind: row.targetKind as ConversationTargetKind,
        targetId: row.targetId,
        displayText: null,
        linkOrigin: row.linkOrigin as ConversationTargetLink["linkOrigin"],
        latestLinkedMessageId: row.latestLinkedMessageId,
        latestLinkedMessageSequence: row.latestLinkedMessageSequence,
        createdByActorType:
          row.createdByActorType as ConversationTargetLink["createdByActorType"],
        createdByActorId: row.createdByActorId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    },

    deleteTargetLinks: async (
      conversationId: string,
      actor: ConversationActorContext,
      input: {
        targetKind: ConversationTargetKind;
        targetId: string;
        agentIds: string[];
      },
    ) => {
      const conversation = await ensureConversationVisible(conversationId, actor);
      if (actor.viewerType === "agent" && input.agentIds.some((agentId) => agentId !== actor.agentId)) {
        throw forbidden("Agents may only manage their own conversation target links");
      }

      const participantAgentIds = await getConversationParticipantAgentIds(conversationId);
      if (input.agentIds.length === 0 || input.agentIds.some((agentId) => !participantAgentIds.includes(agentId))) {
        throw unprocessable("Manual unlink writes require explicit current conversation participants");
      }

      const deletedLinks = await db
        .delete(conversationTargetLinks)
        .where(
          and(
            eq(conversationTargetLinks.companyId, conversation.companyId),
            eq(conversationTargetLinks.conversationId, conversationId),
            eq(conversationTargetLinks.targetKind, input.targetKind),
            eq(conversationTargetLinks.targetId, input.targetId),
            inArray(conversationTargetLinks.agentId, input.agentIds),
          ),
        )
        .returning();

      const maxSequenceRow = await db
        .select({ sequence: max(conversationMessages.sequence) })
        .from(conversationMessageRefs)
        .innerJoin(conversationMessages, eq(conversationMessageRefs.messageId, conversationMessages.id))
        .where(
          and(
            eq(conversationMessageRefs.companyId, conversation.companyId),
            eq(conversationMessages.conversationId, conversationId),
            eq(conversationMessageRefs.refKind, input.targetKind),
            eq(conversationMessageRefs.targetId, input.targetId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      const cutoff = maxSequenceRow?.sequence ?? 0;

      for (const agentId of input.agentIds) {
        const existing = await db
          .select()
          .from(conversationTargetSuppressions)
          .where(
            and(
              eq(conversationTargetSuppressions.companyId, conversation.companyId),
              eq(conversationTargetSuppressions.agentId, agentId),
              eq(conversationTargetSuppressions.conversationId, conversationId),
              eq(conversationTargetSuppressions.targetKind, input.targetKind),
              eq(conversationTargetSuppressions.targetId, input.targetId),
            ),
          )
          .then((rows) => rows[0] ?? null);
        if (existing) {
          await db
            .update(conversationTargetSuppressions)
            .set({
              suppressedThroughMessageSequence: Math.max(existing.suppressedThroughMessageSequence, cutoff),
              suppressedByActorType: actor.actorType,
              suppressedByActorId: actor.actorId,
              updatedAt: new Date(),
            })
            .where(eq(conversationTargetSuppressions.id, existing.id));
        } else {
          await db.insert(conversationTargetSuppressions).values({
            companyId: conversation.companyId,
            agentId,
            conversationId,
            targetKind: input.targetKind,
            targetId: input.targetId,
            suppressedThroughMessageSequence: cutoff,
            suppressedByActorType: actor.actorType,
            suppressedByActorId: actor.actorId,
            updatedAt: new Date(),
          });
        }
      }

      await memory.rebuildForPairs(
        conversation.companyId,
        input.agentIds.map((agentId) => ({
          agentId,
          targetKind: input.targetKind,
          targetId: input.targetId,
        })),
      );

      await logActivity(db, {
        companyId: conversation.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "conversation.context_unlinked",
        entityType: "conversation",
        entityId: conversationId,
        audience: {
          scope: "conversationParticipants",
          conversationId,
          participantAgentIds,
        },
        details: {
          targetKind: input.targetKind,
          targetId: input.targetId,
          agentIds: input.agentIds,
        },
      });
      publishLiveEvent({
        companyId: conversation.companyId,
        type: "conversation.context_unlinked",
        audience: {
          scope: "conversationParticipants",
          conversationId,
          participantAgentIds,
        },
        payload: {
          conversationId,
          targetKind: input.targetKind,
          targetId: input.targetId,
          agentIds: input.agentIds,
        },
      });

      return { removedCount: deletedLinks.length };
    },

    listLinkedConversations: memory.listLinkedConversations,
  };
}
