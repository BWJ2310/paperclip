import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  agentTargetConversationMemory,
  agents,
  companies,
  conversationMessageRefs,
  conversationMessages,
  conversationParticipants,
  conversationTargetLinks,
  conversations,
  goals,
  issues,
  projects,
} from "@paperclipai/db";
import { buildStructuredMentionHref } from "@paperclipai/shared";
import { randomUUID } from "node:crypto";
import { cleanDb, getTestDb, type TestDb } from "../helpers/test-db.js";
import { createTestApp, resetMockActor, setMockActor } from "../helpers/test-app.js";

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

  afterEach(() => {
    resetMockActor();
  });

  async function seedFixture() {
    const now = new Date("2026-03-18T12:00:00.000Z");
    const [company] = await testDb.db
      .insert(companies)
      .values({
        name: "Conversation Co",
        issuePrefix: `C${randomUUID().slice(0, 4).toUpperCase()}`,
      })
      .returning();

    const [agentA, agentB] = await testDb.db
      .insert(agents)
      .values([
        {
          companyId: company.id,
          name: "Agent A",
          role: "general",
          adapterType: "process",
          status: "idle",
        },
        {
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
