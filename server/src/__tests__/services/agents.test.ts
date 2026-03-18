import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getTestDb, cleanDb, type TestDb } from "../helpers/test-db.js";
import { agentService } from "../../services/agents.js";
import { companies, agentApiKeys, agents } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";

describe("agentService", () => {
  let testDb: TestDb;
  let companyId: string;

  beforeAll(() => {
    testDb = getTestDb();
  });
  afterAll(() => testDb.close());
  beforeEach(async () => {
    await cleanDb();
    const [co] = await testDb.db
      .insert(companies)
      .values({
        name: "Test Co",
        issuePrefix: `T${randomUUID().slice(0, 4).toUpperCase()}`,
      })
      .returning();
    companyId = co.id;
  });

  function svc() {
    return agentService(testDb.db);
  }

  // ── create ────────────────────────────────────────────────────────────

  describe("create", () => {
    it("creates an agent with urlKey", async () => {
      const agent = await svc().create(companyId, {
        name: "Test Agent",
        role: "general",
        adapterType: "process",
        budgetMonthlyCents: 1000,
        spentMonthlyCents: 0,
      });
      expect(agent).toBeDefined();
      expect(agent.name).toBe("Test Agent");
      expect(agent.companyId).toBe(companyId);
      expect(agent.urlKey).toBeDefined();
    });

    it("canonicalizes legacy heartbeat wake policy keys before persisting", async () => {
      const agent = await svc().create(companyId, {
        name: "Legacy Wake Agent",
        role: "general",
        adapterType: "process",
        runtimeConfig: {
          heartbeat: {
            enabled: true,
            intervalSec: 300,
            wakeOnDemand: false,
            wakeOnAssignment: true,
          },
        },
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
      });

      expect(
        (agent.runtimeConfig as Record<string, unknown>).heartbeat
      ).toEqual({
        enabled: true,
        intervalSec: 300,
        wakeOnSignal: false,
      });

      const [stored] = await testDb.db
        .select({ runtimeConfig: agents.runtimeConfig })
        .from(agents)
        .where(eq(agents.id, agent.id));

      expect(stored).toBeDefined();
      expect((stored.runtimeConfig as Record<string, any>).heartbeat).toEqual({
        enabled: true,
        intervalSec: 300,
        wakeOnSignal: false,
      });
    });
  });

  // ── getById ───────────────────────────────────────────────────────────

  describe("getById", () => {
    it("returns agent when found", async () => {
      const agent = await svc().create(companyId, {
        name: "Findable",
        role: "general",
        adapterType: "process",
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
      });
      const found = await svc().getById(agent.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe("Findable");
    });

    it("negative: returns null for nonexistent", async () => {
      const found = await svc().getById(randomUUID());
      expect(found).toBeNull();
    });
  });

  // ── list ──────────────────────────────────────────────────────────────

  describe("list", () => {
    it("lists agents for a company excluding terminated", async () => {
      await svc().create(companyId, {
        name: "Active",
        role: "general",
        adapterType: "process",
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
      });
      const terminated = await svc().create(companyId, {
        name: "Old",
        role: "general",
        adapterType: "process",
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
      });
      await svc().terminate(terminated.id);

      const list = await svc().list(companyId);
      expect(list.length).toBe(1);
      expect(list[0].name).toBe("Active");
    });

    it("includes terminated when option set", async () => {
      const a = await svc().create(companyId, {
        name: "Bot",
        role: "general",
        adapterType: "process",
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
      });
      await svc().terminate(a.id);
      const list = await svc().list(companyId, { includeTerminated: true });
      expect(list.length).toBe(1);
    });
  });

  // ── update ────────────────────────────────────────────────────────────

  describe("update", () => {
    it("updates agent fields", async () => {
      const agent = await svc().create(companyId, {
        name: "Before",
        role: "general",
        adapterType: "process",
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
      });
      const updated = await svc().update(agent.id, { name: "After" });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("After");
    });

    it("rewrites legacy heartbeat wake policy keys to wakeOnSignal", async () => {
      const agent = await svc().create(companyId, {
        name: "Patch Me",
        role: "general",
        adapterType: "process",
        runtimeConfig: {
          heartbeat: {
            enabled: true,
            intervalSec: 300,
            wakeOnSignal: true,
          },
        },
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
      });

      const updated = await svc().update(agent.id, {
        runtimeConfig: {
          heartbeat: {
            enabled: true,
            intervalSec: 600,
            wakeOnAutomation: false,
          },
        },
      });

      expect(updated).not.toBeNull();
      expect(
        (updated!.runtimeConfig as Record<string, unknown>).heartbeat
      ).toEqual({
        enabled: true,
        intervalSec: 600,
        wakeOnSignal: false,
      });

      const [stored] = await testDb.db
        .select({ runtimeConfig: agents.runtimeConfig })
        .from(agents)
        .where(eq(agents.id, agent.id));

      expect((stored.runtimeConfig as Record<string, any>).heartbeat).toEqual({
        enabled: true,
        intervalSec: 600,
        wakeOnSignal: false,
      });
    });
  });

  // ── getChainOfCommand ─────────────────────────────────────────────────

  describe("getChainOfCommand", () => {
    it("returns chain from agent up to CEO", async () => {
      const ceo = await svc().create(companyId, {
        name: "CEO",
        role: "ceo",
        adapterType: "process",
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
      });
      const mgr = await svc().create(companyId, {
        name: "Manager",
        role: "pm",
        adapterType: "process",
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
        reportsTo: ceo.id,
      });
      const worker = await svc().create(companyId, {
        name: "Worker",
        role: "general",
        adapterType: "process",
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
        reportsTo: mgr.id,
      });

      const chain = await svc().getChainOfCommand(worker.id);
      expect(chain.length).toBe(2);
      expect(chain[0].name).toBe("Manager");
      expect(chain[1].name).toBe("CEO");
    });

    it("returns empty chain when agent has no manager", async () => {
      const solo = await svc().create(companyId, {
        name: "Solo",
        role: "general",
        adapterType: "process",
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
      });
      const chain = await svc().getChainOfCommand(solo.id);
      expect(chain.length).toBe(0);
    });
  });

  // ── shortname deduplication ───────────────────────────────────────────

  describe("shortname generation", () => {
    it("deduplicates shortnames within company", async () => {
      const a1 = await svc().create(companyId, {
        name: "Bot",
        role: "general",
        adapterType: "process",
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
      });
      const a2 = await svc().create(companyId, {
        name: "Bot",
        role: "general",
        adapterType: "process",
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
      });
      expect(a1.name).toBe("Bot");
      expect(a2.name).toBe("Bot 2");
    });
  });

  // ── createApiKey / getByApiKey ────────────────────────────────────────

  describe("createApiKey", () => {
    it("creates and can find agent by hashed key", async () => {
      const agent = await svc().create(companyId, {
        name: "Key Agent",
        role: "general",
        adapterType: "process",
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
      });
      const key = await svc().createApiKey(agent.id, "test-key");
      expect(key.token).toMatch(/^pcp_/);

      // Verify key hash exists
      const keyHash = createHash("sha256").update(key.token).digest("hex");
      const [row] = await testDb.db
        .select()
        .from(agentApiKeys)
        .where(eq(agentApiKeys.keyHash, keyHash));
      expect(row).toBeDefined();
      expect(row.agentId).toBe(agent.id);
    });
  });

  // ── negative: duplicate shortname handling ────────────────────────────

  describe("negative tests", () => {
    it("negative: cannot resume terminated agent", async () => {
      const agent = await svc().create(companyId, {
        name: "Terminated",
        role: "general",
        adapterType: "process",
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
      });
      await svc().terminate(agent.id);
      await expect(svc().resume(agent.id)).rejects.toThrow(/terminated/i);
    });
  });
});
