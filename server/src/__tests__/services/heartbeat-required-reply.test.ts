import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
import { resolveSucceededWakeupStatus } from "../../services/heartbeat.ts";

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
});
