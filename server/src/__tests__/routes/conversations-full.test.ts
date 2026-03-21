import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  activityLog,
  agentWakeupRequests,
  agentTargetConversationMemory,
  agents,
  companies,
  conversationMessageRefs,
  conversationMessages,
  conversationParticipants,
  conversationTargetLinks,
  conversations,
  goals,
  heartbeatRuns,
  issues,
  projects,
} from "@paperclipai/db";
import { buildStructuredMentionHref } from "@paperclipai/shared";
import { randomUUID } from "node:crypto";
import { cleanDb, getTestDb, type TestDb } from "../helpers/test-db.js";
import { createTestApp, resetMockActor, setMockActor } from "../helpers/test-app.js";
import { heartbeatService } from "../../services/heartbeat.ts";

describe("conversationRoutes", () => {
  let testDb: TestDb;

  beforeAll(() => {
    testDb = getTestDb();
  });

  afterAll(() => testDb.close());

  beforeEach(async () => {
    await cleanDb();
    resetMockActor();
  });

  afterEach(async () => {
    const runningOrQueuedAgentIds = Array.from(
      new Set(
        (await testDb.db.select().from(heartbeatRuns))
          .filter((row) => row.status === "queued" || row.status === "running")
          .map((row) => row.agentId),
      ),
    );
    const heartbeat = heartbeatService(testDb.db);
    for (const agentId of runningOrQueuedAgentIds) {
      await heartbeat.cancelActiveForAgent(agentId);
    }
    resetMockActor();
  });

  async function waitForAssertion(
    assertion: () => Promise<void> | void,
    timeoutMs = 2500,
    intervalMs = 25,
  ) {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown = null;
    while (Date.now() < deadline) {
      try {
        await assertion();
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
    throw lastError ?? new Error("Timed out waiting for assertion");
  }

  async function waitForConversationMessagePostedActivity(conversationId: string) {
    await waitForAssertion(async () => {
      const rows = (await testDb.db.select().from(activityLog)).filter(
        (row) => row.action === "conversation.message_posted" && row.entityId === conversationId,
      );
      expect(rows.length).toBeGreaterThan(0);
    });
  }

  async function seedFixture() {
    const now = new Date("2026-03-18T12:00:00.000Z");
    const [company] = await testDb.db
      .insert(companies)
      .values({
        id: "11111111-1111-4111-8111-111111111111",
        name: "Conversation Co",
        issuePrefix: `C${randomUUID().slice(0, 4).toUpperCase()}`,
      })
      .returning();

    const [agentA, agentB] = await testDb.db
      .insert(agents)
      .values([
        {
          id: "00000000-0000-4000-8000-000000000012",
          companyId: company.id,
          name: "Agent A",
          role: "general",
          adapterType: "process",
          status: "idle",
        },
        {
          id: "00000000-0000-4000-8000-000000000004",
          companyId: company.id,
          name: "Agent B",
          role: "general",
          adapterType: "process",
          status: "idle",
        },
      ])
      .returning();

    const [goal] = await testDb.db
      .insert(goals)
      .values({
        companyId: company.id,
        title: "Launch Goal",
        status: "planned",
      })
      .returning();

    const [project] = await testDb.db
      .insert(projects)
      .values({
        companyId: company.id,
        goalId: goal.id,
        name: "Launch Project",
        status: "backlog",
      })
      .returning();

    const [issue] = await testDb.db
      .insert(issues)
      .values({
        companyId: company.id,
        goalId: goal.id,
        projectId: project.id,
        title: "Fix conversation bug",
        status: "backlog",
        priority: "medium",
        createdByUserId: "board-user",
        identifier: `C-${Math.floor(Math.random() * 1000)}`,
      })
      .returning();

    const [conversation] = await testDb.db
      .insert(conversations)
      .values({
        id: "22222222-2222-4222-8222-222222222222",
        companyId: company.id,
        title: "Design review",
        createdByUserId: "board-user",
        lastMessageSequence: 5,
        updatedAt: now,
      })
      .returning();

    await testDb.db.insert(conversationParticipants).values([
      {
        companyId: company.id,
        conversationId: conversation.id,
        agentId: agentA.id,
        joinedAt: now,
        updatedAt: now,
      },
      {
        companyId: company.id,
        conversationId: conversation.id,
        agentId: agentB.id,
        joinedAt: now,
        updatedAt: now,
      },
    ]);

    const insertedMessages = await testDb.db
      .insert(conversationMessages)
      .values([
        {
          companyId: company.id,
          conversationId: conversation.id,
          sequence: 1,
          authorType: "user",
          authorUserId: "board-user",
          bodyMarkdown: "Kickoff context",
          createdAt: new Date("2026-03-18T12:01:00.000Z"),
          updatedAt: new Date("2026-03-18T12:01:00.000Z"),
        },
        {
          companyId: company.id,
          conversationId: conversation.id,
          sequence: 2,
          authorType: "user",
          authorUserId: "board-user",
          bodyMarkdown: "Issue follow-up for beta fix",
          createdAt: new Date("2026-03-18T12:02:00.000Z"),
          updatedAt: new Date("2026-03-18T12:02:00.000Z"),
        },
        {
          companyId: company.id,
          conversationId: conversation.id,
          sequence: 3,
          authorType: "user",
          authorUserId: "board-user",
          bodyMarkdown: "Neutral planning checkpoint",
          createdAt: new Date("2026-03-18T12:03:00.000Z"),
          updatedAt: new Date("2026-03-18T12:03:00.000Z"),
        },
        {
          companyId: company.id,
          conversationId: conversation.id,
          sequence: 4,
          authorType: "user",
          authorUserId: "board-user",
          bodyMarkdown: "Beta resolution with target refs",
          createdAt: new Date("2026-03-18T12:04:00.000Z"),
          updatedAt: new Date("2026-03-18T12:04:00.000Z"),
        },
        {
          companyId: company.id,
          conversationId: conversation.id,
          sequence: 5,
          authorType: "user",
          authorUserId: "board-user",
          bodyMarkdown: "Wrap up notes",
          createdAt: new Date("2026-03-18T12:05:00.000Z"),
          updatedAt: new Date("2026-03-18T12:05:00.000Z"),
        },
      ])
      .returning();

    const messageBySequence = new Map(
      insertedMessages.map((message) => [message.sequence, message] as const),
    );

    await testDb.db.insert(conversationMessageRefs).values([
      {
        companyId: company.id,
        messageId: messageBySequence.get(2)!.id,
        refKind: "issue",
        targetId: issue.id,
        displayText: issue.identifier ?? issue.title,
        refOrigin: "inline_mention",
      },
      {
        companyId: company.id,
        messageId: messageBySequence.get(4)!.id,
        refKind: "issue",
        targetId: issue.id,
        displayText: issue.identifier ?? issue.title,
        refOrigin: "inline_mention",
      },
      {
        companyId: company.id,
        messageId: messageBySequence.get(4)!.id,
        refKind: "goal",
        targetId: goal.id,
        displayText: goal.title,
        refOrigin: "active_context",
      },
      {
        companyId: company.id,
        messageId: messageBySequence.get(4)!.id,
        refKind: "project",
        targetId: project.id,
        displayText: project.name,
        refOrigin: "active_context",
      },
    ]);

    await testDb.db.insert(conversationTargetLinks).values([
      {
        companyId: company.id,
        agentId: agentA.id,
        conversationId: conversation.id,
        targetKind: "issue",
        targetId: issue.id,
        linkOrigin: "manual",
        latestLinkedMessageId: messageBySequence.get(4)!.id,
        latestLinkedMessageSequence: 4,
        createdByActorType: "user",
        createdByActorId: "board-user",
        createdAt: now,
        updatedAt: now,
      },
      {
        companyId: company.id,
        agentId: agentA.id,
        conversationId: conversation.id,
        targetKind: "goal",
        targetId: goal.id,
        linkOrigin: "manual",
        latestLinkedMessageId: messageBySequence.get(4)!.id,
        latestLinkedMessageSequence: 4,
        createdByActorType: "user",
        createdByActorId: "board-user",
        createdAt: now,
        updatedAt: now,
      },
      {
        companyId: company.id,
        agentId: agentA.id,
        conversationId: conversation.id,
        targetKind: "project",
        targetId: project.id,
        linkOrigin: "manual",
        latestLinkedMessageId: messageBySequence.get(4)!.id,
        latestLinkedMessageSequence: 4,
        createdByActorType: "user",
        createdByActorId: "board-user",
        createdAt: now,
        updatedAt: now,
      },
      {
        companyId: company.id,
        agentId: agentB.id,
        conversationId: conversation.id,
        targetKind: "issue",
        targetId: issue.id,
        linkOrigin: "manual",
        latestLinkedMessageId: messageBySequence.get(4)!.id,
        latestLinkedMessageSequence: 4,
        createdByActorType: "user",
        createdByActorId: "board-user",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    setMockActor({
      type: "board",
      userId: "board-user",
      companyIds: [company.id],
      source: "session",
      isInstanceAdmin: false,
    });

    return {
      app: createTestApp(testDb.db),
      company,
      agentA,
      agentB,
      goal,
      project,
      issue,
      conversation,
      messageBySequence,
    };
  }

  it("rejects agent-created conversations", async () => {
    const fixture = await seedFixture();
    setMockActor({
      type: "agent",
      agentId: fixture.agentA.id,
      companyId: fixture.company.id,
    });

    const res = await request(fixture.app)
      .post(`/api/companies/${fixture.company.id}/conversations`)
      .send({
        title: "Agent kickoff attempt",
        participantAgentIds: [fixture.agentB.id],
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Board access required");
  });

  it("rejects agent-added conversation participants", async () => {
    const fixture = await seedFixture();
    setMockActor({
      type: "agent",
      agentId: fixture.agentA.id,
      companyId: fixture.company.id,
    });

    const res = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/participants`)
      .send({ agentId: fixture.agentB.id });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Board access required");
  });

  it("downranks direct-report mentions to a manager while keeping same-level peer mentions at level 2", async () => {
    const now = new Date("2026-03-18T16:00:00.000Z");
    const [company] = await testDb.db
      .insert(companies)
      .values({
        id: "44444444-4444-4444-8444-444444444444",
        name: "Hierarchy Priority Co",
        issuePrefix: "HPRI",
      })
      .returning();

    const [manager, reportA, reportB] = await testDb.db
      .insert(agents)
      .values([
        {
          id: "00000000-0000-4000-8000-000000000007",
          companyId: company.id,
          name: "Manager",
          role: "manager",
          adapterType: "process",
          status: "idle",
        },
        {
          id: "00000000-0000-4000-8000-000000000005",
          companyId: company.id,
          name: "Report A",
          role: "general",
          adapterType: "process",
          status: "idle",
          reportsTo: "00000000-0000-4000-8000-000000000007",
        },
        {
          id: "00000000-0000-4000-8000-000000000004",
          companyId: company.id,
          name: "Report B",
          role: "general",
          adapterType: "process",
          status: "idle",
          reportsTo: "00000000-0000-4000-8000-000000000007",
        },
      ])
      .returning();

    const [conversation] = await testDb.db
      .insert(conversations)
      .values({
        id: "33333333-3333-4333-8333-333333333333",
        companyId: company.id,
        title: "Hierarchy Wake Test",
        createdByUserId: "board-user",
        lastMessageSequence: 5,
        updatedAt: now,
      })
      .returning();

    await testDb.db.insert(conversationParticipants).values([
      {
        companyId: company.id,
        conversationId: conversation.id,
        agentId: manager.id,
        joinedAt: now,
        updatedAt: now,
      },
      {
        companyId: company.id,
        conversationId: conversation.id,
        agentId: reportA.id,
        joinedAt: now,
        updatedAt: now,
      },
      {
        companyId: company.id,
        conversationId: conversation.id,
        agentId: reportB.id,
        joinedAt: now,
        updatedAt: now,
      },
    ]);

    setMockActor({
      type: "agent",
      agentId: reportA.id,
      companyId: company.id,
    });

    const app = createTestApp(testDb.db);

    const managerMention = await request(app)
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({
        bodyMarkdown: `Looping in [@${manager.name}](${buildStructuredMentionHref("agent", manager.id)}).`,
        activeContextTargets: [],
      });

    expect(managerMention.status).toBe(201);

    await waitForAssertion(async () => {
      const wakeups = (await testDb.db.select().from(agentWakeupRequests)).filter(
        (row) =>
          row.conversationId === conversation.id &&
          row.conversationMessageSequence === 6,
      );
      expect(wakeups).toHaveLength(1);
      expect(wakeups[0]?.agentId).toBe(manager.id);

      const runs = (await testDb.db.select().from(heartbeatRuns)).filter((row) => {
        const context = (row.contextSnapshot ?? {}) as Record<string, unknown>;
        return (
          context.conversationId === conversation.id &&
          context.conversationMessageSequence === 6
        );
      });
      expect(runs).toHaveLength(1);
      expect(
        ((runs[0]?.contextSnapshot ?? {}) as Record<string, unknown>).conversationWakeLevel,
      ).toBe(3);
    });

    const peerMention = await request(app)
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({
        bodyMarkdown: `Looping in [@${reportB.name}](${buildStructuredMentionHref("agent", reportB.id)}).`,
        activeContextTargets: [],
      });

    expect(peerMention.status).toBe(201);

    await waitForAssertion(async () => {
      const wakeups = (await testDb.db.select().from(agentWakeupRequests)).filter(
        (row) =>
          row.conversationId === conversation.id &&
          row.conversationMessageSequence === 7,
      );
      expect(wakeups).toHaveLength(1);
      expect(wakeups[0]?.agentId).toBe(reportB.id);

      const runs = (await testDb.db.select().from(heartbeatRuns)).filter((row) => {
        const context = (row.contextSnapshot ?? {}) as Record<string, unknown>;
        return (
          context.conversationId === conversation.id &&
          context.conversationMessageSequence === 7
        );
      });
      expect(runs).toHaveLength(1);
      expect(
        ((runs[0]?.contextSnapshot ?? {}) as Record<string, unknown>).conversationWakeLevel,
      ).toBe(2);
    });
  });

  it("filters messages by text query with latest-window pagination", async () => {
    const fixture = await seedFixture();

    const res = await request(fixture.app)
      .get(`/api/conversations/${fixture.conversation.id}/messages`)
      .query({ q: "beta", limit: 1 });

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].sequence).toBe(4);
    expect(res.body.hasMoreBefore).toBe(true);
    expect(res.body.hasMoreAfter).toBe(false);
  });

  it("returns conversation detail with active target links", async () => {
    const fixture = await seedFixture();

    const res = await request(fixture.app)
      .get(`/api/conversations/${fixture.conversation.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(fixture.conversation.id);
    expect(res.body.participants).toHaveLength(2);
    expect(res.body.costSummary).toBeTruthy();
    expect(res.body.targetLinks).toHaveLength(4);
    expect(
      res.body.targetLinks.filter((link: { targetKind: string; targetId: string }) =>
        link.targetKind === "issue" && link.targetId === fixture.issue.id,
      ),
    ).toHaveLength(2);
    expect(
      res.body.targetLinks.find((link: { targetKind: string; targetId: string }) =>
        link.targetKind === "goal" && link.targetId === fixture.goal.id,
      )?.displayText,
    ).toBe(fixture.goal.title);
  });

  it("filters conversation detail target links to the requesting agent", async () => {
    const fixture = await seedFixture();
    setMockActor({
      type: "agent",
      agentId: fixture.agentB.id,
      companyId: fixture.company.id,
    });

    const res = await request(fixture.app)
      .get(`/api/conversations/${fixture.conversation.id}`);

    expect(res.status).toBe(200);
    expect(res.body.targetLinks).toHaveLength(1);
    expect(res.body.targetLinks[0].agentId).toBe(fixture.agentB.id);
    expect(res.body.targetLinks[0].targetKind).toBe("issue");
  });

  it("filters messages by target refs", async () => {
    const fixture = await seedFixture();

    const res = await request(fixture.app)
      .get(`/api/conversations/${fixture.conversation.id}/messages`)
      .query({
        targetKind: "issue",
        targetId: fixture.issue.id,
        limit: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].sequence).toBe(4);
    expect(res.body.messages[0].refs.some((ref: { targetId: string }) => ref.targetId === fixture.issue.id)).toBe(true);
    expect(res.body.hasMoreBefore).toBe(true);
    expect(res.body.hasMoreAfter).toBe(false);
  });

  it("returns anchor-centered windows around a message", async () => {
    const fixture = await seedFixture();

    const res = await request(fixture.app)
      .get(`/api/conversations/${fixture.conversation.id}/messages`)
      .query({
        aroundMessageId: fixture.messageBySequence.get(3)!.id,
        before: 1,
        after: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.messages.map((message: { sequence: number }) => message.sequence)).toEqual([2, 3, 4]);
    expect(res.body.hasMoreBefore).toBe(true);
    expect(res.body.hasMoreAfter).toBe(true);
  });

  it("lists linked conversations for issue, goal, and project targets", async () => {
    const fixture = await seedFixture();

    const [issueRes, goalRes, projectRes] = await Promise.all([
      request(fixture.app).get(`/api/issues/${fixture.issue.id}/linked-conversations`),
      request(fixture.app).get(`/api/goals/${fixture.goal.id}/linked-conversations`),
      request(fixture.app).get(`/api/projects/${fixture.project.id}/linked-conversations`),
    ]);

    expect(issueRes.status).toBe(200);
    expect(goalRes.status).toBe(200);
    expect(projectRes.status).toBe(200);

    expect(issueRes.body).toHaveLength(1);
    expect(goalRes.body).toHaveLength(1);
    expect(projectRes.body).toHaveLength(1);
    expect(issueRes.body[0].id).toBe(fixture.conversation.id);
    expect(goalRes.body[0].id).toBe(fixture.conversation.id);
    expect(projectRes.body[0].id).toBe(fixture.conversation.id);
  });

  it("updates target links and memory for all participants on self-authored target-stamped messages without agent refs", async () => {
    const fixture = await seedFixture();
    setMockActor({
      type: "agent",
      agentId: fixture.agentA.id,
      companyId: fixture.company.id,
    });

    const res = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: "Captured this issue in active context.",
        activeContextTargets: [
          {
            targetKind: "issue",
            targetId: fixture.issue.id,
            displayText: fixture.issue.identifier ?? fixture.issue.title,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.sequence).toBe(6);

    await waitForAssertion(async () => {
      const issueLinks = (await testDb.db.select().from(conversationTargetLinks)).filter(
        (row) =>
          row.conversationId === fixture.conversation.id &&
          row.targetKind === "issue" &&
          row.targetId === fixture.issue.id,
      );
      expect(
        issueLinks.map((row) => ({
          agentId: row.agentId,
          latestLinkedMessageSequence: row.latestLinkedMessageSequence,
        })),
      ).toEqual(
        expect.arrayContaining([
          {
            agentId: fixture.agentA.id,
            latestLinkedMessageSequence: 6,
          },
          {
            agentId: fixture.agentB.id,
            latestLinkedMessageSequence: 6,
          },
        ]),
      );

      const issueMemoryRows = (await testDb.db.select().from(agentTargetConversationMemory)).filter(
        (row) => row.targetKind === "issue" && row.targetId === fixture.issue.id,
      );
      expect(issueMemoryRows.map((row) => row.agentId).sort()).toEqual(
        [fixture.agentA.id, fixture.agentB.id].sort(),
      );
      expect(issueMemoryRows.every((row) => row.lastSourceMessageSequence === 6)).toBe(true);
    });
  });

  it("updates target links and memory for all routed agents including the author when agent refs are present", async () => {
    const fixture = await seedFixture();
    setMockActor({
      type: "agent",
      agentId: fixture.agentA.id,
      companyId: fixture.company.id,
    });

    const res = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: `Routing to [@${fixture.agentA.name}](${buildStructuredMentionHref("agent", fixture.agentA.id)}) only.`,
        activeContextTargets: [
          {
            targetKind: "issue",
            targetId: fixture.issue.id,
            displayText: fixture.issue.identifier ?? fixture.issue.title,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.sequence).toBe(6);

    await waitForAssertion(async () => {
      const issueLinks = (await testDb.db.select().from(conversationTargetLinks)).filter(
        (row) =>
          row.conversationId === fixture.conversation.id &&
          row.targetKind === "issue" &&
          row.targetId === fixture.issue.id,
      );
      const authorLink = issueLinks.find((row) => row.agentId === fixture.agentA.id);
      const otherLink = issueLinks.find((row) => row.agentId === fixture.agentB.id);
      expect(authorLink?.latestLinkedMessageSequence).toBe(6);
      expect(otherLink?.latestLinkedMessageSequence).toBe(4);

      const issueMemoryRows = (await testDb.db.select().from(agentTargetConversationMemory)).filter(
        (row) => row.targetKind === "issue" && row.targetId === fixture.issue.id,
      );
      expect(issueMemoryRows).toHaveLength(1);
      expect(issueMemoryRows[0]?.agentId).toBe(fixture.agentA.id);
      expect(issueMemoryRows[0]?.lastSourceMessageSequence).toBe(6);
    });
  });

  it("samples level 3 board-authored messages without agent mentions", async () => {
    const fixture = await seedFixture();

    const res = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: "Please review and respond with your latest thinking.",
        activeContextTargets: [],
      });

    expect(res.status).toBe(201);

    await waitForAssertion(async () => {
      const wakeups = (await testDb.db.select().from(agentWakeupRequests)).filter(
        (row) =>
          row.conversationId === fixture.conversation.id &&
          row.conversationMessageSequence === 6,
      );

      expect(wakeups.map((row) => row.agentId)).toEqual([fixture.agentB.id]);
      expect(wakeups.every((row) => row.responseMode === "optional")).toBe(true);

      const runs = (await testDb.db.select().from(heartbeatRuns)).filter((row) => {
        const context = (row.contextSnapshot ?? {}) as Record<string, unknown>;
        return (
          context.conversationId === fixture.conversation.id &&
          context.conversationMessageSequence === 6
        );
      });

      expect(runs).toHaveLength(1);
      expect(
        runs.every((row) => {
          const context = (row.contextSnapshot ?? {}) as Record<string, unknown>;
          return context.conversationWakeLevel === 3;
        }),
      ).toBe(true);
    });
  });

  it("does not auto-wake other agents for level 3 agent-authored messages", async () => {
    const fixture = await seedFixture();
    setMockActor({
      type: "agent",
      agentId: fixture.agentA.id,
      companyId: fixture.company.id,
    });

    const res = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: "Status update: I finished my pass and added notes above.",
        activeContextTargets: [],
      });

    expect(res.status).toBe(201);

    await waitForConversationMessagePostedActivity(fixture.conversation.id);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const wakeups = (await testDb.db.select().from(agentWakeupRequests)).filter(
      (row) =>
        row.conversationId === fixture.conversation.id &&
        row.conversationMessageSequence === 6,
    );

    expect(wakeups).toHaveLength(0);
  });

  it("wakes only the explicitly mentioned agent at level 1 for board-authored handoffs", async () => {
    const fixture = await seedFixture();

    const res = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: `Please take point here [@${fixture.agentB.name}](${buildStructuredMentionHref("agent", fixture.agentB.id)}).`,
        activeContextTargets: [],
      });

    expect(res.status).toBe(201);

    await waitForAssertion(async () => {
      const wakeups = (await testDb.db.select().from(agentWakeupRequests)).filter(
        (row) =>
          row.conversationId === fixture.conversation.id &&
          row.conversationMessageSequence === 6,
      );

      expect(wakeups).toHaveLength(1);
      expect(wakeups[0]?.agentId).toBe(fixture.agentB.id);
      expect(wakeups[0]?.responseMode).toBe("optional");

      const runs = (await testDb.db.select().from(heartbeatRuns)).filter((row) => {
        const context = (row.contextSnapshot ?? {}) as Record<string, unknown>;
        return (
          context.conversationId === fixture.conversation.id &&
          context.conversationMessageSequence === 6
        );
      });

      expect(runs).toHaveLength(1);
      expect(
        ((runs[0]?.contextSnapshot ?? {}) as Record<string, unknown>).conversationWakeLevel,
      ).toBe(1);
    });
  });

  it("samples level 2 agent-authored mentions", async () => {
    const fixture = await seedFixture();
    setMockActor({
      type: "agent",
      agentId: fixture.agentA.id,
      companyId: fixture.company.id,
    });

    const res = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: `Looping in [@${fixture.agentB.name}](${buildStructuredMentionHref("agent", fixture.agentB.id)}) for the next step.`,
        activeContextTargets: [],
      });

    expect(res.status).toBe(201);

    await waitForAssertion(async () => {
      const wakeups = (await testDb.db.select().from(agentWakeupRequests)).filter(
        (row) =>
          row.conversationId === fixture.conversation.id &&
          row.conversationMessageSequence === 6,
      );

      expect(wakeups).toHaveLength(1);
      expect(wakeups[0]?.agentId).toBe(fixture.agentB.id);
      expect(wakeups[0]?.responseMode).toBe("optional");

      const runs = (await testDb.db.select().from(heartbeatRuns)).filter((row) => {
        const context = (row.contextSnapshot ?? {}) as Record<string, unknown>;
        return (
          context.conversationId === fixture.conversation.id &&
          context.conversationMessageSequence === 6
        );
      });

      expect(runs).toHaveLength(1);
      expect(
        ((runs[0]?.contextSnapshot ?? {}) as Record<string, unknown>).conversationWakeLevel,
      ).toBe(2);
    });
  });

  it("wakes only the replied-to agent when a board reply targets an agent-authored message", async () => {
    const fixture = await seedFixture();
    const [agentMessage] = await testDb.db
      .insert(conversationMessages)
      .values({
        companyId: fixture.company.id,
        conversationId: fixture.conversation.id,
        sequence: 6,
        authorType: "agent",
        authorAgentId: fixture.agentA.id,
        bodyMarkdown: "Please reply with any follow-up questions here.",
        createdAt: new Date("2026-03-18T12:06:00.000Z"),
        updatedAt: new Date("2026-03-18T12:06:00.000Z"),
      })
      .returning();

    await testDb.db
      .update(conversations)
      .set({
        lastMessageSequence: 6,
        updatedAt: new Date("2026-03-18T12:06:00.000Z"),
      })
      .where(eq(conversations.id, fixture.conversation.id));

    const res = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: "Please expand on the proposed fix.",
        parentId: agentMessage.id,
        activeContextTargets: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.sequence).toBe(7);
    expect(res.body.parentId).toBe(agentMessage.id);
    expect(res.body.parentMessage).toMatchObject({
      id: agentMessage.id,
      sequence: 6,
      authorType: "agent",
      authorAgentId: fixture.agentA.id,
      bodyMarkdown: "Please reply with any follow-up questions here.",
    });

    await waitForAssertion(async () => {
      const wakeups = (await testDb.db.select().from(agentWakeupRequests)).filter(
        (row) =>
          row.conversationId === fixture.conversation.id &&
          row.conversationMessageSequence === 7,
      );

      expect(wakeups).toHaveLength(1);
      expect(wakeups[0]?.agentId).toBe(fixture.agentA.id);
      expect(wakeups[0]?.responseMode).toBe("optional");

      const runs = (await testDb.db.select().from(heartbeatRuns)).filter((row) => {
        const context = (row.contextSnapshot ?? {}) as Record<string, unknown>;
        return (
          context.conversationId === fixture.conversation.id &&
          context.conversationMessageSequence === 7
        );
      });

      expect(runs).toHaveLength(1);
      expect(
        ((runs[0]?.contextSnapshot ?? {}) as Record<string, unknown>).conversationWakeLevel,
      ).toBe(2);
    });
  });

  it("does not auto-wake peers for an agent reply-to-human thread reply without mentions", async () => {
    const fixture = await seedFixture();
    const now = new Date("2026-03-18T12:05:00.000Z");
    const [agentC] = await testDb.db
      .insert(agents)
      .values({
        id: "00000000-0000-4000-8000-000000000007",
        companyId: fixture.company.id,
        name: "Agent C",
        role: "general",
        adapterType: "process",
        status: "idle",
      })
      .returning();

    await testDb.db.insert(conversationParticipants).values({
      companyId: fixture.company.id,
      conversationId: fixture.conversation.id,
      agentId: agentC.id,
      joinedAt: now,
      updatedAt: now,
    });

    const [humanMessage] = await testDb.db
      .insert(conversationMessages)
      .values({
        companyId: fixture.company.id,
        conversationId: fixture.conversation.id,
        sequence: 6,
        authorType: "user",
        authorUserId: "board-user",
        bodyMarkdown: "Agent B, can you take the next pass on this?",
        createdAt: new Date("2026-03-18T12:06:00.000Z"),
        updatedAt: new Date("2026-03-18T12:06:00.000Z"),
      })
      .returning();

    await testDb.db
      .update(conversations)
      .set({
        lastMessageSequence: 6,
        updatedAt: new Date("2026-03-18T12:06:00.000Z"),
      })
      .where(eq(conversations.id, fixture.conversation.id));

    setMockActor({
      type: "agent",
      agentId: fixture.agentB.id,
      companyId: fixture.company.id,
    });

    const res = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: "Taking it from here.",
        parentId: humanMessage.id,
        activeContextTargets: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.parentId).toBe(humanMessage.id);

    await waitForConversationMessagePostedActivity(fixture.conversation.id);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const wakeups = (await testDb.db.select().from(agentWakeupRequests)).filter(
      (row) =>
        row.conversationId === fixture.conversation.id &&
        row.conversationMessageSequence === 7,
    );

    expect(wakeups).toHaveLength(0);
  });

  it("stops creating new wakes once the current human-to-human turn has at least one message per participant", async () => {
    const fixture = await seedFixture();
    const now = new Date("2026-03-18T12:05:00.000Z");
    const [agentC] = await testDb.db
      .insert(agents)
      .values({
        id: "00000000-0000-4000-8000-000000000021",
        companyId: fixture.company.id,
        name: "Agent C",
        role: "general",
        adapterType: "process",
        status: "idle",
      })
      .returning();

    await testDb.db.insert(conversationParticipants).values({
      companyId: fixture.company.id,
      conversationId: fixture.conversation.id,
      agentId: agentC.id,
      joinedAt: now,
      updatedAt: now,
    });

    await testDb.db
      .insert(conversationMessages)
      .values([
        {
          companyId: fixture.company.id,
          conversationId: fixture.conversation.id,
          sequence: 6,
          authorType: "user",
          authorUserId: "board-user",
          bodyMarkdown: "Team, please discuss the current tradeoffs.",
          createdAt: new Date("2026-03-18T12:06:00.000Z"),
          updatedAt: new Date("2026-03-18T12:06:00.000Z"),
        },
        {
          companyId: fixture.company.id,
          conversationId: fixture.conversation.id,
          sequence: 7,
          authorType: "agent",
          authorAgentId: fixture.agentA.id,
          bodyMarkdown: "First pass from Agent A.",
          createdAt: new Date("2026-03-18T12:07:00.000Z"),
          updatedAt: new Date("2026-03-18T12:07:00.000Z"),
        },
        {
          companyId: fixture.company.id,
          conversationId: fixture.conversation.id,
          sequence: 8,
          authorType: "agent",
          authorAgentId: fixture.agentB.id,
          bodyMarkdown: "Second pass from Agent B.",
          createdAt: new Date("2026-03-18T12:08:00.000Z"),
          updatedAt: new Date("2026-03-18T12:08:00.000Z"),
        },
        {
          companyId: fixture.company.id,
          conversationId: fixture.conversation.id,
          sequence: 9,
          authorType: "agent",
          authorAgentId: agentC.id,
          bodyMarkdown: "Third pass from Agent C.",
          createdAt: new Date("2026-03-18T12:09:00.000Z"),
          updatedAt: new Date("2026-03-18T12:09:00.000Z"),
        },
      ]);

    await testDb.db
      .update(conversations)
      .set({
        lastMessageSequence: 9,
        updatedAt: new Date("2026-03-18T12:09:00.000Z"),
      })
      .where(eq(conversations.id, fixture.conversation.id));

    setMockActor({
      type: "agent",
      agentId: fixture.agentA.id,
      companyId: fixture.company.id,
    });

    const res = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: `Looping in [@${fixture.agentB.name}](${buildStructuredMentionHref("agent", fixture.agentB.id)}) even though the turn budget is exhausted.`,
        activeContextTargets: [],
      });

    expect(res.status).toBe(201);

    await waitForConversationMessagePostedActivity(fixture.conversation.id);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const wakeups = (await testDb.db.select().from(agentWakeupRequests)).filter(
      (row) =>
        row.conversationId === fixture.conversation.id &&
        row.conversationMessageSequence === 10,
    );

    expect(wakeups).toHaveLength(0);
  });

  it("samples level 3 agent-authored replies", async () => {
    const fixture = await seedFixture();
    const [agentMessage] = await testDb.db
      .insert(conversationMessages)
      .values({
        companyId: fixture.company.id,
        conversationId: fixture.conversation.id,
        sequence: 6,
        authorType: "agent",
        authorAgentId: fixture.agentB.id,
        bodyMarkdown: "Can you respond directly in this thread?",
        createdAt: new Date("2026-03-18T12:06:00.000Z"),
        updatedAt: new Date("2026-03-18T12:06:00.000Z"),
      })
      .returning();

    await testDb.db
      .update(conversations)
      .set({
        lastMessageSequence: 6,
        updatedAt: new Date("2026-03-18T12:06:00.000Z"),
      })
      .where(eq(conversations.id, fixture.conversation.id));

    setMockActor({
      type: "agent",
      agentId: fixture.agentA.id,
      companyId: fixture.company.id,
    });

    const res = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: "Replying here with my follow-up.",
        parentId: agentMessage.id,
        activeContextTargets: [],
      });

    expect(res.status).toBe(201);

    await waitForAssertion(async () => {
      const wakeups = (await testDb.db.select().from(agentWakeupRequests)).filter(
        (row) =>
          row.conversationId === fixture.conversation.id &&
          row.conversationMessageSequence === 7,
      );

      expect(wakeups).toHaveLength(1);
      expect(wakeups[0]?.agentId).toBe(fixture.agentB.id);
      expect(wakeups[0]?.responseMode).toBe("optional");

      const runs = (await testDb.db.select().from(heartbeatRuns)).filter((row) => {
        const context = (row.contextSnapshot ?? {}) as Record<string, unknown>;
        return (
          context.conversationId === fixture.conversation.id &&
          context.conversationMessageSequence === 7
        );
      });

      expect(runs).toHaveLength(1);
      expect(
        ((runs[0]?.contextSnapshot ?? {}) as Record<string, unknown>).conversationWakeLevel,
      ).toBe(3);
    });
  });

  it("keeps an agent reply top-level when parentId is omitted after a direct mention", async () => {
    const fixture = await seedFixture();
    const [mentionMessage] = await testDb.db
      .insert(conversationMessages)
      .values({
        companyId: fixture.company.id,
        conversationId: fixture.conversation.id,
        sequence: 6,
        authorType: "user",
        authorUserId: "board-user",
        bodyMarkdown: `Please take this next pass [@${fixture.agentB.name}](${buildStructuredMentionHref("agent", fixture.agentB.id)}).`,
        createdAt: new Date("2026-03-18T12:06:00.000Z"),
        updatedAt: new Date("2026-03-18T12:06:00.000Z"),
      })
      .returning();

    await testDb.db
      .update(conversations)
      .set({
        lastMessageSequence: 6,
        updatedAt: new Date("2026-03-18T12:06:00.000Z"),
      })
      .where(eq(conversations.id, fixture.conversation.id));

    const [run] = await testDb.db
      .insert(heartbeatRuns)
      .values({
        companyId: fixture.company.id,
        agentId: fixture.agentB.id,
        invocationSource: "wakeup",
        status: "running",
        startedAt: new Date("2026-03-18T12:06:10.000Z"),
        contextSnapshot: {
          conversationId: fixture.conversation.id,
          conversationMessageId: mentionMessage.id,
          conversationMessageSequence: 6,
          conversationResponseMode: "required",
        },
      })
      .returning();

    setMockActor({
      type: "agent",
      agentId: fixture.agentB.id,
      companyId: fixture.company.id,
      runId: run.id,
    });

    const res = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: "I picked it up and I'm posting my follow-up in thread.",
        activeContextTargets: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.sequence).toBe(7);
    expect(res.body.runId).toBe(run.id);
    expect(res.body.parentId).toBeNull();
    expect(res.body.parentMessage).toBeNull();
  });

  it("keeps an agent reply top-level when parentId is omitted for a mention inside a thread", async () => {
    const fixture = await seedFixture();
    const [rootMessage] = await testDb.db
      .insert(conversationMessages)
      .values({
        companyId: fixture.company.id,
        conversationId: fixture.conversation.id,
        sequence: 6,
        authorType: "user",
        authorUserId: "board-user",
        bodyMarkdown: "Initial thread starter.",
        createdAt: new Date("2026-03-18T12:06:00.000Z"),
        updatedAt: new Date("2026-03-18T12:06:00.000Z"),
      })
      .returning();

    const [replyHandoffMessage] = await testDb.db
      .insert(conversationMessages)
      .values({
        companyId: fixture.company.id,
        conversationId: fixture.conversation.id,
        sequence: 7,
        parentId: rootMessage.id,
        authorType: "agent",
        authorAgentId: fixture.agentA.id,
        bodyMarkdown: `Please take the next pass [@${fixture.agentB.name}](${buildStructuredMentionHref("agent", fixture.agentB.id)}).`,
        createdAt: new Date("2026-03-18T12:07:00.000Z"),
        updatedAt: new Date("2026-03-18T12:07:00.000Z"),
      })
      .returning();

    await testDb.db
      .update(conversations)
      .set({
        lastMessageSequence: 7,
        updatedAt: new Date("2026-03-18T12:07:00.000Z"),
      })
      .where(eq(conversations.id, fixture.conversation.id));

    const [run] = await testDb.db
      .insert(heartbeatRuns)
      .values({
        companyId: fixture.company.id,
        agentId: fixture.agentB.id,
        invocationSource: "wakeup",
        status: "running",
        startedAt: new Date("2026-03-18T12:07:10.000Z"),
        contextSnapshot: {
          conversationId: fixture.conversation.id,
          conversationMessageId: replyHandoffMessage.id,
          conversationMessageSequence: 7,
          conversationResponseMode: "required",
          conversationReplyToMessageId: rootMessage.id,
        },
      })
      .returning();

    setMockActor({
      type: "agent",
      agentId: fixture.agentB.id,
      companyId: fixture.company.id,
      runId: run.id,
    });

    const res = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: "Handled. Posting this back under the threaded handoff message.",
        activeContextTargets: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.sequence).toBe(8);
    expect(res.body.runId).toBe(run.id);
    expect(res.body.parentId).toBeNull();
    expect(res.body.parentMessage).toBeNull();
  });

  it("includes candidate anchor context so a mentioned agent can choose what to reply to", async () => {
    const fixture = await seedFixture();
    const [contextMessage] = await testDb.db
      .insert(conversationMessages)
      .values({
        companyId: fixture.company.id,
        conversationId: fixture.conversation.id,
        sequence: 6,
        authorType: "user",
        authorUserId: "board-user",
        bodyMarkdown: "Please review the earlier proposal and call out the sharpest risks.",
        createdAt: new Date("2026-03-18T12:06:00.000Z"),
        updatedAt: new Date("2026-03-18T12:06:00.000Z"),
      })
      .returning();

    await testDb.db
      .update(conversations)
      .set({
        lastMessageSequence: 6,
        updatedAt: new Date("2026-03-18T12:06:00.000Z"),
      })
      .where(eq(conversations.id, fixture.conversation.id));

    const res = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: `[@${fixture.agentB.name}](${buildStructuredMentionHref("agent", fixture.agentB.id)})`,
        activeContextTargets: [],
      });

    expect(res.status).toBe(201);

    await waitForAssertion(async () => {
      const runs = (await testDb.db.select().from(heartbeatRuns)).filter((row) => {
        const context = (row.contextSnapshot ?? {}) as Record<string, unknown>;
        return (
          context.conversationId === fixture.conversation.id &&
          context.conversationMessageSequence === 7
        );
      });

      expect(runs).toHaveLength(1);
      const context = (runs[0]?.contextSnapshot ?? {}) as Record<string, unknown>;
      const replyContextMarkdown = String(context.conversationReplyContextMarkdown ?? "");

      expect(replyContextMarkdown).toContain("Choose `parentId` yourself");
      expect(replyContextMarkdown).toContain(`- Message ID: ${res.body.id}`);
      expect(replyContextMarkdown).toContain(`#6 | ${contextMessage.id} | Board`);
      expect(replyContextMarkdown).toContain(contextMessage.bodyMarkdown);
    });
  });

  it("allows an agent to explicitly reply in-thread by sending parentId", async () => {
    const fixture = await seedFixture();
    const [mentionMessage] = await testDb.db
      .insert(conversationMessages)
      .values({
        companyId: fixture.company.id,
        conversationId: fixture.conversation.id,
        sequence: 6,
        authorType: "user",
        authorUserId: "board-user",
        bodyMarkdown: `Please take this next pass [@${fixture.agentB.name}](${buildStructuredMentionHref("agent", fixture.agentB.id)}).`,
        createdAt: new Date("2026-03-18T12:06:00.000Z"),
        updatedAt: new Date("2026-03-18T12:06:00.000Z"),
      })
      .returning();

    await testDb.db
      .update(conversations)
      .set({
        lastMessageSequence: 6,
        updatedAt: new Date("2026-03-18T12:06:00.000Z"),
      })
      .where(eq(conversations.id, fixture.conversation.id));

    const [run] = await testDb.db
      .insert(heartbeatRuns)
      .values({
        companyId: fixture.company.id,
        agentId: fixture.agentB.id,
        invocationSource: "wakeup",
        status: "running",
        startedAt: new Date("2026-03-18T12:06:10.000Z"),
        contextSnapshot: {
          conversationId: fixture.conversation.id,
          conversationMessageId: mentionMessage.id,
          conversationMessageSequence: 6,
          conversationResponseMode: "required",
        },
      })
      .returning();

    setMockActor({
      type: "agent",
      agentId: fixture.agentB.id,
      companyId: fixture.company.id,
      runId: run.id,
    });

    const res = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: "I'm intentionally replying in-thread for extra detail.",
        parentId: mentionMessage.id,
        activeContextTargets: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.sequence).toBe(7);
    expect(res.body.parentId).toBe(mentionMessage.id);
    expect(res.body.parentMessage).toMatchObject({
      id: mentionMessage.id,
      sequence: 6,
      authorType: "user",
      authorUserId: "board-user",
      bodyMarkdown: mentionMessage.bodyMarkdown,
    });
  });

  it("tombstones deleted messages and recomputes linked target state from remaining messages", async () => {
    const fixture = await seedFixture();

    const createRes = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: "Fresh issue update for the linked thread.",
        activeContextTargets: [
          {
            targetKind: "issue",
            targetId: fixture.issue.id,
            displayText: fixture.issue.identifier ?? fixture.issue.title,
          },
        ],
      });

    expect(createRes.status).toBe(201);

    const deleteRes = await request(fixture.app)
      .delete(`/api/conversations/${fixture.conversation.id}/messages/${createRes.body.id}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({ messageId: createRes.body.id });

    const deletedRow = await testDb.db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, createRes.body.id))
      .then((rows) => rows[0] ?? null);
    expect(deletedRow?.bodyMarkdown).toBe("");
    expect(deletedRow?.deletedAt).toBeTruthy();

    const remainingRefs = (await testDb.db.select().from(conversationMessageRefs)).filter(
      (row) => row.messageId === createRes.body.id,
    );
    expect(remainingRefs).toHaveLength(0);

    const issueLinks = (await testDb.db.select().from(conversationTargetLinks)).filter(
      (row) =>
        row.conversationId === fixture.conversation.id &&
        row.targetKind === "issue" &&
        row.targetId === fixture.issue.id,
    );
    expect(
      issueLinks.map((row) => ({
        agentId: row.agentId,
        latestLinkedMessageSequence: row.latestLinkedMessageSequence,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          agentId: fixture.agentA.id,
          latestLinkedMessageSequence: 4,
        },
        {
          agentId: fixture.agentB.id,
          latestLinkedMessageSequence: 4,
        },
      ]),
    );

    const detailRes = await request(fixture.app).get(`/api/conversations/${fixture.conversation.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.latestMessageSequence).toBe(5);

    const messagesRes = await request(fixture.app)
      .get(`/api/conversations/${fixture.conversation.id}/messages`)
      .query({ limit: 10 });
    expect(messagesRes.status).toBe(200);

    const tombstonedMessage = messagesRes.body.messages.find(
      (message: { id: string }) => message.id === createRes.body.id,
    );
    expect(tombstonedMessage).toMatchObject({
      id: createRes.body.id,
      sequence: 6,
      bodyMarkdown: "",
    });
    expect(tombstonedMessage?.deletedAt).toBeTruthy();
  });

  it("drops unread counts when another human's unread message is tombstone-deleted", async () => {
    const fixture = await seedFixture();

    setMockActor({
      type: "board",
      userId: "board-user-2",
      companyIds: [fixture.company.id],
      source: "session",
      isInstanceAdmin: false,
    });

    const markReadRes = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/read`)
      .send({ lastReadSequence: 5 });
    expect(markReadRes.status).toBe(200);

    setMockActor({
      type: "board",
      userId: "board-user",
      companyIds: [fixture.company.id],
      source: "session",
      isInstanceAdmin: false,
    });

    const createRes = await request(fixture.app)
      .post(`/api/conversations/${fixture.conversation.id}/messages`)
      .send({
        bodyMarkdown: "Human follow-up that will be deleted.",
        activeContextTargets: [],
      });
    expect(createRes.status).toBe(201);

    setMockActor({
      type: "board",
      userId: "board-user-2",
      companyIds: [fixture.company.id],
      source: "session",
      isInstanceAdmin: false,
    });

    const unreadBeforeDelete = await request(fixture.app)
      .get(`/api/companies/${fixture.company.id}/conversations`);
    expect(unreadBeforeDelete.status).toBe(200);
    expect(unreadBeforeDelete.body[0]?.unreadCount).toBe(1);
    expect(unreadBeforeDelete.body[0]?.latestMessageSequence).toBe(6);

    setMockActor({
      type: "board",
      userId: "board-user",
      companyIds: [fixture.company.id],
      source: "session",
      isInstanceAdmin: false,
    });

    const deleteRes = await request(fixture.app)
      .delete(`/api/conversations/${fixture.conversation.id}/messages/${createRes.body.id}`);
    expect(deleteRes.status).toBe(200);

    setMockActor({
      type: "board",
      userId: "board-user-2",
      companyIds: [fixture.company.id],
      source: "session",
      isInstanceAdmin: false,
    });

    const unreadAfterDelete = await request(fixture.app)
      .get(`/api/companies/${fixture.company.id}/conversations`);
    expect(unreadAfterDelete.status).toBe(200);
    expect(unreadAfterDelete.body[0]?.unreadCount).toBe(0);
    expect(unreadAfterDelete.body[0]?.latestMessageSequence).toBe(5);
  });
});
