import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getTestDb, cleanDb, type TestDb } from "../helpers/test-db.js";
import { goalService } from "../../services/goals.js";
import { companies } from "@paperclipai/db";
import { randomUUID } from "node:crypto";

describe("goalService", () => {
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
      .values({ name: "Goal Co", issuePrefix: `G${randomUUID().slice(0, 4).toUpperCase()}` })
      .returning();
    companyId = co.id;
  });

  function svc() {
    return goalService(testDb.db);
  }

  // ── create ────────────────────────────────────────────────────────────

  describe("create", () => {
    it("creates a goal", async () => {
      const goal = await svc().create(companyId, {
        title: "Ship v1",
        description: "Launch the product",
      });
      expect(goal).toBeDefined();
      expect(goal.title).toBe("Ship v1");
      expect(goal.companyId).toBe(companyId);
    });
  });

  // ── list ──────────────────────────────────────────────────────────────

  describe("list", () => {
    it("lists goals for company", async () => {
      await svc().create(companyId, { title: "Goal 1" });
      await svc().create(companyId, { title: "Goal 2" });
      const all = await svc().list(companyId);
      expect(all.length).toBe(2);
    });

    it("uses title-only matching with prefix-first ordering and applies limit after sorting", async () => {
      await svc().create(companyId, {
        title: "Roadmap",
        description: "launch mention in description only",
      });
      await svc().create(companyId, { title: "Relaunch Beta" });
      await svc().create(companyId, { title: "launch tools" });
      await svc().create(companyId, { title: "Launch Alpha" });

      const rows = await svc().list(companyId, { q: "  launch  ", limit: 2 });

      expect(rows.map((goal) => goal.title)).toEqual([
        "Launch Alpha",
        "launch tools",
      ]);
    });
  });

  // ── getById ───────────────────────────────────────────────────────────

  describe("getById", () => {
    it("returns goal when found", async () => {
      const goal = await svc().create(companyId, { title: "Find" });
      const found = await svc().getById(goal.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe("Find");
    });

    it("negative: returns null for nonexistent", async () => {
      const found = await svc().getById(randomUUID());
      expect(found).toBeNull();
    });
  });

  // ── update ────────────────────────────────────────────────────────────

  describe("update", () => {
    it("updates goal fields", async () => {
      const goal = await svc().create(companyId, { title: "Old" });
      const updated = await svc().update(goal.id, { title: "New" });
      expect(updated).not.toBeNull();
      expect(updated!.title).toBe("New");
    });

    it("negative: returns null for nonexistent", async () => {
      const updated = await svc().update(randomUUID(), { title: "X" });
      expect(updated).toBeNull();
    });
  });

  // ── remove ────────────────────────────────────────────────────────────

  describe("remove", () => {
    it("deletes goal", async () => {
      const goal = await svc().create(companyId, { title: "Delete me" });
      const removed = await svc().remove(goal.id);
      expect(removed).not.toBeNull();
      const after = await svc().getById(goal.id);
      expect(after).toBeNull();
    });

    it("negative: returns null for nonexistent", async () => {
      const removed = await svc().remove(randomUUID());
      expect(removed).toBeNull();
    });
  });
});
