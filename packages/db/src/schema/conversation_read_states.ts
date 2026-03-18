import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { conversations } from "./conversations.js";

export const conversationReadStates = pgTable(
  "conversation_read_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    lastReadSequence: bigint("last_read_sequence", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyConversationIdx: index("conversation_read_states_company_conversation_idx").on(
      table.companyId,
      table.conversationId,
    ),
    companyUserIdx: index("conversation_read_states_company_user_idx")
      .on(table.companyId, table.userId)
      .where(sql`${table.userId} is not null`),
    companyAgentIdx: index("conversation_read_states_company_agent_idx")
      .on(table.companyId, table.agentId)
      .where(sql`${table.agentId} is not null`),
    companyConversationUserUq: uniqueIndex("conversation_read_states_company_conversation_user_uq")
      .on(table.companyId, table.conversationId, table.userId)
      .where(sql`${table.userId} is not null`),
    companyConversationAgentUq: uniqueIndex("conversation_read_states_company_conversation_agent_uq")
      .on(table.companyId, table.conversationId, table.agentId)
      .where(sql`${table.agentId} is not null`),
    actorCheck: check(
      "conversation_read_states_actor_check",
      sql`(
        (${table.userId} is not null and ${table.agentId} is null)
        or (${table.userId} is null and ${table.agentId} is not null)
      )`,
    ),
    lastReadSequenceCheck: check(
      "conversation_read_states_last_read_sequence_check",
      sql`${table.lastReadSequence} >= 0`,
    ),
  }),
);
