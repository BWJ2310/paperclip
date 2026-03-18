import { check, index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { conversations } from "./conversations.js";

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyConversationIdx: index("conversation_participants_company_conversation_idx").on(
      table.companyId,
      table.conversationId,
    ),
    companyAgentIdx: index("conversation_participants_company_agent_idx").on(table.companyId, table.agentId),
    companyConversationAgentUq: uniqueIndex("conversation_participants_company_conversation_agent_uq").on(
      table.companyId,
      table.conversationId,
      table.agentId,
    ),
    joinedAtCheck: check("conversation_participants_joined_at_check", sql`${table.joinedAt} is not null`),
  }),
);
