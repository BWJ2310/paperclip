import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ConversationDetail, ConversationMessagePage, LiveEvent } from "@paperclipai/shared";
import { handleLiveEvent } from "../src/context/LiveUpdatesProvider";
import { queryKeys } from "../src/lib/queryKeys";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function createGate() {
  return {
    cooldownHits: new Map<string, number[]>(),
    suppressUntil: 0,
  };
}

describe("handleLiveEvent conversation routing", () => {
  it("does not invalidate conversation queries from activity.logged conversation events", () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const event: LiveEvent = {
      id: 1,
      companyId: "company-1",
      type: "activity.logged",
      createdAt: "2026-03-18T00:00:00.000Z",
      audience: {
        scope: "conversationParticipants",
        conversationId: "conversation-1",
        participantAgentIds: ["agent-1"],
      },
      payload: {
        action: "conversation.message_posted",
        entityType: "conversation",
        entityId: "conversation-1",
      },
    };

    handleLiveEvent(
      queryClient,
      "company-1",
      event,
      () => null,
      createGate(),
      { userId: "local-board", agentId: null },
    );

    const invalidatedConversationQueries = invalidateSpy.mock.calls
      .map(([filters]) => filters.queryKey)
      .filter((queryKey) => Array.isArray(queryKey) && queryKey[0] === "conversations");

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.activity("company-1"),
    });
    expect(invalidatedConversationQueries).toHaveLength(0);
  });

  it("uses conversation.message_posted to patch message caches and invalidate conversation queries", () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const detail: ConversationDetail = {
      id: "conversation-1",
      companyId: "company-1",
      title: "Realtime",
      status: "active",
      participants: [],
      latestMessageSequence: 1,
      latestMessageAt: new Date("2026-03-18T00:00:00.000Z"),
      unreadCount: 0,
      createdAt: new Date("2026-03-18T00:00:00.000Z"),
      updatedAt: new Date("2026-03-18T00:00:00.000Z"),
      costSummary: {
        spendCents: 0,
        inputTokens: 0,
        outputTokens: 0,
        runCount: 0,
        lastOccurredAt: null,
      },
      viewerReadState: null,
    };

    const basePage: ConversationMessagePage = {
      conversationId: "conversation-1",
      messages: [
        {
          id: "message-1",
          companyId: "company-1",
          conversationId: "conversation-1",
          sequence: 1,
          parentId: null,
          parentMessage: null,
          authorType: "user",
          authorUserId: "local-board",
          authorAgentId: null,
          runId: null,
          bodyMarkdown: "First",
          refs: [],
          deletedAt: null,
          createdAt: new Date("2026-03-18T00:00:00.000Z"),
          updatedAt: new Date("2026-03-18T00:00:00.000Z"),
        },
      ],
      hasMoreBefore: false,
      hasMoreAfter: false,
    };

    queryClient.setQueryData(
      queryKeys.conversations.detail("conversation-1"),
      detail,
    );
    queryClient.setQueryData(
      queryKeys.conversations.messages("conversation-1", { limit: 50 }),
      basePage,
    );
    queryClient.setQueryData(
      queryKeys.conversations.messages("conversation-1", { limit: 1 }),
      basePage,
    );

    const event: LiveEvent = {
      id: 2,
      companyId: "company-1",
      type: "conversation.message_posted",
      createdAt: "2026-03-18T00:00:05.000Z",
      audience: {
        scope: "conversationParticipants",
        conversationId: "conversation-1",
        participantAgentIds: ["agent-1"],
      },
      payload: {
        conversationId: "conversation-1",
        latestMessageSequence: 2,
        latestActivityAt: "2026-03-18T00:00:05.000Z",
        message: {
          id: "message-2",
          sequence: 2,
          parentId: "message-1",
          parentMessage: {
            id: "message-1",
            sequence: 1,
            authorType: "user",
            authorUserId: "local-board",
            authorAgentId: null,
            bodyMarkdown: "First",
            deletedAt: null,
            createdAt: "2026-03-18T00:00:00.000Z",
          },
          authorType: "agent",
          authorUserId: null,
          authorAgentId: "agent-1",
          runId: "run-1",
          bodyMarkdown: "Second",
          deletedAt: null,
          createdAt: "2026-03-18T00:00:05.000Z",
          updatedAt: "2026-03-18T00:00:05.000Z",
          refs: [
            {
              id: "ref-1",
              companyId: "company-1",
              messageId: "message-2",
              refKind: "issue",
              targetId: "issue-1",
              displayText: "ENG-1",
              refOrigin: "message_ref",
              createdAt: "2026-03-18T00:00:05.000Z",
            },
          ],
        },
      },
    };

    handleLiveEvent(
      queryClient,
      "company-1",
      event,
      () => null,
      createGate(),
      { userId: "local-board", agentId: null },
    );

    const fullPage = queryClient.getQueryData<ConversationMessagePage>(
      queryKeys.conversations.messages("conversation-1", { limit: 50 }),
    );
    const latestOnlyPage = queryClient.getQueryData<ConversationMessagePage>(
      queryKeys.conversations.messages("conversation-1", { limit: 1 }),
    );

    expect(fullPage?.messages.map((message) => message.id)).toEqual([
      "message-1",
      "message-2",
    ]);
    expect(fullPage?.messages[1]).toMatchObject({
      id: "message-2",
      parentId: "message-1",
      parentMessage: {
        id: "message-1",
        sequence: 1,
      },
      deletedAt: null,
    });
    expect(latestOnlyPage?.messages.map((message) => message.id)).toEqual([
      "message-2",
    ]);
    expect(
      queryClient.getQueryData<ConversationDetail>(
        queryKeys.conversations.detail("conversation-1"),
      )?.latestMessageSequence,
    ).toBe(2);

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.conversations.detail("conversation-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["conversations", "company-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.issues.linkedConversations("issue-1"),
    });
  });

  it("uses conversation.message_deleted to tombstone cached messages and invalidate affected linked targets", () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const basePage: ConversationMessagePage = {
      conversationId: "conversation-1",
      messages: [
        {
          id: "message-1",
          companyId: "company-1",
          conversationId: "conversation-1",
          sequence: 1,
          parentId: null,
          parentMessage: null,
          authorType: "user",
          authorUserId: "local-board",
          authorAgentId: null,
          runId: null,
          bodyMarkdown: "First",
          refs: [],
          deletedAt: null,
          createdAt: new Date("2026-03-18T00:00:00.000Z"),
          updatedAt: new Date("2026-03-18T00:00:00.000Z"),
        },
        {
          id: "message-2",
          companyId: "company-1",
          conversationId: "conversation-1",
          sequence: 2,
          parentId: null,
          parentMessage: null,
          authorType: "user",
          authorUserId: "user-2",
          authorAgentId: null,
          runId: null,
          bodyMarkdown: "To be deleted",
          refs: [
            {
              id: "ref-1",
              companyId: "company-1",
              messageId: "message-2",
              refKind: "issue",
              targetId: "issue-1",
              displayText: "ENG-1",
              refOrigin: "message_ref",
              createdAt: new Date("2026-03-18T00:00:05.000Z"),
            },
          ],
          deletedAt: null,
          createdAt: new Date("2026-03-18T00:00:05.000Z"),
          updatedAt: new Date("2026-03-18T00:00:05.000Z"),
        },
      ],
      hasMoreBefore: false,
      hasMoreAfter: false,
    };

    queryClient.setQueryData(
      queryKeys.conversations.messages("conversation-1", { limit: 50 }),
      basePage,
    );

    const event: LiveEvent = {
      id: 3,
      companyId: "company-1",
      type: "conversation.message_deleted",
      createdAt: "2026-03-18T00:00:10.000Z",
      audience: {
        scope: "conversationParticipants",
        conversationId: "conversation-1",
        participantAgentIds: ["agent-1"],
      },
      payload: {
        conversationId: "conversation-1",
        latestMessageSequence: 1,
        latestActivityAt: "2026-03-18T00:00:10.000Z",
        affectedTargets: [
          {
            targetKind: "issue",
            targetId: "issue-1",
          },
        ],
        message: {
          id: "message-2",
          sequence: 2,
          parentId: null,
          parentMessage: null,
          authorType: "user",
          authorUserId: "user-2",
          authorAgentId: null,
          runId: null,
          bodyMarkdown: "",
          deletedAt: "2026-03-18T00:00:10.000Z",
          createdAt: "2026-03-18T00:00:05.000Z",
          updatedAt: "2026-03-18T00:00:10.000Z",
          refs: [],
        },
      },
    };

    handleLiveEvent(
      queryClient,
      "company-1",
      event,
      () => null,
      createGate(),
      { userId: "local-board", agentId: null },
    );

    const page = queryClient.getQueryData<ConversationMessagePage>(
      queryKeys.conversations.messages("conversation-1", { limit: 50 }),
    );
    expect(page?.messages[1]).toMatchObject({
      id: "message-2",
      bodyMarkdown: "",
    });
    expect(page?.messages[1]?.deletedAt).toEqual(new Date("2026-03-18T00:00:10.000Z"));

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.conversations.detail("conversation-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["conversations", "company-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.issues.linkedConversations("issue-1"),
    });
  });
});
