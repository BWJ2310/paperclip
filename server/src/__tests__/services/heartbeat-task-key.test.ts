import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  agents,
  companies,
  heartbeatRuns,
  issues,
} from "@paperclipai/db";
import { heartbeatService } from "../../services/heartbeat.ts";
import { cleanDb, getTestDb, type TestDb } from "../helpers/test-db.js";

describe("heartbeatService task-key cutover", () => {
  let testDb: TestDb;

  beforeAll(() => {
    testDb = getTestDb();
  });

  afterAll(() => testDb.close());

  beforeEach(async () => {
    await cleanDb();
  });

  async function seedIssueFixture() {
    const [company] = await testDb.db
      .insert(companies)
      .values({
        name: "Task Key Co",
        issuePrefix: `T${randomUUID().slice(0, 4).toUpperCase()}`,
      })
      .returning();

    const [agent] = await testDb.db
      .insert(agents)
      .values({
        companyId: company.id,
        name: "Worker",
        role: "general",
        adapterType: "process",
        status: "idle",
      })
      .returning();

    const [issue] = await testDb.db
      .insert(issues)
      .values({
        companyId: company.id,
        title: "Canonical task scope",
        status: "todo",
        priority: "medium",
      })
      .returning();

    return { company, agent, issue };
  }

  it("uses canonical taskKey as the source of truth for issue execution locking", async () => {
    const { agent, issue } = await seedIssueFixture();
    const heartbeat = heartbeatService(testDb.db);

    const run = await heartbeat.wakeup(agent.id, {
      source: "on_demand",
      triggerDetail: "manual",
      payload: {
        taskKey: `issue:${issue.id}`,
        issueId: issue.id,
        taskId: issue.id,
      },
    });

    expect(run).not.toBeNull();

    const storedRun = await testDb.db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, run!.id))
      .then((rows) => rows[0] ?? null);

    expect(storedRun).not.toBeNull();
    expect(storedRun?.contextSnapshot).toMatchObject({
      taskKey: `issue:${issue.id}`,
    });
    expect(storedRun?.contextSnapshot).not.toHaveProperty("issueId");
    expect(storedRun?.contextSnapshot).not.toHaveProperty("taskId");

    const updatedIssue = await testDb.db
      .select()
      .from(issues)
      .where(eq(issues.id, issue.id))
      .then((rows) => rows[0] ?? null);

    expect(updatedIssue?.executionRunId).toBe(run?.id ?? null);
  });

  it("does not infer issue scope from legacy issueId/taskId payloads without taskKey", async () => {
    const { agent, issue } = await seedIssueFixture();
    const heartbeat = heartbeatService(testDb.db);

    const run = await heartbeat.wakeup(agent.id, {
      source: "on_demand",
      triggerDetail: "manual",
      payload: {
        issueId: issue.id,
        taskId: issue.id,
      },
    });

    expect(run).not.toBeNull();

    const storedRun = await testDb.db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, run!.id))
      .then((rows) => rows[0] ?? null);

    expect(storedRun).not.toBeNull();
    expect(storedRun?.contextSnapshot).not.toHaveProperty("taskKey");
    expect(storedRun?.contextSnapshot).not.toHaveProperty("issueId");
    expect(storedRun?.contextSnapshot).not.toHaveProperty("taskId");

    const updatedIssue = await testDb.db
      .select()
      .from(issues)
      .where(eq(issues.id, issue.id))
      .then((rows) => rows[0] ?? null);

    expect(updatedIssue?.executionRunId).toBeNull();
  });
});
