import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { goals } from "@paperclipai/db";
import type { ListGoalsQuery } from "@paperclipai/shared";

type GoalReader = Pick<Db, "select">;
const GOAL_SEARCH_LIMIT_DEFAULT = 20;

function compareAlphabetically(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function normalizeGoalListQuery(input?: ListGoalsQuery | null) {
  const q =
    typeof input?.q === "string" && input.q.trim().length > 0
      ? input.q.trim()
      : null;
  const limit = Math.max(
    1,
    Math.min(
      GOAL_SEARCH_LIMIT_DEFAULT,
      Math.floor(input?.limit ?? GOAL_SEARCH_LIMIT_DEFAULT)
    )
  );
  return { q, limit };
}

function sortGoalsForSearch(
  rows: typeof goals.$inferSelect[],
  normalizedQuery: string
) {
  return [...rows].sort((left, right) => {
    const leftPrefix = left.title.toLowerCase().startsWith(normalizedQuery);
    const rightPrefix = right.title.toLowerCase().startsWith(normalizedQuery);
    if (leftPrefix !== rightPrefix) return leftPrefix ? -1 : 1;

    const titleOrder = compareAlphabetically(left.title, right.title);
    if (titleOrder !== 0) return titleOrder;

    return left.id.localeCompare(right.id);
  });
}

export async function getDefaultCompanyGoal(db: GoalReader, companyId: string) {
  const activeRootGoal = await db
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.companyId, companyId),
        eq(goals.level, "company"),
        eq(goals.status, "active"),
        isNull(goals.parentId),
      ),
    )
    .orderBy(asc(goals.createdAt))
    .then((rows) => rows[0] ?? null);
  if (activeRootGoal) return activeRootGoal;

  const anyRootGoal = await db
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.companyId, companyId),
        eq(goals.level, "company"),
        isNull(goals.parentId),
      ),
    )
    .orderBy(asc(goals.createdAt))
    .then((rows) => rows[0] ?? null);
  if (anyRootGoal) return anyRootGoal;

  return db
    .select()
    .from(goals)
    .where(and(eq(goals.companyId, companyId), eq(goals.level, "company")))
    .orderBy(asc(goals.createdAt))
    .then((rows) => rows[0] ?? null);
}

export function goalService(db: Db) {
  return {
    list: async (companyId: string, input?: ListGoalsQuery | null) => {
      const { q, limit } = normalizeGoalListQuery(input);
      const rows = await db
        .select()
        .from(goals)
        .where(eq(goals.companyId, companyId));

      if (!q) {
        return rows;
      }

      const normalizedQuery = q.toLowerCase();
      const matching = rows.filter((row) =>
        row.title.toLowerCase().includes(normalizedQuery)
      );
      return sortGoalsForSearch(matching, normalizedQuery).slice(0, limit);
    },

    getById: (id: string) =>
      db
        .select()
        .from(goals)
        .where(eq(goals.id, id))
        .then((rows) => rows[0] ?? null),

    getDefaultCompanyGoal: (companyId: string) => getDefaultCompanyGoal(db, companyId),

    create: (companyId: string, data: Omit<typeof goals.$inferInsert, "companyId">) =>
      db
        .insert(goals)
        .values({ ...data, companyId })
        .returning()
        .then((rows) => rows[0]),

    update: (id: string, data: Partial<typeof goals.$inferInsert>) =>
      db
        .update(goals)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(goals.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    remove: (id: string) =>
      db
        .delete(goals)
        .where(eq(goals.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),
  };
}
