import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  agentWakeupRequests,
  agents,
  companies,
  conversationMessages,
  conversations,
  heartbeatRuns,
} from "@paperclipai/db";
import { randomUUID } from "node:crypto";
import { cleanDb, getTestDb, type TestDb } from "../helpers/test-db.js";
import { heartbeatService, resolveSucceededWakeupStatus } from "../../services/heartbeat.ts";

describe("resolveSucceededWakeupStatus", () => {
  let testDb: TestDb;

  beforeAll(() => {
    testDb = getTestDb();
  });

  afterAll(() => testDb.close());

  beforeEach(async () => {
    await cleanDb();
  });

  async function seedRequiredReplyFixture() {
    const [company] = await testDb.db
      .insert(companies)
      .values({
        name: "Reply Co",
        issuePrefix: `R${randomUUID().slice(0, 4).toUpperCase()}`,
      })
      .returning();

    const [agent] = await testDb.db
      .insert(agents)
      .values({
        companyId: company.id,
        name: "Responder",
        role: "general",
        adapterType: "process",
        status: "idle",
      })
      .returning();

    const [conversation] = await testDb.db
      .insert(conversations)
      .values({
        companyId: company.id,
        title: "Required reply thread",
        createdByUserId: "board-user",
        lastMessageSequence: 5,
      })
      .returning();

    const [triggerMessage] = await testDb.db
      .insert(conversationMessages)
      .values({
        companyId: company.id,
        conversationId: conversation.id,
        sequence: 5,
        authorType: "user",
        authorUserId: "board-user",
        bodyMarkdown: "Please reply here",
      })
      .returning();

    const [wakeupRequest] = await testDb.db
      .insert(agentWakeupRequests)
      .values({
        companyId: company.id,
        agentId: agent.id,
        source: "conversation_message",
        reason: "conversation_message",
        status: "running",
        conversationId: conversation.id,
        conversationMessageId: triggerMessage.id,
        conversationMessageSequence: triggerMessage.sequence,
        responseMode: "required",
      })
      .returning();

    const [run] = await testDb.db
      .insert(heartbeatRuns)
      .values({
        companyId: company.id,
        agentId: agent.id,
        invocationSource: "conversation_message",
        status: "running",
        wakeupRequestId: wakeupRequest.id,
      })
      .returning();

    return {
      company,
      agent,
      conversation,
      triggerMessage,
      wakeupRequest,
      run,
    };
  }

  it("does not count an earlier same-run reply before the surviving required trigger sequence", async () => {
    const fixture = await seedRequiredReplyFixture();

    await testDb.db.insert(conversationMessages).values({
      companyId: fixture.company.id,
      conversationId: fixture.conversation.id,
      sequence: 4,
      authorType: "agent",
      authorAgentId: fixture.agent.id,
      runId: fixture.run.id,
      bodyMarkdown: "Earlier reply from the same run",
    });

    const result = await resolveSucceededWakeupStatus(
      testDb.db,
      fixture.run,
      null,
    );

    expect(result.status).toBe("failed");
    expect(result.error).toBe("required_reply_missing");
    expect(result.missingRequiredReply).toBe(true);
    expect(result.activeRequiredTriggerSequence).toBe(5);
  });

  it("counts an agent-authored same-run reply only when it is after the required trigger sequence", async () => {
    const fixture = await seedRequiredReplyFixture();

    await testDb.db.insert(conversationMessages).values({
      companyId: fixture.company.id,
      conversationId: fixture.conversation.id,
      sequence: 6,
      authorType: "agent",
      authorAgentId: fixture.agent.id,
      runId: fixture.run.id,
      bodyMarkdown: "Reply after the active trigger",
    });

    const result = await resolveSucceededWakeupStatus(
      testDb.db,
      fixture.run,
      null,
    );

    expect(result.status).toBe("completed");
    expect(result.error).toBeNull();
    expect(result.missingRequiredReply).toBe(false);
    expect(result.activeRequiredTriggerSequence).toBe(5);
  });

  it("queues a fresh follow-up run for a new conversation message when the prior conversation run is still running", async () => {
    const fixture = await seedRequiredReplyFixture();
    const heartbeat = heartbeatService(testDb.db);

    await testDb.db
      .update(heartbeatRuns)
      .set({
        contextSnapshot: {
          taskKey: `conversation:${fixture.conversation.id}`,
          conversationId: fixture.conversation.id,
          conversationMessageId: fixture.triggerMessage.id,
          conversationMessageSequence: fixture.triggerMessage.sequence,
          conversationResponseMode: "required",
          conversationReplyToMessageId: "reply-target-1",
          conversationReplyContextMarkdown: "Old targeted reply context",
        },
      })
      .where(eq(heartbeatRuns.id, fixture.run.id));

    const [nextMessage] = await testDb.db
      .insert(conversationMessages)
      .values({
        companyId: fixture.company.id,
        conversationId: fixture.conversation.id,
        sequence: 6,
        authorType: "user",
        authorUserId: "board-user",
        bodyMarkdown: "Fresh broadcast follow-up",
      })
      .returning();

    const followupRun = await heartbeat.wakeup(fixture.agent.id, {
      source: "conversation_message",
      triggerDetail: "manual",
      reason: "conversation_message",
      contextSnapshot: {
        taskKey: `conversation:${fixture.conversation.id}`,
        wakeReason: "conversation_message",
        conversationId: fixture.conversation.id,
        conversationMessageId: nextMessage.id,
        conversationMessageSequence: nextMessage.sequence,
        conversationResponseMode: "optional",
      },
    });

    expect(followupRun).not.toBeNull();
    expect(followupRun?.id).not.toBe(fixture.run.id);
    expect(followupRun?.status).toBe("queued");

    const runs = await testDb.db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.agentId, fixture.agent.id));

    expect(runs).toHaveLength(2);

    const originalRun = runs.find((row) => row.id === fixture.run.id);
    const queuedRun = runs.find((row) => row.id === followupRun?.id);

    expect(originalRun?.status).toBe("running");
    expect(originalRun?.contextSnapshot).toMatchObject({
      conversationMessageId: fixture.triggerMessage.id,
      conversationReplyContextMarkdown: "Old targeted reply context",
    });
    expect(queuedRun?.contextSnapshot).toMatchObject({
      taskKey: `conversation:${fixture.conversation.id}`,
      conversationId: fixture.conversation.id,
      conversationMessageId: nextMessage.id,
      conversationMessageSequence: 6,
      conversationResponseMode: "optional",
    });
    expect(queuedRun?.contextSnapshot).not.toHaveProperty(
      "conversationReplyContextMarkdown",
    );
  });

  it("clears stale reply-target context when coalescing a queued conversation wake to a newer plain message", async () => {
    const fixture = await seedRequiredReplyFixture();
    const heartbeat = heartbeatService(testDb.db);

    await testDb.db
      .update(agentWakeupRequests)
      .set({ status: "queued" })
      .where(eq(agentWakeupRequests.id, fixture.wakeupRequest.id));

    await testDb.db
      .update(heartbeatRuns)
      .set({
        status: "queued",
        contextSnapshot: {
          taskKey: `conversation:${fixture.conversation.id}`,
          conversationId: fixture.conversation.id,
          conversationMessageId: fixture.triggerMessage.id,
          conversationMessageSequence: fixture.triggerMessage.sequence,
          conversationResponseMode: "required",
          conversationReplyToMessageId: "reply-target-1",
          conversationReplyContextMarkdown: "Old targeted reply context",
        },
      })
      .where(eq(heartbeatRuns.id, fixture.run.id));

    const [nextMessage] = await testDb.db
      .insert(conversationMessages)
      .values({
        companyId: fixture.company.id,
        conversationId: fixture.conversation.id,
        sequence: 6,
        authorType: "user",
        authorUserId: "board-user",
        bodyMarkdown: "Broadcast follow-up after the mention",
      })
      .returning();

    const mergedRun = await heartbeat.wakeup(fixture.agent.id, {
      source: "conversation_message",
      triggerDetail: "manual",
      reason: "conversation_message",
      contextSnapshot: {
        taskKey: `conversation:${fixture.conversation.id}`,
        wakeReason: "conversation_message",
        conversationId: fixture.conversation.id,
        conversationMessageId: nextMessage.id,
        conversationMessageSequence: nextMessage.sequence,
        conversationResponseMode: "optional",
      },
    });

    expect(mergedRun).not.toBeNull();
    expect(mergedRun?.id).toBe(fixture.run.id);

    const storedRun = await testDb.db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, fixture.run.id))
      .then((rows) => rows[0] ?? null);

    expect(storedRun?.contextSnapshot).toMatchObject({
      taskKey: `conversation:${fixture.conversation.id}`,
      conversationId: fixture.conversation.id,
      conversationMessageId: nextMessage.id,
      conversationMessageSequence: 6,
      conversationResponseMode: "required",
    });
    expect(storedRun?.contextSnapshot).not.toHaveProperty(
      "conversationReplyContextMarkdown",
    );
    expect(storedRun?.contextSnapshot).not.toHaveProperty(
      "conversationReplyToMessageId",
    );
  });

  it("starts a later level 1 human conversation wake before an older level 2 queued wake", async () => {
    const fixture = await seedRequiredReplyFixture();
    const heartbeat = heartbeatService(testDb.db);

    await testDb.db
      .update(agents)
      .set({
        adapterConfig: {
          command: "bash",
          args: ["-lc", "sleep 30"],
          timeoutSec: 60,
        },
      })
      .where(eq(agents.id, fixture.agent.id));

    const [otherConversation] = await testDb.db
      .insert(conversations)
      .values({
        companyId: fixture.company.id,
        title: "Older queued thread",
        createdByUserId: "board-user",
        lastMessageSequence: 1,
      })
      .returning();

    const [olderMessage] = await testDb.db
      .insert(conversationMessages)
      .values({
        companyId: fixture.company.id,
        conversationId: otherConversation.id,
        sequence: 1,
        authorType: "user",
        authorUserId: "board-user",
        bodyMarkdown: "Older level 2 message",
      })
      .returning();

    await testDb.db
      .update(heartbeatRuns)
      .set({
        contextSnapshot: {
          taskKey: "conversation:blocking",
        },
      })
      .where(eq(heartbeatRuns.id, fixture.run.id));

    const olderQueuedRun = await heartbeat.wakeup(fixture.agent.id, {
      source: "conversation_message",
      triggerDetail: "manual",
      reason: "conversation_message",
      contextSnapshot: {
        taskKey: `conversation:${otherConversation.id}`,
        wakeReason: "conversation_message",
        conversationId: otherConversation.id,
        conversationMessageId: olderMessage.id,
        conversationMessageSequence: olderMessage.sequence,
        conversationResponseMode: "optional",
        conversationWakeLevel: 2,
      },
    });

    const newerHighPriorityRun = await heartbeat.wakeup(fixture.agent.id, {
      source: "conversation_message",
      triggerDetail: "manual",
      reason: "conversation_message",
      contextSnapshot: {
        taskKey: `conversation:${fixture.conversation.id}`,
        wakeReason: "conversation_message",
        conversationId: fixture.conversation.id,
        conversationMessageId: fixture.triggerMessage.id,
        conversationMessageSequence: fixture.triggerMessage.sequence,
        conversationResponseMode: "optional",
        conversationWakeLevel: 1,
      },
    });

    expect(olderQueuedRun?.status).toBe("queued");
    expect(newerHighPriorityRun?.status).toBe("queued");

    await heartbeat.cancelRun(fixture.run.id, {
      error: "test_cancelled",
      message: "freeing scheduler slot for level ordering test",
    });

    const runs = await testDb.db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.agentId, fixture.agent.id));

    const olderStoredRun = runs.find((row) => row.id === olderQueuedRun?.id);
    const newerStoredRun = runs.find((row) => row.id === newerHighPriorityRun?.id);

    expect(olderStoredRun?.status).toBe("queued");
    expect(newerStoredRun?.status).toBe("running");
    expect(
      ((newerStoredRun?.contextSnapshot ?? {}) as Record<string, unknown>).conversationWakeLevel,
    ).toBe(1);

    await heartbeat.cancelActiveForAgent(fixture.agent.id);
  });
});
